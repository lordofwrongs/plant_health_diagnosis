# BotanIQ — Review Fix Blueprint

> Generated from comprehensive security, performance, scalability, and UX review.
> Use this file as the implementation backlog. Work top-to-bottom within each tier.

---

## TIER 1 — Deploy Blockers & Critical Security

---

### FIX-01 · Corrupted Gemini Prompt Template
**Priority:** Deploy Blocker — function won't compile in current state
**File:** `supabase/functions/plant-processor/index.ts` (lines 692–694)

**Problem:** Instruction 14 (GROWTH NARRATIVE) appears twice. The first copy ends with a closing backtick that prematurely terminates the template literal. Instruction 15 (BOTANICAL EXPERTISE) lands outside the template, making it invalid TypeScript that prevents compilation.

**Fix:** Remove the backtick+comma at the end of line 692, delete the duplicate line 693, and ensure the template literal closes only at line 694.

```typescript
// BEFORE (broken — line 692 closes the template literal prematurely):
14. GROWTH NARRATIVE: ${...}`,           // ← backtick closes outer template
14. GROWTH NARRATIVE: ${...}             // ← duplicate, now invalid JS
15. BOTANICAL EXPERTISE: ...`,

// AFTER (correct — single closing backtick at end of instruction 15):
14. GROWTH NARRATIVE: ${...}
15. BOTANICAL EXPERTISE: Specifically look for signs of being 'root-bound'...`,
```

**Complexity:** XS — a few characters to remove.

---

### FIX-02 · Q&A Turn Limit Bypass (Unlimited Gemini API Cost Exposure)
**Priority:** Critical — financial and abuse risk
**File:** `supabase/functions/plant-chat/index.ts` (lines 40–42)

**Problem:** The 3-turn limit is checked against the `messages` array sent in the request body, which is fully client-controlled. Any caller can send `messages: []` every time to bypass the limit and make unlimited Gemini API calls.

**Fix:** After fetching the plant log, also fetch the existing conversation from `plant_conversations`. Count turns from the DB record, not the request body.

```typescript
// After fetching log, fetch the stored conversation:
const { data: storedConv } = await supabase
  .from('plant_conversations')
  .select('messages')
  .eq('log_id', log_id)
  .eq('user_id', user_id)
  .maybeSingle()

const storedTurns = (storedConv?.messages ?? []).filter((m: Message) => m.role === 'user').length
if (storedTurns >= MAX_TURNS) {
  return json({ error: 'max_turns_reached' }, 400)
}
// Use storedConv.messages as the authoritative history, not the request body messages
```

**Complexity:** S — ~15 lines added, logic restructured.

---

### FIX-03 · user_id Not Verified Against Auth Session (Conversation Spoofing)
**Priority:** Critical — users can read/write each other's Q&A
**File:** `supabase/functions/plant-chat/index.ts` (line 27)

**Problem:** The `user_id` comes from the request body and is used directly to query/write `plant_conversations`. No check against the authenticated JWT session. Any user can pass any `user_id` to impersonate another user.

**Fix Option A (preferred):** Extract `user_id` from the Supabase JWT, not the request body. The function is deployed with `--no-verify-jwt`, so add manual JWT extraction.

```typescript
// Extract user identity from the Authorization header JWT
const authHeader = req.headers.get('Authorization') ?? ''
const token = authHeader.replace('Bearer ', '')
// Supabase JWTs carry sub = user_id for authenticated users
// For guest users, accept user_id from body only if it starts with 'guest_'
// For authenticated users, ignore request body user_id entirely
```

**Fix Option B (simpler):** Deploy `plant-chat` WITH `--no-verify-jwt` removed, and extract the authenticated user from `supabase.auth.getUser()`. Guest users (no JWT) are served with request-body `user_id` but scoped to guest_ prefix validation.

**Complexity:** M — auth extraction logic, test both guest and registered paths.

---

### FIX-27 · Harden Anon RLS (Mass Deletion Vulnerability)
**Priority:** Critical — Security
**File:** `supabase/migrations/security_rls_plant_logs.sql`

**Problem:** Anon delete policy is `USING (true)`, allowing any user with the anon key to wipe the entire database.

---

### FIX-04 · PostgREST Filter Injection via Plant Nickname
**Priority:** High — user-controlled input injected into DB filter string
**File:** `supabase/functions/plant-processor/index.ts` (line 469)

**Problem:** `nickname` is concatenated into a PostgREST `.or()` filter string. Characters like `)` in the nickname could break the filter structure.

**Fix:** Use parameterized Supabase query methods instead of string concatenation for the nickname match. Split the `.or()` into two separate queries and merge results in application code, or use `.filter()` with PostgREST's proper escaping.

```typescript
// Instead of string-injected .or(), build the query conditionally:
let query = supabase
  .from('plant_logs')
  .select('VisualAnalysis, HealthStatus, PlantName, created_at')
  .eq('user_id', user_id)
  .eq('status', 'done')
  .lt('created_at', log.created_at)
  .order('created_at', { ascending: false })
  .limit(1)

if (nickname) {
  query = query.eq('plant_nickname', nickname)  // proper escaping by the client
} else if (log.latitude && log.longitude) {
  query = query
    .gte('latitude', log.latitude - threshold)
    .lte('latitude', log.latitude + threshold)
    .gte('longitude', log.longitude - threshold)
    .lte('longitude', log.longitude + threshold)
}
```

**Complexity:** S — refactor one query block.

---

## TIER 2 — High Priority (Functionality & Cost)

---

### FIX-05 · No Timeout on Gemini Call in plant-chat (Hanging Edge Function)
**Priority:** High — can block all concurrent chat users
**File:** `supabase/functions/plant-chat/index.ts` (line 134)

**Problem:** `plant-chat` uses plain `fetch()` with no timeout. If Gemini is slow or hangs, the edge function blocks for the full Supabase 150s limit, consuming a connection and degrading perceived app performance.

**Fix:** Replace the bare `fetch()` with the same `fetchWithTimeout` pattern used in `plant-processor`.

```typescript
// Add fetchWithTimeout at the top of plant-chat (copy from plant-processor):
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...init, signal: ctrl.signal }) }
  finally { clearTimeout(t) }
}

// Then replace the bare fetch call:
const geminiRes = await fetchWithTimeout(geminiUrl, { method: 'POST', ... }, 30000)
```

**Complexity:** XS — copy utility function, replace one line.

---

### FIX-06 · Polling Fetches SELECT * Every 8 Seconds
**Priority:** High — unnecessary DB load, especially at scale
**File:** `src/components/AnalysingScreen.jsx` (line 69)

**Problem:** The HTTP polling fallback fetches all columns from `plant_logs` every 8 seconds, including large JSONB fields (processing_log, vital_signs, growth_milestones, plantnet_candidates). Only `status` is needed during polling.

**Fix:** Poll on `status` and `error_details` only. Fetch the full record in a separate call once `status = 'done'`.

```javascript
// During poll — fetch only what's needed to detect completion:
const { data: poll } = await supabase
  .from('plant_logs')
  .select('status, error_details')
  .eq('id', logId)
  .single()

if (poll?.status === 'done') {
  // NOW fetch the full record to pass to onResultReady:
  const { data: full } = await supabase
    .from('plant_logs')
    .select('*')
    .eq('id', logId)
    .single()
  resolve(full)
}
```

**Complexity:** XS — split one fetch into two.

---

### FIX-07 · No Per-User Rate Limiting on Edge Functions
**Priority:** High — PlantNet 500/day quota and Gemini billing exposure
**Files:** `supabase/functions/plant-processor/index.ts`, `supabase/functions/plant-chat/index.ts`

**Problem:** Any authenticated or guest user can invoke `plant-processor` or `plant-chat` unlimited times. One bad actor can exhaust PlantNet's daily quota or generate significant Gemini API costs.

**Fix:** Add a DB-backed rate limit check at the start of each function. Use `plant_logs` and `plant_conversations` table counts as the source of truth.

```typescript
// plant-processor: max 10 scans per user per day
const todayStart = new Date(); todayStart.setUTCHours(0,0,0,0)
const { count } = await supabase
  .from('plant_logs')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user_id)
  .gte('created_at', todayStart.toISOString())

if ((count ?? 0) >= 10) {
  return new Response(JSON.stringify({ error: 'Daily scan limit reached' }), { status: 429 })
}

// plant-chat: max 20 Q&A questions per user per day (across all plants)
```

**Complexity:** S — one count query + early return in each function.

---

### FIX-08 · care-reminder Will OOM at Scale
**Priority:** High — will break silently as user base grows
**File:** `supabase/functions/care-reminder/index.ts` (lines 37, 52, 62)

**Problem:** Loads ALL subscriptions, ALL mutes, and ALL plant logs for all eligible users into edge function memory in a single pass. At 10K+ users, this exceeds Supabase function memory limits.

**Fix:** Paginate through subscriptions in batches of 100. Process each batch, send notifications, and move to the next batch.

```typescript
// Replace single bulk fetch with paginated batches:
const BATCH_SIZE = 100
let offset = 0
let totalSent = 0

while (true) {
  const { data: batch } = await supabase
    .from('push_subscriptions')
    .select('*')
    .range(offset, offset + BATCH_SIZE - 1)

  if (!batch?.length) break

  // ... process batch, send notifications ...

  offset += BATCH_SIZE
  if (batch.length < BATCH_SIZE) break
}
```

**Complexity:** M — restructure the main loop, test boundary conditions.

---

## TIER 3 — Medium Priority (Bugs & UX)

---

### FIX-09 · Language Dropdown Doesn't Close on Outside Click
**Priority:** Medium — UX bug, dropdown traps focus
**File:** `src/App.jsx` (line 191)

**Problem:** The language settings dropdown has no click-outside listener. Once opened, the only way to close it is selecting a language or clicking the toggle again.

**Fix:** Add a `useEffect` with a `mousedown` listener on the document.

```javascript
const langDropdownRef = useRef(null)

useEffect(() => {
  if (!showSettings) return
  const handler = (e) => {
    if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) {
      setShowSettings(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [showSettings])

// Attach ref to the dropdown container:
<div ref={langDropdownRef} style={{ position: 'relative' }}>
```

**Complexity:** XS.

---

### FIX-10 · Q&A Messages Not Cleared After Correction Re-run
**Priority:** Medium — confusing UX (old Q&A shown after re-identification)
**File:** `src/components/ResultsScreen.jsx` (line 163)

**Problem:** When a correction is submitted, `qaMessages` is not reset. After re-analysis, the Q&A panel still shows the previous conversation about the incorrectly identified plant.

**Fix:** Add `setQaMessages([])` and `setQaLoaded(false)` when correction re-run starts.

```javascript
// In submitCorrection(), after setRerunning(true):
setRerunning(true)
setQaMessages([])      // ← add this
setQaLoaded(false)     // ← add this
setQaOpen(false)       // ← optionally collapse the panel too
```

**Complexity:** XS — two lines.

---

### FIX-11 · Race Condition in Correction Polling
**Priority:** Medium — can apply stale results or double-fire state updates
**File:** `src/components/ResultsScreen.jsx` (line 168)

**Problem:** `setInterval` fires every 3s but each async DB query can take variable time. Multiple in-flight queries can race to call `clearInterval` and `setLocalResult`.

**Fix:** Add an `active` flag that prevents overlapping iterations.

```javascript
let active = true
pollRef.current = setInterval(async () => {
  if (!active || Date.now() - start > 90000) {
    active = false
    clearInterval(pollRef.current)
    if (Date.now() - start > 90000) {
      setRerunning(false)
      setRerunError('Re-analysis timed out. Your correction has been saved.')
    }
    return
  }
  active = false  // prevent next iteration from overlapping
  try {
    const { data } = await supabase.from('plant_logs').select('status,...').eq('id', localResult.id).single()
    if (data?.status === 'done') {
      clearInterval(pollRef.current)
      setLocalResult(prev => ({ ...prev, ...data }))
      setRerunning(false)
    } else if (data?.status === 'error') {
      clearInterval(pollRef.current)
      setRerunning(false)
      setRerunError('Re-analysis failed. Your correction has been saved.')
    }
  } finally {
    active = true  // allow next iteration
  }
}, 3000)
```

**Complexity:** S.

---

### FIX-12 · Guest ID Uses Math.random() Instead of crypto
**Priority:** Medium — predictable IDs in high-traffic scenarios
**File:** `src/App.jsx` (line 43)

**Fix:**
```javascript
// Replace:
`guest_${Math.random().toString(36).slice(2, 11)}`

// With:
`guest_${crypto.randomUUID()}`
```

**Complexity:** XS — one line.

---

### FIX-13 · Q&A Message Length Not Validated
**Priority:** Medium — DB bloat and runaway API costs
**File:** `supabase/functions/plant-chat/index.ts` (line 29)

**Fix:** Add a length guard immediately after parsing the request body.

```typescript
const MAX_QUESTION_LENGTH = 500

if (!question?.trim() || question.length > MAX_QUESTION_LENGTH) {
  return json({ error: 'Question must be between 1 and 500 characters' }, 400)
}
```

**Complexity:** XS.

---

### FIX-14 · module-level navigator.userAgent
**Priority:** Medium — will crash in any non-browser environment (tests, SSR)
**File:** `src/components/UploadScreen.jsx` (line 7)

**Fix:** Move the UA check inside the component or a lazy getter.

```javascript
// Remove the module-level const. Inside the component:
const isAndroid = useMemo(() => /Android/i.test(navigator.userAgent), [])
```

**Complexity:** XS.

---

### FIX-15 · PlantNet Cache Has No TTL
**Priority:** Medium — serves stale identifications as PlantNet's model improves
**File:** `supabase/functions/plant-processor/index.ts` (cache lookup block)

**Fix:** Add a `created_at` freshness check to the cache lookup. Entries older than 60 days are ignored and a fresh call is made.

```typescript
const CACHE_MAX_AGE_DAYS = 60
const cutoff = new Date()
cutoff.setDate(cutoff.getDate() - CACHE_MAX_AGE_DAYS)

const { data: cached } = await supabase
  .from('plantnet_cache')
  .select('result')
  .eq('image_hash', imageHash)
  .gte('created_at', cutoff.toISOString())   // ← add this
  .maybeSingle()
```

**Complexity:** XS — one filter clause.

---

### FIX-16 · care-reminder Auth Check is Misleading
**Priority:** Medium — code correctness / future maintainability
**File:** `supabase/functions/care-reminder/index.ts` (lines 31–34)

**Problem:** The manual `Bearer` prefix check validates nothing. Supabase JWT verification is already handled at the infrastructure layer (the function is deployed without `--no-verify-jwt`). The check creates false confidence.

**Fix:** Remove the manual check entirely. Add a comment explaining that auth is enforced at the Supabase layer.

```typescript
// Auth is enforced at the Supabase infrastructure layer (deployed without --no-verify-jwt).
// pg_cron sends the service-role JWT; any other caller will be rejected before reaching here.
```

**Complexity:** XS.

---

### FIX-17 · Guest Records Never Cleaned Up
**Priority:** Medium — table growth, query performance degradation over time
**Files:** New Supabase migration + pg_cron job

**Fix:** Create a scheduled pg_cron job that deletes guest (non-UUID) user rows from `plant_logs` older than 30 days with no corresponding `user_profiles` migration.

```sql
-- Migration: add cleanup cron job
SELECT cron.schedule(
  'cleanup-orphan-guest-logs',
  '0 3 * * *',   -- 3am UTC daily
  $$
  DELETE FROM plant_logs
  WHERE user_id LIKE 'guest_%'
    AND created_at < NOW() - INTERVAL '30 days';
  $$
);
```

**Complexity:** S — one migration file.

---

## TIER 4 — New Feature: Edibility & Plant Classification

---

### FIX-18 · Results Don't Classify Plant as Edible, Weed, Medicinal, or Ornamental
**Priority:** High UX gap — home gardeners frequently need to know "can I eat this?" or "should I pull this out?"
**Files:** `supabase/functions/plant-processor/index.ts`, `src/components/ResultsScreen.jsx`, new DB migration

**Problem:** The current results show health status, toxicity (pet/human safety), and care advice — but never tell the user what category of plant they're looking at. A home gardener who photographs an unknown seedling has no way to know if it's:
- A vegetable/herb they should nurture
- A weed competing with their garden plants
- A medicinal/aromatic plant
- An invasive species to remove
- An ornamental with no culinary/medicinal use

The toxicity card partially covers safety but conflates "this plant is toxic to touch" with "this plant is not edible" — these are different concepts.

**Implementation:**

**Step 1 — Add to Gemini schema (`plant-processor/index.ts`):**
```typescript
// Add to PLANT_ANALYSIS_SCHEMA properties:
plant_classification: {
  type: "object",
  properties: {
    primary_use: {
      type: "string",
      enum: ["vegetable", "fruit", "herb_culinary", "herb_medicinal", "ornamental", "weed", "tree", "succulent", "invasive", "unknown"]
    },
    is_edible: { type: "boolean" },
    edible_parts: { type: "string", nullable: true },        // "leaves and young shoots", "fruit only", etc.
    edibility_notes: { type: "string", nullable: true },     // "raw leaves are bitter; cook before eating"
    is_weed: { type: "boolean" },
    weed_action: { type: "string", nullable: true },         // "remove before it seeds", "pull from root to prevent regrowth"
    cultivation_status: {
      type: "string",
      enum: ["cultivated", "wild", "invasive", "naturalised", "unknown"]
    }
  }
},
```

**Step 2 — Add to Gemini prompt instruction list (`plant-processor/index.ts`):**
```
16. PLANT CLASSIFICATION: Determine the plant's primary use and edibility.
  - primary_use: one of vegetable / fruit / herb_culinary / herb_medicinal / ornamental / weed / tree / succulent / invasive / unknown
  - is_edible: true if any part is edible by humans under normal preparation
  - edible_parts: which parts and how (e.g. "young leaves — blanch before eating", "fruit when ripe")
  - is_weed: true if this plant is typically unwanted in a garden context and should be removed
  - weed_action: if is_weed=true, give one concrete removal instruction (e.g. "pull before flowering to stop seed spread")
  - cultivation_status: whether this appears to be deliberately cultivated or growing wild
  Write edibility_notes and weed_action in ${userLang}.
```

**Step 3 — Add DB column (new migration `sprint19_plant_classification.sql`):**
```sql
ALTER TABLE plant_logs ADD COLUMN IF NOT EXISTS plant_classification jsonb;
```

**Step 4 — Store in DB update (`plant-processor/index.ts`):**
```typescript
plant_classification: result.plant_classification ?? null,
```

**Step 5 — Display in ResultsScreen (`src/components/ResultsScreen.jsx`):**

Add a "Plant Classification" card between the Hero card and Vital Signs. Show:
- A large pill badge: 🥬 Edible Vegetable / 🌸 Ornamental / 🌿 Culinary Herb / ⚠️ Weed / 💊 Medicinal / 🚫 Invasive
- If `is_edible = true`: show a green "Edible" section listing `edible_parts` and `edibility_notes`
- If `is_weed = true`: show an amber "Garden Weed" section with `weed_action` as the recommended action
- `cultivation_status` as a small secondary badge (Cultivated / Wild)

```jsx
{localResult?.plant_classification && (
  <div className="fade-up verdant-card" style={styles.section}>
    <h3 style={styles.sectionTitle}>Plant Classification</h3>

    {/* Primary use badge */}
    <div style={{ marginBottom: '16px' }}>
      <ClassificationBadge use={localResult.plant_classification.primary_use} />
    </div>

    {/* Edibility block */}
    {localResult.plant_classification.is_edible && (
      <div style={styles.edibleBlock}>
        <span style={styles.edibleIcon}>🥬</span>
        <div>
          <p style={styles.edibleTitle}>Edible Plant</p>
          {localResult.plant_classification.edible_parts && (
            <p style={styles.edibleParts}>{localResult.plant_classification.edible_parts}</p>
          )}
          {localResult.plant_classification.edibility_notes && (
            <p style={styles.edibleNotes}>{localResult.plant_classification.edibility_notes}</p>
          )}
        </div>
      </div>
    )}

    {/* Weed removal block */}
    {localResult.plant_classification.is_weed && (
      <div style={styles.weedBlock} role="alert">
        <span style={styles.weedIcon}>⚠️</span>
        <div>
          <p style={styles.weedTitle}>Garden Weed — Consider Removing</p>
          {localResult.plant_classification.weed_action && (
            <p style={styles.weedAction}>{localResult.plant_classification.weed_action}</p>
          )}
        </div>
      </div>
    )}
  </div>
)}
```

**Color scheme for primary_use badges:**
| Use | Color |
|---|---|
| vegetable / fruit / herb_culinary | `#0D9488` (teal / edible) |
| herb_medicinal | `#7C3AED` (purple / medicinal) |
| ornamental | `#2563EB` (blue / decorative) |
| weed / invasive | `#D97706` (amber / caution) |
| tree / succulent | `#52B788` (leaf green / neutral) |
| unknown | `var(--text-4)` (grey) |

**Complexity:** M — schema addition, prompt update, DB migration, new UI card. End-to-end but straightforward.

---

## TIER 5 — Low Priority / Feature Gaps

---

### FIX-19 · Fertilise & Pest Check Actions Not Exposed in UI
**Priority:** Low — DB supports it, UI doesn't use it
**Files:** `src/components/PlantDetailScreen.jsx`

**Fix:** Add "Mark fertilised" and "Mark pest checked" buttons alongside the existing "Mark watered" button. Each logs to `plant_care_actions` with the appropriate `action_type`.

---

### FIX-20 · No Search / Filter in My Garden
**Priority:** Low — friction for users with many plants
**File:** `src/components/HistoryScreen.jsx`

**Fix:** Add a search input at the top of the grid that filters plant groups client-side by `PlantName` or `plant_nickname`. No backend change needed.

---

### FIX-21 · Share Functionality Missing
**Priority:** Low — missed viral growth opportunity
**File:** `src/components/ResultsScreen.jsx`

**Fix:** Add a "Share" button using the Web Share API (`navigator.share()`). Share payload: plant name, health status, confidence score, and app URL. Fallback to clipboard copy on unsupported browsers.

```javascript
const shareResult = async () => {
  const text = `I just identified my ${localResult.PlantName} with BotanIQ! Health: ${localResult.HealthStatus} (${localResult.AccuracyScore}% confidence)`
  if (navigator.share) {
    await navigator.share({ title: 'My Plant Diagnosis', text, url: 'https://plant-health-diagnosis.vercel.app' })
  } else {
    navigator.clipboard.writeText(text)
  }
}
```

---

### FIX-22 · Photos Lost on Scan Error
**Priority:** Low — annoys users who experienced network failure
**Files:** `src/App.jsx`, `src/components/UploadScreen.jsx`

**Fix:** Lift `slotImages` state to `App.jsx`. On error, pass the existing `slotImages` back to `UploadScreen` instead of resetting to empty slots. Add a "Retry with same photos" secondary button on the error state in `AnalysingScreen`.

---

### FIX-23 · No Account Logout or Data Export
**Priority:** Low (required for GDPR compliance in the medium term)
**Files:** `src/App.jsx`, `src/components/RegisterModal.jsx` or new settings screen

**Fix:** 
- Add `supabase.auth.signOut()` call behind a "Sign out" button in the language/settings dropdown.
- Add a "Delete my data" button that calls a Supabase edge function to delete all `plant_logs`, `plant_conversations`, and `user_profiles` rows for the authenticated user, then signs out.

---

### FIX-24 · Confidence Score Tooltip is Opaque
**Priority:** Low — trust/credibility improvement
**File:** `src/components/ResultsScreen.jsx` (CONF_CONFIG, line 13)

**Fix:** Replace the tooltip text with source-explicit language.

```javascript
// Replace:
tip: 'Two independent sources agreed on this identification.'

// With:
tip: `PlantNet's botanical database and our AI both identified this as the same species — high agreement between independent sources.`
```

---

### FIX-25 · Dark Mode Support
**Priority:** Low — standard 2025 expectation
**Files:** `src/index.css`, all component style objects

**Fix:** Add a `prefers-color-scheme: dark` media query to `index.css` that overrides the CSS custom properties (--bg, --card, --text-1, etc.) with dark equivalents. Components use CSS vars throughout, so no JSX changes needed.

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg:     #0A1A10;
    --card:   #12251A;
    --border: #1E3A28;
    --text-1: #E8F5EE;
    --text-2: #A8C8B4;
    --text-3: #6B9E82;
    --text-4: #3D6B50;
    --mist:   #0F1F16;
    --sage:   #1B3325;
  }
}
```

---

### FIX-26 · Realtime Channel Limit at Scale
**Priority:** Low now, High at 500+ concurrent users
**File:** `src/components/AnalysingScreen.jsx`

**Fix:** The existing HTTP polling fallback already handles missed WebSocket events. The Realtime channel is an optimization. At scale, consider removing Realtime entirely and relying on polling-only with a shorter interval (4s instead of 8s) to reduce Supabase channel usage.

---

## TIER 6 — Care-First Proactive Intelligence

---

### FIX-28 · Treatment Follow-up Logic
**Priority:** Medium (Product Gap)
**Logic:** If `pest_detected` is true, schedule a "Verification Scan" reminder in 7 days via `push_subscriptions`.

---

### FIX-29 · Weather-Driven Care Alerts
**Priority:** Medium (Product Gap)
**Logic:** Update Gemini prompt to use the `weatherSnippet` to suggest moving plants indoors or extra watering if extreme heat/rain is detected.

---

### FIX-30 · Offline Scan Queue
**Priority:** Medium (UX)
**Logic:** Use `IndexedDB` in the frontend to store images when `navigator.onLine` is false, syncing them automatically when connectivity returns.

## Implementation Order Summary

| Order | Fix ID | What | Effort |
|---|---|---|---|
| 1 | FIX-01 | Fix broken template literal — deploy blocker | XS |
| 2 | FIX-02 | Q&A turn limit — DB-side verification | S |
| 3 | FIX-03 | user_id auth verification in plant-chat | M |
| 4 | FIX-04 | PostgREST filter injection fix | S |
| 5 | **FIX-27** | **RLS Security Hardening** | **XS** |
| 5 | FIX-07 | Rate limiting on edge functions | S |
| 6 | FIX-09 | Language dropdown click-outside | XS |
| 7 | FIX-10 | Clear Q&A on correction re-run | XS |
| 8 | FIX-05 | Timeout on plant-chat Gemini call | XS |
| 9 | FIX-06 | Poll SELECT status only | XS |
| 10 | FIX-12 | Guest ID use crypto.randomUUID | XS |
| 11 | FIX-13 | Q&A question length limit | XS |
| 12 | FIX-14 | Move navigator.userAgent inside component | XS |
| 13 | FIX-15 | PlantNet cache TTL | XS |
| 14 | FIX-16 | Remove misleading auth check in care-reminder | XS |
| 15 | FIX-11 | Race condition in correction polling | S |
| 16 | FIX-17 | Guest record cleanup cron | S |
| 17 | FIX-08 | Paginate care-reminder | M |
| 18 | **FIX-18** | **Edibility & weed classification** | **M** |
| 19 | FIX-19 | Fertilise/pest check UI buttons | S |
| 20 | **FIX-28** | **Treatment Follow-up Reminders** | **S** |
| 21 | **FIX-29** | **Weather-Driven Care Alerts** | **XS** |
| 22 | **FIX-30** | **Offline Scan Queue** | **M** |
| 20 | FIX-20 | Search in My Garden | S |
| 21 | FIX-21 | Share functionality | S |
| 22 | FIX-22 | Preserve photos on scan error | S |
| 23 | FIX-23 | Logout + data deletion | M |
| 24 | FIX-24 | Confidence tooltip clarity | XS |
| 25 | FIX-25 | Dark mode | M |
| 26 | FIX-26 | Realtime channel scaling | M |

---

*Effort key: XS = <30 min · S = 30–90 min · M = 2–4 hours*
