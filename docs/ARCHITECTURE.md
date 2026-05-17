# BotanIQ — System Architecture

## Overview

BotanIQ is a serverless, event-driven architecture. The React frontend runs on Vercel CDN; all compute happens in Supabase Edge Functions (Deno runtime) triggered either by HTTP calls from the frontend or by pg_cron schedules inside Supabase.

```
┌──────────────────────────────────────────────────────┐
│                    User's Browser                     │
│  React 18 + Vite PWA (Vercel CDN)                    │
│                                                       │
│  UploadScreen → AnalysingScreen → ResultsScreen      │
│  HistoryScreen → PlantDetailScreen                   │
│  SupportModal  │  RegisterModal                      │
└────────┬───────────────────────────────┬─────────────┘
         │  HTTPS                        │  Supabase Realtime
         │                               │  (WebSocket)
┌────────▼───────────────────────────────▼─────────────┐
│                   Supabase Platform                   │
│                                                       │
│  ┌─────────────────┐    ┌──────────────────────────┐ │
│  │  Postgres DB     │    │  Storage (plant_images)  │ │
│  │  (plant_logs,   │    │  Public bucket           │ │
│  │   users, etc.)  │    └──────────────────────────┘ │
│  └────────┬────────┘                                  │
│           │  Realtime change events                   │
│  ┌────────▼────────────────────────────────────────┐ │
│  │              Edge Functions (Deno)               │ │
│  │                                                  │ │
│  │  plant-processor  ─── HTTP trigger from client   │ │
│  │  plant-chat       ─── HTTP trigger from client   │ │
│  │  support-request  ─── HTTP trigger from client   │ │
│  │  care-reminder    ─── pg_cron hourly             │ │
│  │  weekly-digest    ─── pg_cron Sunday 8am UTC     │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────┬─────────────────────────┘
                             │  HTTPS
           ┌─────────────────┴─────────────────┐
           │         External APIs              │
           │                                   │
           │  PlantNet API (botanical ID)       │
           │  Google Gemini 2.5 Flash (AI)      │
           │  Brevo (transactional email)       │
           │  Web Push endpoints (VAPID)        │
           │  ipapi.co (geolocation fallback)   │
           └───────────────────────────────────┘
```

---

## Scan Flow (Happy Path)

```
1. User selects 1–3 photos in UploadScreen
   ↓
2. UploadScreen compresses images (JPEG, max 1200px)
   Checks navigator.onLine → if offline, queues in IndexedDB

3. Images uploaded to Supabase Storage (plant_images bucket)
   → Public URLs returned

4. plant_logs row inserted with status='pending'
   { user_id, image_url, additional_images, plant_nickname, preferred_language, ... }

5. plant-processor called (HTTP POST with log ID)
   ↓
6. plant-processor: Stage 1 — PlantNet
   a. SHA-256 hash primary image bytes
   b. Check plantnet_cache (60-day TTL)
   c. Cache miss → call PlantNet API (include-related-images=true)
   d. Store result in cache + extract reference leaf image URL
   e. Update plant_logs: status='processing'

7. plant-processor: Stage 2 — Gemini
   a. Build prompt with regional context, PlantNet candidates, prior scan history
   b. Anti-anchoring: Step 1 = independent ID, Step 2 = see PlantNet hints, Step 3 = reconcile
   c. Structured output via PLANT_ANALYSIS_SCHEMA (responseSchema)
   d. Gemini returns: PlantName, ScientificName, HealthStatus, CarePlan,
      care_schedule, vital_signs, toxicity, light_intensity_analysis,
      seasonal_context, growth_milestones, plant_classification,
      nutrient_recommendations, harvest_guide, pest_detected, pest_treatment

8. plant-processor: Stage 3 — Compute confidence + DB update
   a. AccuracyScore computed from cross-validation logic (5 tiers, 60–93%)
   b. plant_logs updated: status='done', all AI fields, plantnet_reference_image
   c. If pest_detected: insert into follow_up_reminders (remind_at = now + 7 days)

9. Supabase Realtime pushes change to AnalysingScreen WebSocket channel
   → client calls onResultReady(fullRecord) → navigates to ResultsScreen

   Fallback: HTTP polling every 8s on status+error_details only;
             full SELECT * on done
```

---

## Correction Re-run Flow

When user submits "Wrong plant" correction:

```
1. ResultsScreen: user types correct plant name → submitCorrection()
2. plant_logs updated: UserCorrection='Tomato', IsCorrect=false
3. plant-processor called again with { record_id, user_correction }
   ↓
4. plant-processor detects user_correction field:
   a. Skips PlantNet entirely (image unchanged — result would be identical)
   b. Fetches existing plantnet_candidates + plantnet_reference_image from DB
   c. Injects user correction as top candidate in Gemini cross-validate prompt
      (labeled as user-provided, not PlantNet — no anchoring)
   d. Gemini still does independent ID first
   e. preserves existing plantnet_reference_image in DB update
5. Same Stage 2/3 logic as happy path
6. ResultsScreen skeleton shimmer shown during re-run (Q&A cleared)
```

---

## Offline Queue Flow

```
1. UploadScreen detects navigator.onLine === false
2. Compress images → store blobs + metadata in IndexedDB (botaniq_offline_v1)
3. Blue banner shown: "X scan(s) queued — will upload when connection returns"
4. window 'online' event fires:
   a. Read all entries from IndexedDB
   b. Upload each to Supabase Storage
   c. Insert plant_logs row
   d. Call plant-processor (same as normal path)
   e. Delete entry from IndexedDB
5. onUploadComplete called → navigate to AnalysingScreen
```

---

## Push Notification Flow

```
pg_cron → care-reminder (hourly)
  ↓
  Step 1: Paginate push_subscriptions (batches of 100)
  Step 2: For each subscription:
    a. Fetch user's latest plant_logs (status='done', pest_detected or care_schedule)
    b. Check push_mutes for each plant
    c. Convert UTC midnight to user's timezone (stored at subscribe time)
    d. If current local hour = 8am → send watering/fertilising due notifications
  Step 3: Process follow_up_reminders:
    a. Fetch rows where remind_at <= now AND processed = false
    b. Send pest follow-up push to subscribed user
    c. Mark processed = true (regardless of subscription — prevents infinite retry)
  Step 4: Clean stale push endpoints (410 Gone responses from browser)
```

---

## Edge Function Responsibilities

| Function | Auth | Rate limit | Calls |
|---|---|---|---|
| `plant-processor` | No JWT required (`--no-verify-jwt`) | 10 scans/user/day (corrections exempt) | PlantNet API, Gemini API, Supabase DB |
| `plant-chat` | No JWT required; user verified via header JWT for auth users | 20 Q&A questions/user/day | Gemini API, Supabase DB |
| `support-request` | No JWT required | None | Brevo API |
| `care-reminder` | JWT required (pg_cron service role) | N/A — cron only | Web Push endpoints, Supabase DB |
| `weekly-digest` | No JWT required (public unsubscribe GET) | N/A — cron only | Brevo API, Supabase DB |

---

## Database Migrations

Executed in order (all migrations are idempotent via `IF NOT EXISTS`):

| Migration file | What it does |
|---|---|
| `sprint12_feedback_conversations.sql` | Creates `identification_feedback` + `plant_conversations` tables with RLS |
| `sprint13_push_notifications.sql` | Creates `push_subscriptions`, `push_mutes`, `plant_care_actions` tables; pg_cron hourly job |
| `sprint16_enrichments.sql` | Adds `vital_signs jsonb` to `plant_logs` |
| `sprint17_weekly_digest.sql` | Adds `email_digest_opt_out` to `user_profiles` |
| `security_rls_plant_logs.sql` | Tightens `plant_logs` RLS (auth users scoped to `auth.uid()`, anon delete hardened) |
| `sprint19_cleanup_cron.sql` | pg_cron job: delete guest logs older than 30 days at 3am UTC |
| `sprint20_classification_reminders.sql` | Adds `plant_classification jsonb` to `plant_logs`; creates `follow_up_reminders` table |
| `sprint23_results_overhaul.sql` | Adds `plantnet_reference_image`, `nutrient_recommendations`, `harvest_guide` to `plant_logs` |

---

## Realtime Channels

| Channel pattern | Publisher | Subscriber | Purpose |
|---|---|---|---|
| `log-monitor-{id}` | Supabase Postgres trigger | AnalysingScreen | Notify client when scan status changes |
| `history_realtime_sync` | Supabase Postgres trigger | HistoryScreen | Sync new scans into garden view |

---

## Key Architectural Decisions

**Anti-anchoring prompt design:** Gemini performs independent plant ID (Step 1) before seeing PlantNet candidates (Step 2). This prevents PlantNet's score from biasing Gemini toward an incorrect identification.

**PlantNet caching:** Identical images (SHA-256 match) use cached PlantNet results. 60-day TTL prevents serving identifications from an outdated model version.

**Status-only polling:** The HTTP polling fallback fetches only `status` and `error_details`. Full `SELECT *` only fires once when `status = 'done'`. This keeps polling cheap at scale.

**DB-side turn enforcement:** `plant-chat` counts turns from the `plant_conversations` DB record, not from the client's request body. Client cannot bypass the 3-turn limit by sending an empty `messages` array.

**Correction re-run skips PlantNet:** When a user corrects the ID, the image hasn't changed — PlantNet's result would be identical. Skipping it saves API quota and reduces latency.

**Pagination in care-reminder:** All push subscription processing is paginated in batches of 100 to avoid memory overflow as the user base grows.
