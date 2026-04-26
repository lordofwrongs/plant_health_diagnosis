import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Structured logger — every entry is tagged with record_id for triage
// ---------------------------------------------------------------------------
function createLogger(recordId: string) {
  const entries: Array<{ stage: string; level: string; message: string; ts: string; duration_ms?: number }> = []
  const timers: Record<string, number> = {}

  const emit = (level: string, stage: string, message: string, extra: Record<string, unknown> = {}) => {
    const entry = { stage, level, message, ts: new Date().toISOString(), ...extra }
    entries.push(entry)
    const line = JSON.stringify({ record_id: recordId, ...entry })
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }

  return {
    info:  (stage: string, msg: string) => emit('info',  stage, msg),
    warn:  (stage: string, msg: string) => emit('warn',  stage, msg),
    error: (stage: string, msg: string, err?: unknown) => {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '')
      emit('error', stage, detail ? `${msg} | ${detail}` : msg)
    },
    startTimer: (stage: string) => { timers[stage] = Date.now() },
    endTimer: (stage: string) => {
      const duration_ms = timers[stage] ? Date.now() - timers[stage] : 0
      emit('info', stage, `Completed in ${duration_ms}ms`, { duration_ms })
      return duration_ms
    },
    getLog: () => entries,
  }
}

// ---------------------------------------------------------------------------
// fetch() with hard timeout — prevents hanging indefinitely on slow APIs
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Safely parse AI JSON — handles pre-parsed objects and markdown code fences
// ---------------------------------------------------------------------------
function parseAIJson(content: unknown): Record<string, unknown> {
  if (content !== null && typeof content === 'object') return content as Record<string, unknown>
  if (typeof content === 'string') {
    const cleaned = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
    return JSON.parse(cleaned)
  }
  throw new Error(`Unexpected AI content type: ${typeof content}`)
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  const { record } = await req.json()
  const { image_url, id: record_id, plant_nickname: nickname, user_id } = record

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const logger = createLogger(record_id)
  logger.info('init', `Pipeline started — image: ${image_url}`)

  try {
    // -----------------------------------------------------------------------
    // Preflight: fetch record metadata
    // -----------------------------------------------------------------------
    logger.startTimer('preflight')
    const { data: log, error: logError } = await supabase
      .from('plant_logs')
      .select('latitude, longitude, location_name, created_at, preferred_language')
      .eq('id', record_id)
      .single()

    if (logError) throw new Error(`Preflight DB fetch failed: ${logError.message}`)
    logger.endTimer('preflight')

    const userLang = log.preferred_language || 'English'
    logger.info('preflight', `lang=${userLang}, location=${log.location_name}`)

    // -----------------------------------------------------------------------
    // STAGE 1 — Quality Gatekeeper
    // -----------------------------------------------------------------------
    logger.startTimer('stage1_quality')
    logger.info('stage1_quality', 'Sending image for quality check')

    const qualityRes = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-001',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are an image quality validator. Always respond with valid JSON only.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Is this image clear enough to diagnose a plant\'s health? Respond ONLY with JSON: { "is_clear": boolean, "reason": string }',
                },
                { type: 'image_url', image_url: { url: image_url } },
              ],
            },
          ],
        }),
      },
      25000
    )

    if (!qualityRes.ok) {
      throw new Error(`Quality check HTTP ${qualityRes.status}: ${await qualityRes.text().then(t => t.slice(0, 200))}`)
    }

    const qualityData = await qualityRes.json()
    const rawQuality = qualityData?.choices?.[0]?.message?.content
    if (!rawQuality) throw new Error(`Quality check empty response: ${JSON.stringify(qualityData).slice(0, 300)}`)

    const quality = parseAIJson(rawQuality) as { is_clear: boolean; reason: string }
    logger.endTimer('stage1_quality')
    logger.info('stage1_quality', `is_clear=${quality.is_clear}, reason=${quality.reason}`)

    if (!quality.is_clear) {
      await supabase.from('plant_logs').update({
        status: 'done',
        HealthStatus: 'Quality Issue',
        HealthColor: '#FF5252',
        VisualAnalysis: `Analysis paused: ${quality.reason}. Please try a clearer, closer photo.`,
        AccuracyScore: 0,
        processing_log: logger.getLog(),
      }).eq('id', record_id)
      return new Response(JSON.stringify({ success: false, reason: quality.reason }))
    }

    // -----------------------------------------------------------------------
    // STAGE 2 — Context Gathering (History + Weather)
    // -----------------------------------------------------------------------
    logger.startTimer('stage2_context')
    const threshold = 0.0001

    const { data: nearbyLogs } = await supabase
      .from('plant_logs')
      .select('VisualAnalysis, HealthStatus, PlantName, created_at')
      .eq('user_id', user_id)
      .eq('status', 'done')
      .lt('created_at', log.created_at)
      .or(
        `and(latitude.gte.${log.latitude - threshold},latitude.lte.${log.latitude + threshold},longitude.gte.${log.longitude - threshold},longitude.lte.${log.longitude + threshold}),plant_nickname.eq.${nickname ? `'${nickname.replace(/'/g, "''")}'` : 'null'}`
      )
      .order('created_at', { ascending: false })
      .limit(1)

    let historyContext = 'First-time scan for this plant.'
    if (nearbyLogs && nearbyLogs.length > 0) {
      const prev = nearbyLogs[0]
      historyContext = `PREVIOUS SCAN: Plant=${prev.PlantName}, Status=${prev.HealthStatus}, Findings=${(prev.VisualAnalysis ?? '').slice(0, 200)}`
      logger.info('stage2_context', `Found previous scan: ${prev.HealthStatus} on ${prev.created_at}`)
    }

    let weatherSnippet = 'Weather data unavailable.'
    if (log.latitude && log.longitude) {
      try {
        const weatherRes = await fetchWithTimeout(
          `https://api.open-meteo.com/v1/forecast?latitude=${log.latitude}&longitude=${log.longitude}&daily=temperature_2m_max,precipitation_sum&timezone=auto&past_days=7`,
          {},
          10000
        )
        const wd = await weatherRes.json()
        const pastRain = (wd.daily?.precipitation_sum ?? []).slice(0, 7)
          .reduce((a: number, b: number | null) => a + (b ?? 0), 0)
        const futureTemps = (wd.daily?.temperature_2m_max ?? []).slice(7).filter((t: unknown) => t != null)
        const futureMax = futureTemps.length > 0 ? Math.max(...futureTemps) : null
        weatherSnippet = futureMax != null
          ? `Past 7-day rain: ${pastRain.toFixed(1)}mm. Forecast peak: ${futureMax}°C.`
          : `Past 7-day rain: ${pastRain.toFixed(1)}mm.`
        logger.info('stage2_context', `Weather: ${weatherSnippet}`)
      } catch (e) {
        logger.warn('stage2_context', `Weather fetch failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    logger.endTimer('stage2_context')

    // -----------------------------------------------------------------------
    // STAGE 3 — Main Analysis
    // NOTE: system prompt and user message MUST be separate objects in the
    // messages array. Merging them into one object causes JS duplicate-key
    // silent override — the entire prompt and image would be lost.
    // -----------------------------------------------------------------------
    logger.startTimer('stage3_analysis')
    logger.info('stage3_analysis', 'Sending image + context to AI for plant analysis')

    const analysisRes = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-001',
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                'You are a master horticultural coach with deep knowledge of regional plant names across South Asia.',
                'Always respond with valid JSON only.',
                'All keys inside vernacular_names must be lowercase.',
                'Do not wrap the response in markdown code fences.',
              ].join(' '),
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `CONTEXT:
Location: ${log.location_name}
Weather: ${weatherSnippet}
History: ${historyContext}
User Hint: "${nickname || 'None provided'}"

IDENTIFICATION RULES:
1. If a User Hint is given, prioritize it. Do not override unless botanically impossible.
2. For vernacular_names, use established traditional regional names — NOT literal translations or phonetic transliterations.
3. When a plant has a sacred/cultural substitute name used locally (e.g. Epiphyllum oxypetalum as 'Brahma Kamal'), lead with that name.

YOUR TASK:
1. Identify the plant using the image and User Hint.
2. In display_name, use the most culturally relatable name in ${userLang}.
3. Assess plant health and provide detailed care recommendations in ${userLang}.
4. If weather data indicates risk (heat stress, drought, flooding), set weather_alert. Otherwise set to null.

RESPOND WITH THIS EXACT JSON STRUCTURE:
{
  "display_name": "Culturally relatable name in ${userLang}",
  "scientific_name": "Genus species",
  "vernacular_names": {
    "english": "Common English name",
    "hindi": "Traditional Hindi name",
    "tamil": "Traditional Tamil name or None",
    "telugu": "Traditional Telugu name or None"
  },
  "confidence_score": 0.95,
  "health_status": "Health status in ${userLang}",
  "analysis": "Detailed visual analysis of plant condition in ${userLang}",
  "recovery_steps": ["Step 1 in ${userLang}", "Step 2 in ${userLang}", "Step 3 in ${userLang}"],
  "pro_tip": "Regional gardening insight for ${log.location_name} in ${userLang}",
  "weather_alert": "Climate protection advice based on weather data, or null"
}`,
                },
                { type: 'image_url', image_url: { url: image_url } },
              ],
            },
          ],
        }),
      },
      45000
    )

    if (!analysisRes.ok) {
      const body = await analysisRes.text()
      throw new Error(`Analysis API HTTP ${analysisRes.status}: ${body.slice(0, 300)}`)
    }

    const aiResponse = await analysisRes.json()
    const rawResult = aiResponse?.choices?.[0]?.message?.content
    if (!rawResult) throw new Error(`Analysis returned empty content: ${JSON.stringify(aiResponse).slice(0, 300)}`)

    const result = parseAIJson(rawResult)
    logger.endTimer('stage3_analysis')
    logger.info('stage3_analysis', `health=${result.health_status}, confidence=${result.confidence_score}`)

    // -----------------------------------------------------------------------
    // STAGE 4 — Database Update
    // -----------------------------------------------------------------------
    logger.startTimer('stage4_db')

    const rawScore = parseFloat(String(result.confidence_score ?? 0))
    const finalScore = Math.round(rawScore <= 1 ? rawScore * 100 : rawScore)
    const healthStatus = String(result.health_status ?? '')
    const healthColor = healthStatus.toLowerCase().includes('healthy') ? '#4CAF50' : '#FF9800'

    const { error: updateError } = await supabase
      .from('plant_logs')
      .update({
        PlantName: result.display_name,
        ScientificName: result.scientific_name,
        AccuracyScore: finalScore,
        HealthStatus: healthStatus,
        HealthColor: healthColor,
        VisualAnalysis: result.analysis,
        vernacular_metadata: result.vernacular_names ?? {},
        CarePlan: Array.isArray(result.recovery_steps)
          ? result.recovery_steps.map((s: unknown) => `• ${String(s)}`).join('\n')
          : String(result.recovery_steps ?? ''),
        ExpertTip: result.pro_tip,
        WeatherAlert: result.weather_alert ?? null,
        status: 'done',
        error_details: null,
        processing_log: logger.getLog(),
      })
      .eq('id', record_id)

    if (updateError) throw new Error(`DB update failed: ${updateError.message}`)
    logger.endTimer('stage4_db')
    logger.info('stage4_db', 'Pipeline complete — record marked done')

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error('pipeline', 'Fatal error — marking record as error', error)

    await supabase.from('plant_logs').update({
      status: 'error',
      error_details: errMsg,
      processing_log: logger.getLog(),
    }).eq('id', record_id)

    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
