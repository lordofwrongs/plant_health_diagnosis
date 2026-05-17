# BotanIQ — API Specification

All edge functions are hosted at:  
`https://thgdxffelonamukytosq.supabase.co/functions/v1/{function-name}`

CORS is open (`*`) on all functions. No API key is required from the frontend — the Supabase anon key in the request headers is sufficient for functions deployed with `--no-verify-jwt`.

---

## plant-processor

Runs the full AI pipeline for a scan: PlantNet → Gemini → DB update.

**Trigger:** HTTP POST, called by the frontend after inserting a `plant_logs` row.  
**Auth:** No JWT required (`--no-verify-jwt`). Rate limited: 10 scans/user/day (corrections exempt).

### Request

```http
POST /functions/v1/plant-processor
Content-Type: application/json
apikey: <supabase-anon-key>
```

```json
{
  "record_id": "uuid",
  "user_correction": "Tomato"
}
```

| Field | Required | Notes |
|---|---|---|
| `record_id` | Yes | UUID of the `plant_logs` row to process |
| `user_correction` | No | If present, skips PlantNet and uses this name as the top candidate |

### Response

```json
{ "ok": true }
```

On error:

| Status | Body | Condition |
|---|---|---|
| 400 | `{ "error": "record_id required" }` | Missing record_id |
| 404 | `{ "error": "Record not found or not pending" }` | Row doesn't exist |
| 409 | `{ "error": "Already processing" }` | Status is not `pending` |
| 429 | `{ "error": "Daily scan limit reached" }` | >10 scans today |
| 500 | `{ "error": "..." }` | Internal error |

### DB side effects

- `plant_logs` row updated with all AI fields (`status → 'done'`, `PlantName`, `AccuracyScore`, `vital_signs`, `nutrient_recommendations`, `harvest_guide`, `plantnet_reference_image`, etc.)
- If `pest_detected = true`: row inserted into `follow_up_reminders` (remind_at = now + 7 days)
- PlantNet result stored in `plantnet_cache` (keyed by SHA-256 of primary image bytes)
- `processing_log` jsonb field updated with observability data

---

## plant-chat

Handles Q&A turns for a specific scan. Stores conversation history per scan.

**Trigger:** HTTP POST, called by ResultsScreen Q&A panel.  
**Auth:** No JWT required; authenticated user's `user_id` verified via Authorization header JWT. Guests must pass `guest_`-prefixed ID.  
**Rate limit:** 20 Q&A questions/user/day (across all plants, summed from DB).  
**Turn limit:** 3 turns per scan (DB-enforced from `plant_conversations` record, not client messages).

### Request

```http
POST /functions/v1/plant-chat
Content-Type: application/json
apikey: <supabase-anon-key>
Authorization: Bearer <jwt>  (optional — for authenticated users)
```

```json
{
  "log_id": "uuid",
  "user_id": "guest_abc123 or auth-user-uuid",
  "question": "Why are my leaves yellowing?",
  "preferred_language": "EN"
}
```

| Field | Required | Notes |
|---|---|---|
| `log_id` | Yes | UUID of the `plant_logs` row |
| `user_id` | Yes | Must match JWT sub for auth users; must start with `guest_` for guests |
| `question` | Yes | Max 500 characters |
| `preferred_language` | No | EN / HI / TA / TE — defaults to EN |

### Response

```json
{
  "answer": "The yellowing is likely caused by...",
  "turnsUsed": 2
}
```

On error:

| Status | Body | Condition |
|---|---|---|
| 400 | `{ "error": "Question must be between 1 and 500 characters" }` | Empty or too long |
| 400 | `{ "error": "max_turns_reached" }` | 3 turns already used for this scan |
| 403 | `{ "error": "Unauthorized" }` | user_id doesn't match JWT |
| 404 | `{ "error": "Plant log not found" }` | log_id doesn't exist |
| 429 | `{ "error": "Daily Q&A limit reached" }` | >20 questions today |
| 504 | `{ "error": "Gemini timeout" }` | Gemini API took >30 seconds |

### DB side effects

- `plant_conversations` row upserted: `messages` jsonb appended with new `{role: 'user', content}` and `{role: 'assistant', content}` entries

---

## support-request

Sends a support email to botaniqsupport@gmail.com via Brevo.

**Trigger:** HTTP POST, called by `SupportModal` on form submission.  
**Auth:** No JWT required (`--no-verify-jwt`). Accessible to both guests and authenticated users.

### Request

```http
POST /functions/v1/support-request
Content-Type: application/json
apikey: <supabase-anon-key>
```

```json
{
  "name": "Sundar",
  "email": "user@example.com",
  "message": "My scan keeps failing..."
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | No | Displayed in email subject/body |
| `email` | Yes | Used as Reply-To in the Brevo email |
| `message` | Yes | Max 1000 characters (enforced client-side) |

### Response

```json
{ "ok": true }
```

On error:

| Status | Body | Condition |
|---|---|---|
| 400 | `{ "error": "email and message required" }` | Missing required fields |
| 500 | `{ "error": "Failed to send email" }` | Brevo API failure |

### Side effects

- HTML email sent to botaniqsupport@gmail.com via Brevo with Reply-To set to user's email address

---

## care-reminder

Sends Web Push notifications for watering reminders and pest follow-ups.

**Trigger:** pg_cron, hourly (every hour, 24/7).  
**Auth:** JWT required — deployed without `--no-verify-jwt`. Only callable by pg_cron with the service role JWT.  
**Not callable from frontend.**

### Logic

1. Paginate `push_subscriptions` in batches of 100
2. For each subscription:
   - Load user's plants with due watering/fertilising
   - Check `push_mutes` per plant
   - If local time (from stored `timezone`) = 8am → send push
3. Process `follow_up_reminders`: send pest-check reminder for any `remind_at <= now AND processed = false`; mark `processed = true`
4. Clean stale endpoints (browser returns 410 Gone)

### Response (internal, logged only)

```json
{
  "sent": 14,
  "skipped": 3,
  "cleaned": 1,
  "followUpSent": 2
}
```

---

## weekly-digest

Sends a weekly HTML email digest to all registered users via Brevo.

**Trigger:** pg_cron, Sundays at 8am UTC.  
**Auth:** No JWT required (`--no-verify-jwt`) — needed for public `?action=unsubscribe` GET endpoint.

### Unsubscribe endpoint (GET)

```http
GET /functions/v1/weekly-digest?action=unsubscribe&user_id=uuid&sig=hmac-hex
```

- `sig` is HMAC-SHA256 of `user_id` signed with `UNSUBSCRIBE_SECRET` Supabase secret
- Invalid or missing signature returns 403
- Valid request sets `users.email_digest_opt_out = true`

### Digest email content

- Per-plant card: plant name + health status + watering countdown + pest alert (if applicable)
- "View in app" CTA links to the live app
- One-click unsubscribe link (HMAC-signed)

---

## Supabase Database (direct client access)

The frontend uses the Supabase JS client with the anon key for direct table access. Key operations:

### Insert new scan

```javascript
supabase.from('plant_logs').insert({
  user_id,
  image_url,
  additional_images,
  plant_nickname,
  preferred_language,
  status: 'pending'
})
```

### Poll scan status

```javascript
supabase.from('plant_logs')
  .select('status, error_details')
  .eq('id', logId)
  .single()
```

### Fetch full scan result (on done)

```javascript
supabase.from('plant_logs')
  .select('*')
  .eq('id', logId)
  .single()
```

### Fetch garden (all plants)

```javascript
supabase.from('plant_logs')
  .select('*')
  .eq('user_id', userId)
  .eq('status', 'done')
  .order('created_at', { ascending: false })
```

### Realtime subscription (scan progress)

```javascript
supabase.channel(`log-monitor-${logId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'plant_logs',
    filter: `id=eq.${logId}`
  }, handler)
  .subscribe()
```

---

## Key Schema: plant_logs (AI output fields)

| Field | Type | Produced by | Notes |
|---|---|---|---|
| `PlantName` | text | Gemini | Common name in `preferred_language` |
| `ScientificName` | text | Gemini | Genus species |
| `HealthStatus` | text | Gemini | 2–4 word label |
| `AccuracyScore` | integer | plant-processor | 60–93 based on cross-validation tier |
| `CarePlan` | jsonb | Gemini | Array of `{title, description}` |
| `care_schedule` | jsonb | Gemini | `{water_every_days, fertilise_every_days, check_pests_every_days, notes}` |
| `vital_signs` | jsonb | Gemini | `{hydration, light, nutrients, pest_risk}` — 0–100 |
| `toxicity` | jsonb | Gemini | `{risk_cats, risk_dogs, risk_humans, notes}` — Safe/Caution/Toxic |
| `light_intensity_analysis` | text | Gemini | Narrative from photo lighting analysis |
| `seasonal_context` | text | Gemini | Care note for current month |
| `growth_milestones` | jsonb | Gemini | `{narrative: "..."}` — growth comparison (if prior scan exists) |
| `plant_classification` | jsonb | Gemini | `{primary_use, is_edible, edible_parts, edibility_notes, is_weed, weed_action, cultivation_status}` |
| `nutrient_recommendations` | jsonb | Gemini | `{deficiency_detected, deficiency_signs, primary_fix, organic_option, diy_option, stage_note, caution}` — null if nutrients ≥ 75 |
| `harvest_guide` | jsonb | Gemini | `{days_to_first_harvest, current_stage_estimate, visual_readiness_cues, check_frequency, how_to_harvest, post_harvest_tip, important_warning}` — null for non-edible plants |
| `pest_detected` | boolean | Gemini | |
| `pest_name` | text | Gemini | |
| `pest_treatment` | jsonb | Gemini | Array of treatment step strings |
| `plantnet_candidates` | jsonb | PlantNet | Top 3: `[{name, common, score}]` |
| `plantnet_reference_image` | text | PlantNet | Reference leaf image URL (medium size) |
| `processing_log` | jsonb | plant-processor | Debug: plantnet_score, independent_id, etc. |
