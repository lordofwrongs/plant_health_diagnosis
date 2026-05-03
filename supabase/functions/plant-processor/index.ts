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
  timeoutMs = 35000,
  extraImages: Array<{base64: string; mimeType: string}> = [],
  responseSchema?: Record<string, unknown>
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
            ...extraImages.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
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
  if (c === 'healthy')  return '#0D9488'  // teal — distinguishable in all colorblindness types
  if (c === 'critical') return '#DC2626'  // red
  return '#D97706'  // amber — fair / stressed / recovering
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
      `IMPORTANT: Cucurbit seedlings look nearly identical at early stages. ` +
      `Use these specific clues to distinguish them:\n` +
      `• Ridge gourd/Luffa: leaves rough like sandpaper on both sides; deep angular lobes; stem hairy and angular.\n` +
      `• Bitter gourd/Karela: very deeply cut, jagged irregular lobes — almost fig-leaf or feathery shape.\n` +
      `• Bottle gourd/Lauki: large soft heart-shaped leaves, very shallow lobing, round hairy stem.\n` +
      `• Cucumber/Kakdi: broadly 3-5 lobed, middle lobe longest; leaf slightly wider than long; fine surface hairs.\n` +
      `• Cantaloupe/Muskmelon: similar to cucumber but leaf outline more rounded with shallower sinuses; ` +
      `petiole attachment slightly indented at the base.\n` +
      `• Snake gourd: first true leaves narrower with pointed lobes; stem often purplish near base.\n` +
      `If multiple plants are visible, analyse the LARGEST/most prominent plant in the frame.`
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
// SHA-256 hex digest of image bytes — used as PlantNet cache key
// ---------------------------------------------------------------------------
async function computeImageHash(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  const { record } = await req.json()
  const { image_url, id: record_id, plant_nickname: nickname, user_id } = record
  // user_correction is set only on correction re-runs (thumbs-down flow)
  const userCorrection: string | null =
    typeof record.user_correction === 'string' && record.user_correction.trim()
      ? record.user_correction.trim()
      : null

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
      .select('latitude, longitude, location_name, created_at, preferred_language, additional_images')
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
    const allImageUrls = [image_url, ...(log.additional_images ?? []).filter(Boolean)]
    const allImageData = await Promise.all(allImageUrls.map(async (url: string) => {
      const res  = await fetchWithTimeout(url, {}, 20000)
      if (!res.ok) throw new Error(`Image fetch failed: HTTP ${res.status}`)
      const buf   = await res.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const mime  = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()
      return { bytes, mimeType: mime, base64: toBase64(bytes) }
    }))
    const primaryImage  = allImageData[0]
    const imageBytes    = primaryImage.bytes
    const imageMimeType = primaryImage.mimeType
    const imageBase64   = primaryImage.base64
    logger.endTimer('image_fetch')
    logger.info('image_fetch', `${allImageData.length} image(s), primary: ${(imageBytes.length / 1024).toFixed(0)}KB, type: ${imageMimeType}`)

    const imageHash = await computeImageHash(imageBytes)

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

    // For correction re-runs, fetch prior PlantNet candidates from the existing record
    // instead of calling PlantNet again — the image hasn't changed, result would be identical
    let correctionCandidates: Array<{ name: string; common: string; score: number }> = []
    if (userCorrection) {
      const { data: existingLog } = await supabase
        .from('plant_logs')
        .select('plantnet_candidates')
        .eq('id', record_id)
        .single()
      correctionCandidates = existingLog?.plantnet_candidates ?? []
      logger.info('correction_rerun', `User correction: "${userCorrection}", prior candidates: ${correctionCandidates.length}`)
    }

    const [plantNet, nearbyResult, weatherSnippet] = await Promise.all([
      // 1a. PlantNet — skipped on correction re-runs (image unchanged, result would be identical)
      (async () => {
        if (userCorrection) return null  // skip — use correctionCandidates instead

        const { data: cached } = await supabase
          .from('plantnet_cache')
          .select('result')
          .eq('image_hash', imageHash)
          .maybeSingle()

        if (cached?.result) {
          logger.info('plantnet', `Cache hit for hash ${imageHash.slice(0, 8)}…`)
          return cached.result as PlantNetResult
        }

        // Count today's API calls (cache inserts = quota consumed; resets midnight UTC)
        const todayUTC = new Date()
        todayUTC.setUTCHours(0, 0, 0, 0)
        const { count: dailyCalls } = await supabase
          .from('plantnet_cache')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayUTC.toISOString())
        const callsToday = dailyCalls ?? 0
        logger.info('plantnet_quota', `Daily calls: ${callsToday}/500`)
        if (callsToday >= 400) {
          logger.warn('plantnet_quota', `QUOTA_WARNING: ${callsToday}/500 used — ${500 - callsToday} remaining today`)
        }

        const fresh = await identifyWithPlantNet(PLANTNET_KEY, imageBytes, imageMimeType, 'leaf', logger)
        if (fresh) {
          supabase.from('plantnet_cache').insert({ image_hash: imageHash, result: fresh })
            .then(({ error }: { error: { message: string } | null }) => { if (error) logger.warn('plantnet_cache', `Write failed: ${error.message}`) })
        }
        return fresh
      })(),

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
    if (userCorrection) {
      // Correction re-run: user directly examined the plant and provided a name.
      // Their correction is the top candidate; prior PlantNet results are additional hints.
      // Gemini still does its own independent ID first (anti-anchoring), then reconciles.
      const candidateList = [
        `1. "${userCorrection}" — User correction (user directly examined this plant)`,
        ...correctionCandidates.slice(0, 2).map((c, i) =>
          `${i + 2}. ${c.name} (${c.common || '—'}) — Prior PlantNet ${c.score}%`
        ),
      ].join('\n')
      identSection =
        `CORRECTION RE-RUN — The user has directly examined this plant and believes it is: "${userCorrection}"\n\n` +
        `CROSS-VALIDATION TASK — follow these three steps strictly in order:\n\n` +
        `Step 1 — YOUR INDEPENDENT ID (complete this before reading the candidates below):\n` +
        `Look ONLY at the visual evidence in the photo: leaf shape and lobe depth, how the petiole ` +
        `attaches, leaf texture, venation pattern, stem cross-section, and growth habit. ` +
        `Commit to a species name. Set independent_id to YOUR answer. ` +
        `Do NOT be anchored by the candidates listed below.\n\n` +
        `Step 2 — USER CORRECTION + PRIOR SPECIALIST CANDIDATES (treat as strong hints):\n` +
        `${candidateList}\n\n` +
        `Step 3 — RECONCILE: Compare your Step 1 answer with the candidates above.\n` +
        `If your answer matches the user correction → set agrees_with_specialist=true and final_scientific_name accordingly.\n` +
        `If your answer matches a PlantNet candidate → set agrees_with_specialist=true and use that species.\n` +
        `If your answer differs from all → set agrees_with_specialist=false and use YOUR Step 1 answer.`
    } else if (useGroundTruth) {
      identSection =
        `SPECIES CONFIRMED (PlantNet ${plantNet!.score}% confidence): ` +
        `"${plantNet!.scientificName}" (${plantNet!.commonName}, family ${plantNet!.family}). ` +
        `DO NOT re-identify. Set independent_id and final_scientific_name to this confirmed species, ` +
        `and agrees_with_specialist to true. Focus on health analysis and regional context.`
    } else if (useCrossValidate) {
      const allCandidates = plantNet!.topCandidates
        .map((c: { name: string; common: string; score: number }, i: number) => `${i + 1}. ${c.name} (${c.common || '—'}) — ${c.score}%`)
        .join('\n')
      identSection =
        `CROSS-VALIDATION TASK — follow these three steps strictly in order:\n\n` +
        `Step 1 — YOUR INDEPENDENT ID (complete this before reading the candidates below):\n` +
        `Look ONLY at the visual evidence in the photo: leaf shape and lobe depth, how the petiole ` +
        `attaches (at the leaf base vs. the center), leaf texture (rough/smooth/hairy), venation ` +
        `pattern, stem cross-section, and overall growth habit. Based purely on what you see, ` +
        `commit to a species name. Set independent_id to YOUR answer. ` +
        `Do NOT be anchored by the specialist candidates listed below — your visual read matters.\n\n` +
        `Step 2 — SPECIALIST CANDIDATES (low certainty — ${plantNet!.score}% top score — treat as hints only):\n` +
        `${allCandidates}\n\n` +
        `Step 3 — RECONCILE: Compare your Step 1 answer with the candidates above.\n` +
        `If your answer matches one → set agrees_with_specialist=true and final_scientific_name to that species.\n` +
        `If your answer differs → set agrees_with_specialist=false and final_scientific_name to YOUR Step 1 answer ` +
        `(your visual analysis overrides a low-certainty specialist reading).`
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

    const PLANT_ANALYSIS_SCHEMA = {
      type: "object",
      properties: {
        is_analyzable: { type: "boolean" },
        photo_tip: { type: "string", nullable: true },
        organ: { type: "string" },
        independent_id: { type: "string" },
        agrees_with_specialist: { type: "boolean" },
        visual_features: { type: "string" },
        display_name: { type: "string" },
        final_scientific_name: { type: "string" },
        vernacular_names: {
          type: "object",
          properties: {
            english: { type: "string" },
            hindi: { type: "string" },
            tamil: { type: "string" },
            telugu: { type: "string" }
          }
        },
        health_category: { type: "string", enum: ["healthy", "fair", "critical"] },
        health_status: { type: "string" },
        analysis: { type: "string" },
        toxicity: {
          type: "object",
          properties: {
            risk_cats: { type: "string" },
            risk_dogs: { type: "string" },
            risk_humans: { type: "string" },
            notes: { type: "string" }
          }
        },
        light_intensity_analysis: { type: "string" },
        seasonal_context: { type: "string" },
        vital_signs: {
          type: "object",
          properties: {
            hydration:  { type: "number" },
            light:      { type: "number" },
            nutrients:  { type: "number" },
            pest_risk:  { type: "number" }
          }
        },
        recovery_steps: { type: "array", items: { type: "string" } },
        pro_tip: { type: "string" },
        weather_alert: { type: "string", nullable: true },
        care_schedule: {
          type: "object",
          properties: {
            water_every_days: { type: "number" },
            fertilise_every_days: { type: "number" },
            check_pests_every_days: { type: "number" },
            notes: { type: "string", nullable: true }
          }
        },
        pest_detected: { type: "boolean" },
        pest_name: { type: "string", nullable: true },
        pest_treatment: { type: "array", nullable: true, items: { type: "string" } },
        growth_narrative: { type: "string", nullable: true }
      },
      required: [
        "is_analyzable", "independent_id", "final_scientific_name",
        "display_name", "health_category", "health_status",
        "analysis", "recovery_steps", "pro_tip", "care_schedule",
        "pest_detected", "toxicity", "light_intensity_analysis",
        "seasonal_context", "vital_signs"
      ]
    };

    const multiAngleHeader = allImageData.length > 1
      ? `MULTI-ANGLE ANALYSIS: ${allImageData.length} photos of the same plant have been provided.\n` +
        `• Photo 1: Whole plant view\n` +
        (allImageData.length >= 2 ? `• Photo 2: Leaf close-up\n` : '') +
        (allImageData.length >= 3 ? `• Photo 3: Stem and soil base\n` : '') +
        `Analyse ALL images together for the most accurate identification and health assessment.\n\n`
      : ''
    const extraImages = allImageData.slice(1).map(img => ({ base64: img.base64, mimeType: img.mimeType }))

    const result = await callGemini(
      GEMINI_KEY,
      [
        'You are an expert botanist and friendly horticultural coach helping everyday home gardeners.',
        'Write in plain, warm, conversational language a non-expert can easily understand.',
        'Never use botanical jargon (no "ovate", "lanceolate", "pinnate venation", "pubescent", "crenate", "cordate", "petiole" etc.) — always use everyday equivalents.',
        'Always respond with valid JSON only. All keys in vernacular_names must be lowercase.',
      ].join(' '),
      `${multiAngleHeader}STEP 0 — IMAGE QUALITY CHECK (evaluate this before anything else):
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
5. TOXICITY: Assess safety for cats, dogs, and humans.
6. LIGHT & SEASON: Analyze light from shadows and provide seasonal care context for ${new Date().toLocaleString('default', { month: 'long' })} in the ${log.latitude > 0 ? 'Northern' : 'Southern'} hemisphere.
7. REGIONAL NAMES: Use traditional names used by locals — not literal translations.
8. USER LANGUAGE: All user-facing text (except health_category) in ${userLang}.
9. weather_alert: Only if weather data indicates genuine risk. Otherwise null.
10. CARE STEPS: Concrete actions in ${userLang}. Name product types, no brands.
11. PEST DETECTION: Holes, webbing, or visible insects.
12. VITAL SIGNS — rate 0–100 from visual evidence only. hydration: leaf turgor, wilting, soil moisture cues. light: growth direction, stretch, leaf colour. nutrients: colour uniformity, chlorosis, vigour. pest_risk: visible damage, webbing, insects (0 = none, 100 = severe).
13. SEASONAL CONTEXT: 1–2 sentences on care adjustments for ${new Date().toLocaleString('default', { month: 'long' })} in the ${(log.latitude ?? 0) >= 0 ? 'Northern' : 'Southern'} Hemisphere in ${userLang}.
14. GROWTH NARRATIVE: ${nearbyLogs?.length ? `The previous scan showed this plant as "${nearbyLogs[0].HealthStatus}". Write 1–2 warm, specific sentences comparing the current condition to that previous scan — what has improved, stayed the same, or needs attention. Be encouraging and concrete. Write in ${userLang}.` : 'This is the first scan for this plant. Set growth_narrative to null.'}`,
      imageBase64, imageMimeType, logger, 'stage2_analysis',
      0.1, 45000, extraImages, PLANT_ANALYSIS_SCHEMA
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
    if (userCorrection) {
      // Correction re-run: if Gemini agrees with user → 83%; if Gemini overrides → 60%
      finalScore = geminiAgrees ? 83 : 60
    } else if (useGroundTruth) {
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
        pest_detected:           Boolean(result.pest_detected),
        pest_name:               typeof result.pest_name === 'string' ? result.pest_name : null,
        pest_treatment:          Array.isArray(result.pest_treatment) ? result.pest_treatment : null,
        plantnet_candidates:     plantNet?.topCandidates ?? [],
        toxicity:                result.toxicity ?? null,
        light_intensity_analysis: typeof result.light_intensity_analysis === 'string' ? result.light_intensity_analysis : null,
        seasonal_context:        typeof result.seasonal_context === 'string' ? result.seasonal_context : null,
        vital_signs:             result.vital_signs ?? null,
        growth_milestones:       result.growth_narrative ? { narrative: String(result.growth_narrative) } : null,
        status:                  'done',
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
