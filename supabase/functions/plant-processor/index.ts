import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------
function createLogger(recordId: string) {
  const entries: Array<Record<string, unknown>> = []
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
    info:  (stage: string, msg: string, extra?: Record<string, unknown>) => emit('info',  stage, msg, extra),
    warn:  (stage: string, msg: string) => emit('warn',  stage, msg),
    error: (stage: string, msg: string, err?: unknown) => {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '')
      emit('error', stage, detail ? `${msg} | ${detail}` : msg)
    },
    startTimer: (stage: string) => { timers[stage] = Date.now() },
    endTimer: (stage: string) => {
      const ms = timers[stage] ? Date.now() - timers[stage] : 0
      emit('info', stage, `Completed in ${ms}ms`, { duration_ms: ms })
      return ms
    },
    getLog: () => entries,
  }
}

// ---------------------------------------------------------------------------
// fetch with hard timeout
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// ---------------------------------------------------------------------------
// fetch with retry — retries on 5xx / timeout, skips 4xx
// ---------------------------------------------------------------------------
async function fetchWithRetry(
  url: string, init: RequestInit, timeoutMs: number,
  logger: ReturnType<typeof createLogger>, stage: string, maxRetries = 2
): Promise<Response> {
  let lastErr: Error = new Error('Unknown')
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs)
      if (res.ok || (res.status >= 400 && res.status < 500)) return res
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1500
      logger.warn(stage, `Attempt ${attempt + 1} failed (${lastErr.message}) — retry in ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr
}

// ---------------------------------------------------------------------------
// Safe base64 encoder — chunked to avoid stack overflow on large images
// ---------------------------------------------------------------------------
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// ---------------------------------------------------------------------------
// Parse AI JSON — handles pre-parsed objects and markdown fences
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
// Gemini direct API call (free tier, no OpenRouter margin)
// ---------------------------------------------------------------------------
async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  imageMimeType: string,
  logger: ReturnType<typeof createLogger>,
  stage: string,
  temperature = 0.1,
  timeoutMs = 35000
): Promise<Record<string, unknown>> {
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: 'user',
          parts: [
            { text: userText },
            { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature,
          // Disable thinking mode — adds 2-4s latency for no benefit on structured JSON tasks
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
    timeoutMs, logger, stage
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini ${stage} HTTP ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error(`Gemini ${stage} empty response: ${JSON.stringify(data).slice(0, 300)}`)
  return parseAIJson(text)
}

// ---------------------------------------------------------------------------
// PlantNet — specialized plant identification (free, 500 req/day)
// Returns null on failure rather than throwing — it's a best-effort enrichment
// ---------------------------------------------------------------------------
interface PlantNetResult {
  scientificName: string
  commonName: string
  family: string
  score: number
  topCandidates: Array<{ name: string; common: string; score: number }>
}

async function identifyWithPlantNet(
  apiKey: string,
  imageBytes: Uint8Array,
  mimeType: string,
  organ: string,
  logger: ReturnType<typeof createLogger>
): Promise<PlantNetResult | null> {
  try {
    const formData = new FormData()
    formData.append('images', new Blob([imageBytes.buffer as ArrayBuffer], { type: mimeType }), 'plant.jpg')
    // Use the organ detected by the quality gate. Defaults to 'leaf' for seedlings/young plants.
    // Only overridden to 'flower'/'fruit' when Gemini clearly identifies that as the main subject.
    formData.append('organs', organ)

    const res = await fetchWithTimeout(
      `https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}&lang=en&include-related-images=false&nb-results=3`,
      { method: 'POST', body: formData },
      15000
    )

    if (!res.ok) {
      logger.warn('plantnet', `HTTP ${res.status} — skipping`)
      return null
    }

    const data = await res.json()
    const top = data?.results?.[0]
    if (!top || top.score < 0.05) {
      logger.warn('plantnet', 'No usable result returned')
      return null
    }

    const result: PlantNetResult = {
      scientificName: top.species?.scientificNameWithoutAuthor ?? '',
      commonName:     top.species?.commonNames?.[0] ?? '',
      family:         top.species?.family?.scientificNameWithoutAuthor ?? '',
      score:          Math.round((top.score ?? 0) * 100),
      topCandidates:  (data.results ?? []).slice(0, 3).map((r: Record<string, unknown>) => ({
        name:   (r.species as Record<string, unknown>)?.scientificNameWithoutAuthor,
        common: ((r.species as Record<string, unknown>)?.commonNames as string[])?.[0],
        score:  Math.round(((r.score as number) ?? 0) * 100),
      })),
    }

    logger.info('plantnet', `Top result: ${result.scientificName} (${result.score}%)`, {
      candidates: result.topCandidates,
    })
    return result

  } catch (e) {
    logger.warn('plantnet', `Failed: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Weather — best-effort, never blocks the pipeline
// ---------------------------------------------------------------------------
async function fetchWeather(
  lat: number | null, lon: number | null,
  logger: ReturnType<typeof createLogger>
): Promise<string> {
  if (!lat || !lon) return 'Weather data unavailable.'
  try {
    const res = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_sum&timezone=auto&past_days=7`,
      {}, 10000
    )
    const wd = await res.json()
    const pastRain = (wd.daily?.precipitation_sum ?? [])
      .slice(0, 7).reduce((a: number, b: number | null) => a + (b ?? 0), 0)
    const futureTemps = (wd.daily?.temperature_2m_max ?? []).slice(7).filter((t: unknown) => t != null)
    const futureMax = futureTemps.length > 0 ? Math.max(...(futureTemps as number[])) : null
    const snippet = futureMax != null
      ? `Past 7-day rain: ${pastRain.toFixed(1)}mm. Forecast peak: ${futureMax}°C.`
      : `Past 7-day rain: ${pastRain.toFixed(1)}mm.`
    logger.info('weather', snippet)
    return snippet
  } catch (e) {
    logger.warn('weather', `Failed: ${e instanceof Error ? e.message : String(e)}`)
    return 'Weather data unavailable.'
  }
}

// ---------------------------------------------------------------------------
// Map health_category (always English) to display color
// ---------------------------------------------------------------------------
function healthCategoryToColor(category: string): string {
  const c = category.toLowerCase().trim()
  if (c === 'healthy')  return '#4CAF50'
  if (c === 'critical') return '#FF5252'
  return '#FF9800' // fair / stressed / recovering
}

// ---------------------------------------------------------------------------
// Regional growing context — improves seedling ID for home gardeners
// Returns a hint string that is injected into the Gemini identification prompt.
// Empty string for unknown/unsupported regions (no-op).
// ---------------------------------------------------------------------------
function getRegionalContext(locationName: string): string {
  const loc = (locationName || '').toLowerCase()

  const isIndia = [
    'india', 'tamil', 'kerala', 'karnataka', 'andhra', 'telangana', 'maharashtra',
    'gujarat', 'rajasthan', 'punjab', 'bengal', 'odisha', 'bihar', 'chennai',
    'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'kolkata', 'pune',
    'coimbatore', 'kochi', 'vizag', 'madurai', 'mysore', 'nagpur', 'surat',
    'jaipur', 'lucknow', 'patna', 'bhubaneswar', 'indore', 'bhopal',
    'thiruvananthapuram', 'vijayawada', 'mangalore',
  ].some(k => loc.includes(k))

  if (isIndia) {
    return `Regional growing context — common Indian home garden vegetables (many grown as seedlings): ` +
      `snake gourd/padwal (Trichosanthes cucumerina), ridge gourd/turai (Luffa acutangula), ` +
      `bitter gourd/karela (Momordica charantia), bottle gourd/lauki (Lagenaria siceraria), ` +
      `cucumber/kakdi (Cucumis sativus), brinjal/baingan (Solanum melongena), ` +
      `tomato (Solanum lycopersicum), chilli/mirchi (Capsicum annuum), ` +
      `okra/bhindi (Abelmoschus esculentus), moringa/drumstick (Moringa oleifera), ` +
      `curry leaf (Murraya koenigii). ` +
      `IMPORTANT: Cucurbit seedlings (snake gourd, ridge gourd, bitter gourd, bottle gourd, cucumber, muskmelon) ` +
      `look nearly identical at early stages — carefully examine petiole attachment point, ` +
      `leaf lobe depth, stem cross-section, and tendril position to distinguish between them.`
  }

  const isSEA = [
    'thailand', 'vietnam', 'indonesia', 'malaysia', 'philippines',
    'singapore', 'myanmar', 'cambodia', 'laos',
  ].some(k => loc.includes(k))

  if (isSEA) {
    return `Regional growing context — common Southeast Asian home garden plants: ` +
      `bitter gourd (Momordica charantia), winged bean (Psophocarpus tetragonolobus), ` +
      `moringa (Moringa oleifera), water spinach (Ipomoea aquatica), ` +
      `lemongrass (Cymbopogon citratus), pandan (Pandanus amaryllifolius), galangal (Alpinia galanga).`
  }

  return ''
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  const { record } = await req.json()
  const { image_url, id: record_id, plant_nickname: nickname, user_id } = record

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const GEMINI_KEY   = Deno.env.get('GEMINI_API_KEY') ?? ''
  const PLANTNET_KEY = Deno.env.get('PLANTNET_API_KEY') ?? ''

  const logger = createLogger(record_id)
  logger.info('init', `Pipeline started — ${image_url}`)

  try {
    // -----------------------------------------------------------------------
    // Preflight — fetch record metadata
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
    // Image fetch — ONCE, reused for both Gemini (base64) and PlantNet (bytes)
    // -----------------------------------------------------------------------
    logger.startTimer('image_fetch')
    const imgRes = await fetchWithTimeout(image_url, {}, 20000)
    if (!imgRes.ok) throw new Error(`Image fetch failed: HTTP ${imgRes.status}`)
    const imageBuffer   = await imgRes.arrayBuffer()
    const imageBytes    = new Uint8Array(imageBuffer)
    const imageMimeType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()
    const imageBase64   = toBase64(imageBytes)
    logger.endTimer('image_fetch')
    logger.info('image_fetch', `Size: ${(imageBytes.length / 1024).toFixed(0)}KB, type: ${imageMimeType}`)

    // -----------------------------------------------------------------------
    // STAGE 1 — Parallel: PlantNet ID + History + Weather
    //
    // PlantNet runs BEFORE the Gemini call with 'leaf' as the default organ —
    // correct for seedlings and young plants (the hard identification cases).
    // This eliminates the old Stage 1 quality gate as a blocking serial step,
    // saving ~4s by moving all pre-Gemini work into a single parallel stage.
    // -----------------------------------------------------------------------
    logger.startTimer('stage1_parallel')
    const threshold = 0.0001

    const [plantNet, nearbyResult, weatherSnippet] = await Promise.all([
      // 1a. PlantNet — 'leaf' covers seedlings/young plants (the common case)
      identifyWithPlantNet(PLANTNET_KEY, imageBytes, imageMimeType, 'leaf', logger),

      // 1b. Previous scan history for this plant/location
      supabase
        .from('plant_logs')
        .select('VisualAnalysis, HealthStatus, PlantName, created_at')
        .eq('user_id', user_id)
        .eq('status', 'done')
        .lt('created_at', log.created_at)
        .or(`and(latitude.gte.${log.latitude - threshold},latitude.lte.${log.latitude + threshold},longitude.gte.${log.longitude - threshold},longitude.lte.${log.longitude + threshold}),plant_nickname.eq.${nickname ? `'${nickname.replace(/'/g, "''")}'` : 'null'}`)
        .order('created_at', { ascending: false })
        .limit(1),

      // 1c. Weather context
      fetchWeather(log.latitude, log.longitude, logger),
    ])

    logger.endTimer('stage1_parallel')

    // Build history context
    let historyContext = 'First-time scan for this plant.'
    const nearbyLogs = nearbyResult.data
    if (nearbyLogs && nearbyLogs.length > 0) {
      const prev = nearbyLogs[0]
      historyContext = `PREVIOUS SCAN: Plant=${prev.PlantName}, Status=${prev.HealthStatus}, Findings=${(prev.VisualAnalysis ?? '').slice(0, 200)}`
    }

    const plantNetConfidence = plantNet?.score ?? 0
    logger.info('stage1_parallel', `PlantNet: ${plantNet ? `${plantNet.scientificName} ${plantNet.score}%` : 'no result'}`)

    // -----------------------------------------------------------------------
    // STAGE 2 — Merged Gemini call
    //
    // A single Gemini call now handles:
    //   a) Quality gate — is_analyzable, photo_tip, organ detection
    //   b) Plant identification — independent ID + PlantNet cross-validation
    //   c) Health analysis and care recommendations
    //
    // If is_analyzable = false, we exit early after this single call.
    // -----------------------------------------------------------------------
    logger.startTimer('stage2_analysis')

    const useGroundTruth   = plantNet !== null && plantNet.score >= 85
    const useCrossValidate = plantNet !== null && plantNet.score >= 20 && plantNet.score < 85

    let identSection: string
    if (useGroundTruth) {
      identSection =
        `SPECIES CONFIRMED (PlantNet ${plantNet!.score}% confidence): ` +
        `"${plantNet!.scientificName}" (${plantNet!.commonName}, family ${plantNet!.family}). ` +
        `DO NOT re-identify. Set independent_id and final_scientific_name to this confirmed species, ` +
        `and agrees_with_specialist to true. Focus on health analysis and regional context.`
    } else if (useCrossValidate) {
      const altStr = plantNet!.topCandidates.slice(1).map((c: { name: string; score: number }) => `${c.name} (${c.score}%)`).join(', ')
      identSection =
        `CROSS-VALIDATION TASK — follow these steps in order:\n` +
        `Step 1 — YOUR INDEPENDENT ID: Look carefully at leaf shape, how the petiole attaches ` +
        `(at leaf base vs. center of leaf), leaf texture, venation pattern, stem type, and growth habit. ` +
        `Based ONLY on these visual features, name the plant. Set independent_id to your answer.\n` +
        `Step 2 — SPECIALIST CHECK: PlantNet (trained on millions of herbarium specimens) says ` +
        `"${plantNet!.scientificName}" (${plantNet!.commonName}) at ${plantNet!.score}%. ` +
        `Alternatives: ${altStr || 'none'}.\n` +
        `Step 3 — RECONCILE: If your Step 1 answer matches PlantNet → set agrees_with_specialist=true ` +
        `and final_scientific_name to that species. If they differ → set agrees_with_specialist=false ` +
        `and final_scientific_name to YOUR Step 1 identification (you know something PlantNet missed).`
    } else {
      const hint = plantNet
        ? `PlantNet returned a weak signal (best guess: ${plantNet.scientificName} at ${plantNet.score}%) — treat as unreliable.`
        : `PlantNet could not identify this plant.`
      identSection =
        `${hint} Identify the plant yourself. ` +
        `Describe the petiole attachment (base vs. center), leaf shape, texture, and growth pattern first, ` +
        `then name it. Set independent_id = final_scientific_name and agrees_with_specialist = false.`
    }

    const regionalContext = getRegionalContext(log.location_name)

    const result = await callGemini(
      GEMINI_KEY,
      [
        'You are an expert botanist and friendly horticultural coach helping everyday home gardeners.',
        'Write in plain, warm, conversational language a non-expert can easily understand.',
        'Never use botanical jargon (no "ovate", "lanceolate", "pinnate venation", "pubescent", "crenate", "cordate", "petiole" etc.) — always use everyday equivalents.',
        'Always respond with valid JSON only. All keys in vernacular_names must be lowercase.',
      ].join(' '),
      `STEP 0 — IMAGE QUALITY CHECK (evaluate this before anything else):
Determine if this image can produce a reliable plant identification.

HARD REJECT (is_analyzable = false) ONLY when:
- No plant is visible at all (photo of floor, ceiling, random objects, just a hand)
- Image is completely black, completely white, or so blurry that ZERO features are discernible

PROCEED (is_analyzable = true) for everything else: top-down angle, distance, partial view, slightly blurry, low light, just leaves/stems.

photo_tip: a short actionable suggestion if a different angle would improve accuracy. Otherwise null.
organ: "leaf" (default for seedlings/young plants), "flower" (only if clearly main subject), "fruit", "bark", "habit". When in doubt: "leaf".

If is_analyzable = false, set all analysis fields to null in your JSON response.

CONTEXT:
Location: ${log.location_name}
${regionalContext ? `${regionalContext}\n` : ''}Weather: ${weatherSnippet}
History: ${historyContext}
${nickname
  ? `USER-LABELED THIS PLANT AS: "${nickname}" — treat this as a strong identification hint. ` +
    `Validate visually: if the visual evidence supports it, confirm it as the identification. ` +
    `Only override it if the visual evidence clearly and definitively contradicts the label.`
  : 'User did not provide a plant name.'}

${identSection}

STEP 1 — FULL ANALYSIS (complete only when is_analyzable = true):
1. IDENTIFICATION: Follow the identification strategy above precisely.
2. HEALTH ASSESSMENT: Analyse leaf colour, turgor, spots, wilting, soil condition. Write like you are explaining to a friend who loves gardening but has no scientific background — warm, clear, jargon-free.
3. health_category MUST be exactly one of: "healthy", "fair", or "critical" (English, always).
4. health_status MUST be a SHORT badge label (2-4 words max) in ${userLang} — e.g. "Healthy", "Needs Attention", "Stressed", "Critical Condition". Never a full sentence.
5. REGIONAL NAMES: Use traditional names used by locals — not literal translations.
6. USER LANGUAGE: All user-facing text (except health_category) in ${userLang}.
7. weather_alert: Only if weather data indicates genuine risk. Otherwise null.
8. CARE STEPS: Make each step concrete and actionable. Factor current weather conditions into recommendations — if rainfall has been low, emphasise watering frequency or mulching; if peak temperatures are high, advise on shade cloth or watering timing; if rain has been heavy, flag drainage and fungal risk. When recommending fertilisers, sprays, or soil treatments, name the product TYPE (e.g. "liquid seaweed fertiliser", "balanced granular fertiliser (NPK)", "neem oil spray", "compost or well-rotted manure"). Never mention specific brand names.
9. PRO TIP: A single practical tip combining the plant's current needs with the actual weather forecast — reference rain and temperature data specifically. Only name the location if it is known and confirmed.
10. CARE SCHEDULE: Generate realistic care frequencies for this specific plant. Factor rainfall into water_every_days — reduce the interval if the past 7-day rain was < 5mm; increase it if > 20mm. notes is optional: one concise sentence for a care tip not already in recovery_steps, or null.

RESPOND WITH THIS EXACT JSON (no markdown fences):
{
  "is_analyzable": true,
  "photo_tip": null,
  "organ": "leaf",
  "independent_id": "Scientific name from YOUR own visual analysis",
  "agrees_with_specialist": true,
  "visual_features": "One plain-English sentence describing what you see — leaf shape and colour, stem type, how it grows. No botanical jargon.",
  "display_name": "Most culturally relatable name in ${userLang}",
  "final_scientific_name": "Genus species (reconciled winner)",
  "vernacular_names": {
    "english": "Common English name",
    "hindi": "Traditional Hindi name",
    "tamil": "Traditional Tamil name or None",
    "telugu": "Traditional Telugu name or None"
  },
  "health_category": "healthy",
  "health_status": "Healthy",
  "analysis": "Plain-language health assessment in ${userLang} — what you see, what it means, written warmly for a home gardener.",
  "recovery_steps": ["Concrete action in ${userLang}. Name the product type if a treatment is needed — no brand names."],
  "pro_tip": "A practical, location-specific tip for ${log.location_name !== 'Unknown Location' ? log.location_name : 'home gardeners'} in ${userLang}. Do not mention South Asia unless location confirms it.",
  "weather_alert": null,
  "care_schedule": {
    "water_every_days": 3,
    "fertilise_every_days": 14,
    "check_pests_every_days": 7,
    "notes": null
  }
}`,
      imageBase64, imageMimeType, logger, 'stage2_analysis',
      0.1, 45000
    )

    logger.endTimer('stage2_analysis')

    // Early exit if quality gate rejected the image
    if (result.is_analyzable === false) {
      const tip = String(result.photo_tip ?? 'Please take a clear photo of the plant with good lighting.')
      await supabase.from('plant_logs').update({
        status: 'quality_issue',
        error_details: tip,
        processing_log: logger.getLog(),
      }).eq('id', record_id)
      return new Response(JSON.stringify({ success: false, quality_issue: true, tip }))
    }

    // -----------------------------------------------------------------------
    // Compute confidence from agreement signal — never trust AI self-reporting
    //
    // High confidence is EARNED by agreement between two independent sources.
    // This is how calibrated apps (iNaturalist, PlantNet) build user trust:
    // when they say 92%, they're right ~92% of the time.
    // -----------------------------------------------------------------------
    const geminiAgrees = Boolean(result.agrees_with_specialist)
    const geminiId     = String(result.independent_id   ?? '')
    const finalId      = String(result.final_scientific_name ?? result.independent_id ?? '')

    let finalScore: number
    if (useGroundTruth) {
      // PlantNet ≥ 85% + Gemini confirmed → very high confidence
      finalScore = 93
    } else if (useCrossValidate && geminiAgrees) {
      // Both sources agree
      if (plantNetConfidence >= 70) finalScore = 90
      else if (plantNetConfidence >= 50) finalScore = 83
      else finalScore = 75
    } else if (useCrossValidate && !geminiAgrees) {
      // Gemini overrides PlantNet — honest but uncertain; display_name will get "Possibly"
      finalScore = 60
    } else {
      // No usable PlantNet — Gemini only; cap at 70 since there's no cross-validation
      finalScore = 70
    }

    logger.info('stage2_analysis', `independent=${geminiId}, agrees=${geminiAgrees}, final=${finalId}, computed_confidence=${finalScore}`, {
      plantnet_score: plantNetConfidence,
      plantnet_name: plantNet?.scientificName,
    })

    // Prefix "Possibly" when Gemini overrides PlantNet or low PlantNet signal
    const displayName = String(result.display_name ?? finalId)
    const needsPossibly = (!geminiAgrees && useCrossValidate) || (!plantNet && finalScore < 65)
    const finalDisplayName = needsPossibly && !displayName.toLowerCase().startsWith('possibly')
      ? `Possibly ${displayName}`
      : displayName
    const healthColor = healthCategoryToColor(String(result.health_category ?? 'fair'))

    logger.startTimer('stage3_db')
    const { error: updateError } = await supabase
      .from('plant_logs')
      .update({
        PlantName:          finalDisplayName,
        ScientificName:     result.final_scientific_name ?? result.scientific_name,
        AccuracyScore:      finalScore,
        HealthStatus:       result.health_status,
        HealthColor:        healthColor,
        VisualAnalysis:     result.visual_features
                              ? `[Observed: ${result.visual_features}]\n\n${result.analysis}`
                              : result.analysis,
        vernacular_metadata: result.vernacular_names ?? {},
        CarePlan:           Array.isArray(result.recovery_steps)
                              ? result.recovery_steps.map((s: unknown) => `• ${String(s)}`).join('\n')
                              : String(result.recovery_steps ?? ''),
        ExpertTip:           result.pro_tip,
        WeatherAlert:        result.weather_alert ?? null,
        care_schedule:       result.care_schedule ?? null,
        plantnet_candidates: plantNet?.topCandidates ?? [],
        status:              'done',
        // Store photo_tip as gentle guidance in ResultsScreen when image quality was imperfect
        error_details:      result.photo_tip ?? null,
        processing_log:     logger.getLog(),
      })
      .eq('id', record_id)

    if (updateError) throw new Error(`DB update failed: ${updateError.message}`)
    logger.endTimer('stage3_db')
    logger.info('stage3_db', 'Pipeline complete')

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error('pipeline', 'Fatal error', error)
    await supabase.from('plant_logs').update({
      status: 'error',
      error_details: errMsg,
      processing_log: logger.getLog(),
    }).eq('id', record_id)
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
