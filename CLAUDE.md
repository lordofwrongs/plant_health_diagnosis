# BotanIQ — Project Context for Claude

## What this is
BotanIQ is a production plant health app built by a non-technical founder. React+Vite frontend on Vercel, Supabase for DB/auth/storage/edge functions, Gemini 2.5 Flash + PlantNet for AI plant identification and health diagnosis.

Live URL: https://plant-health-diagnosis.vercel.app
GitHub: https://github.com/lordofwrongs/plant_health_diagnosis

---

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React 18 + Vite | `src/` — auto-deploys to Vercel on push to `main` |
| Edge functions | Deno (Supabase) | `plant-processor` (full AI pipeline), `plant-chat` (Q&A), `care-reminder` (hourly push notifications), `weekly-digest` (weekly email via Resend) |
| Database | Supabase Postgres | Tables: `plant_logs`, `users`, `user_profiles`, `plantnet_cache`, `identification_feedback`, `plant_conversations`, `push_subscriptions`, `push_mutes`, `plant_care_actions` |
| Storage | Supabase Storage | Bucket: `plant_images` (public) |
| Realtime | Supabase Realtime | Channels: `log-monitor-{id}`, `history_realtime_sync` |
| Auth | Supabase Auth | Magic link only — no passwords |
| AI | Gemini 2.5 Flash | `thinkingBudget: 0` (thinking disabled for speed) |
| Botanical ID | PlantNet API | Free tier 500 req/day; SHA-256 hash cache in `plantnet_cache` |

---

## Credentials
Read from `credentials.env.txt` in project root (never commit this file).
- `SUPABASE_PROJECT_URL` — https://thgdxffelonamukytosq.supabase.co
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `PLANTNET_API_KEY`
- `VAPID_PUBLIC_KEY` — BNrFg1TOhvBK6EcICaGrzxDmVL-7OGGlLSW4_qPxuHANqFANVLlw8NvR-yUTOunfZ9pJITh2bjUOmtP95iDPPLc (set as Supabase secret)
- `VAPID_PRIVATE_KEY` — (set as Supabase secret, value in credentials.env.txt)
- `VAPID_SUBJECT` — mailto:poornima.budda@gmail.com (set as Supabase secret)
- `RESEND_API_KEY` — (set as Supabase secret; get from resend.com dashboard)
- `RESEND_FROM_EMAIL` — e.g. `BotanIQ <digest@yourdomain.com>` (set as Supabase secret; domain must be verified in Resend)
- `APP_URL` — `https://plant-health-diagnosis.vercel.app` (set as Supabase secret — used in digest email links)

Vercel env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL=https://plant-health-diagnosis.vercel.app`, `VITE_VAPID_PUBLIC_KEY` (same as VAPID_PUBLIC_KEY above)

---

## Key Files

| File | Purpose |
|---|---|
| `src/App.jsx` | Router, nav, auth session handler, register modal trigger |
| `src/components/UploadScreen.jsx` | 3-slot photo upload (whole plant / leaf / stem), HEIC check, compression |
| `src/components/AnalysingScreen.jsx` | Progress UI, Realtime + HTTP polling fallback, 90s hard timeout |
| `src/components/ResultsScreen.jsx` | Diagnosis display + thumbs-down correction modal + Q&A collapsible section (3-turn limit) |
| `src/components/HistoryScreen.jsx` | My Garden grid — 2-column photo grid, groups scans by plant, Realtime subscription |
| `src/components/PlantDetailScreen.jsx` | Per-plant detail: hero banner, scan history timeline, retry/delete, watering badge, Q&A indicator |
| `src/components/RegisterModal.jsx` | Soft registration modal — magic link OTP, skip option |
| `supabase/functions/plant-processor/index.ts` | Full AI pipeline: PlantNet → Gemini cross-validate → DB update. Supports correction re-run via `user_correction` field. |
| `supabase/functions/plant-chat/index.ts` | Lightweight Q&A: takes plant context from `plant_logs`, calls Gemini, stores in `plant_conversations` |
| `supabase/functions/care-reminder/index.ts` | Hourly cron job: checks watering due dates, sends Web Push via VAPID, cleans stale subscriptions |
| `supabase/functions/weekly-digest/index.ts` | Weekly cron job: sends HTML email digest via Resend to all registered users (not opted out). Handles GET `?action=unsubscribe&user_id=xxx` for one-click unsubscribe. |
| `supabase/migrations/sprint17_weekly_digest.sql` | Adds `email_digest_opt_out` column to `user_profiles` + commented pg_cron schedule snippet |
| `supabase/migrations/sprint12_feedback_conversations.sql` | ✅ Executed — creates `identification_feedback` + `plant_conversations` tables with RLS and indexes |
| `supabase/migrations/sprint13_push_notifications.sql` | ✅ Executed — creates `push_subscriptions`, `push_mutes`, `plant_care_actions` tables. pg_cron job scheduled hourly. VAPID secrets set. `VITE_VAPID_PUBLIC_KEY` added to Vercel. |
| `src/utils/pushNotifications.js` | Push subscription helpers: subscribe/unsubscribe, mute/unmute per plant, VAPID key handling |
| `src/index.css` | Design tokens (CSS custom properties), animations |
| `src/supabaseClient.js` | Supabase client init |
| `src/logger.js` | Structured console logger |
| `public/sw.js` | Service worker: network-first nav, cache-first assets, bypass API hosts |
| `public/manifest.json` | PWA manifest — name BotanIQ, theme #1B4332 |

---

## Database Schema (current)

```
plant_logs
  id uuid PK
  user_id text                  -- guest_id or supabase auth user id
  image_url text                -- primary photo (Supabase Storage URL)
  additional_images text[]      -- secondary angles (leaf, stem)
  status text                   -- pending | processing | done | error | quality_issue
  PlantName text
  ScientificName text
  HealthStatus text             -- 2-4 word label e.g. "Mildly Stressed"
  AccuracyScore int             -- 0–100 confidence
  CareInstructions jsonb        -- array of {title, description}
  care_schedule jsonb           -- {water_every_days, fertilise_every_days, check_pests_every_days, notes}
  processing_log jsonb          -- debug: plantnet_score, independent_id, etc.
  plantnet_candidates jsonb     -- top 3 PlantNet candidates [{name, common, score}]
  IsCorrect boolean             -- user feedback: was identification correct?
  UserCorrection text           -- user-provided correction name
  error_details text
  pest_detected boolean
  pest_name text
  pest_treatment jsonb          -- array of treatment step strings
  created_at timestamptz
  toxicity jsonb                -- {risk_cats, risk_dogs, risk_humans, notes} — ✅ wired Sprint 16
  light_intensity_analysis text -- ✅ wired Sprint 16
  seasonal_context text         -- ✅ wired Sprint 16
  vital_signs jsonb             -- {hydration, light, nutrients, pest_risk} 0–100 scores — ✅ added Sprint 16, migration executed
  growth_milestones jsonb       -- schema only, not yet in AI pipeline

push_subscriptions               -- ✅ created Sprint 13
  id uuid PK
  user_id text
  endpoint text UNIQUE          -- browser push endpoint URL
  p256dh text                   -- browser push key
  auth_key text                 -- browser push auth secret
  timezone text                 -- IANA timezone from Intl.DateTimeFormat at subscribe time
  created_at, updated_at timestamptz

push_mutes                       -- ✅ created Sprint 13
  id uuid PK
  user_id text
  plant_name text               -- plant identity key (plant_nickname || PlantName)
  created_at timestamptz
  UNIQUE(user_id, plant_name)

plant_care_actions               -- ✅ created Sprint 13
  id uuid PK
  user_id text
  plant_name text               -- plant identity key (plant_nickname || PlantName)
  action_type text              -- 'watered' | 'fertilised' | 'pest_checked'
  actioned_at timestamptz       -- when the user marked the action as done

users
  id uuid PK
  first_name, last_name, email, phone, guest_id, created_at

user_profiles
  id uuid PK (= supabase auth user id)
  email, first_name, last_name, phone, guest_id, created_at
  email_digest_opt_out boolean DEFAULT false   -- ✅ added Sprint 17

plantnet_cache
  image_hash text PK            -- SHA-256 of image bytes
  result jsonb
  created_at timestamptz

identification_feedback          -- ✅ created Sprint 12b
  id uuid PK
  log_id uuid FK → plant_logs
  user_id text
  user_correction text
  created_at timestamptz

plant_conversations              -- ✅ created Sprint 12b
  id uuid PK
  log_id uuid FK → plant_logs
  user_id text
  messages jsonb                -- [{role: 'user'|'assistant', content: string}]
  created_at timestamptz
  updated_at timestamptz
```

RLS: `plant_logs` — anon insert + select + delete (by user_id). `users` — anon insert only. `user_profiles` — auth users upsert own row. `identification_feedback` — anon insert. `plant_conversations` — anon insert/select/update (open — user_id enforced at app layer).

---

## AI Pipeline Summary (`plant-processor/index.ts`)

1. Fetch image from Storage URL(s)
2. Check `plantnet_cache` by SHA-256 hash of primary image
3. If cache miss → call PlantNet → store result in cache
4. Build Gemini prompt with:
   - Regional context (India: specific cucurbit visual distinguishing features)
   - If PlantNet returned results: cross-validate prompt structured as Step1 (independent ID) → Step2 (PlantNet candidates as hints) → Step3 (reconcile) — anti-anchoring design
   - If no PlantNet results: direct identification prompt
   - Multi-image: primary + additional_images sent as separate inlineData parts
   - Pest detection as instruction #11
5. Parse Gemini JSON response → compute AccuracyScore via confidence tiers
6. Update `plant_logs` with all fields

**Confidence tiers:**
- PlantNet ≥85% + Gemini confirms → 93%
- Both agree, PlantNet 70–84% → 90%
- Both agree, PlantNet 50–69% → 83%
- Both agree, PlantNet 20–49% → 75%
- Gemini overrides PlantNet → 60% + "Possibly {name}" prefix
- Gemini only (no PlantNet) → 70%
- Correction re-run (user correction as candidate, Gemini agrees) → 83%
- Correction re-run (Gemini overrides user) → 60%

**Correction re-run flow** (`plant-processor/index.ts`): When `record.user_correction` is set, Stage 1 skips PlantNet entirely (image unchanged — result would be identical). Instead fetches `plantnet_candidates` from the existing `plant_logs` record. Injects user correction as top candidate in cross-validate prompt (labeled as user-provided, not PlantNet score). Gemini still does independent ID first (anti-anchoring). No PlantNet quota used.

---

## Sprints Completed

| Sprint | Feature |
|---|---|
| 1 | Core scan flow: upload → analyse → results |
| 2 | Magic link auth, cross-device garden recovery, guest_id migration |
| 3–4 | Onboarding tour, care schedule UI, confidence tiers display |
| 5 | Realtime updates + HTTP polling fallback, quality gate |
| 6 | PlantNet SHA-256 result caching (`plantnet_cache` table) |
| 7 | Multi-angle diagnosis: 3-slot upload UI, multi-image Gemini pipeline |
| 8 | Pest identification: Gemini prompt + pest card in ResultsScreen |
| 9 | PWA: manifest, service worker, offline page, icons (192+512 PNG + SVG) |
| 10 | Accessibility: ARIA labels, roles, alt text; Sentry template in main.jsx |
| Bug | Magic link redirect fix (VITE_APP_URL env var) |
| Bug | Plant ID anti-anchoring: restructured cross-validate prompt |
| Bug | Delete plant from garden (HistoryScreen × button + confirmation) |
| 11 | My Plants overview screen: 2-column photo grid (HistoryScreen) + PlantDetailScreen (hero, scan timeline, retry/delete). Navigation: Garden grid → PlantDetailScreen → ResultsScreen. Back from ResultsScreen returns to PlantDetailScreen when entered from there. |
| 12a | Onboarding tour (UploadScreen): first-visit green callout banner + pulsing slot borders. `localStorage` flag `botaniq_onboarding_done`. Auto-dismisses on first photo added. |
| 12b | User feedback + Q&A: thumbs-down → correction modal → re-run analysis (skips PlantNet, injects user correction as candidate). New `plant-chat` edge function for Q&A (max 3 turns, chat history stored in `plant_conversations`). Q&A collapsible section in ResultsScreen. Q&A 💬 indicator on PlantDetailScreen scan rows. Guest users: Q&A and corrections work but no cross-session history. Registered users: prior Q&A for same plant passed to Gemini as context. **DB migration must be run manually**: `supabase/migrations/sprint12_feedback_conversations.sql` |
| 13 | Push notifications + care tracking: Web Push via VAPID, global opt-in with per-plant mute toggle in PlantDetailScreen. "Mark watered" button resets watering countdown using `plant_care_actions` table. `care-reminder` edge function runs hourly via pg_cron, sends reminders at 8am in each user's local timezone (captured at subscribe time via `Intl.DateTimeFormat`). iOS requires PWA installed to home screen (iOS 16.4+). **DB migration + pg_cron setup**: `supabase/migrations/sprint13_push_notifications.sql`. **Vercel**: add `VITE_VAPID_PUBLIC_KEY`. **Supabase secrets**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. |
| 14 | Observability: Sentry ErrorBoundary active (`VITE_SENTRY_DSN` in Vercel). PostHog funnel analytics — 15 events across 4 components (`app_opened`, `photo_added`, `scan_submitted`, `analysis_complete`, `analysis_failed`, `register_modal_shown`, `register_completed`, `register_skipped`, `qa_opened`, `qa_question_sent`, `correction_submitted`, `care_action_logged`, `notification_opted_in`, `notification_opted_out`, `plant_deleted`). PlantNet quota monitor in `plant-processor` (warns at ≥400/day). Fixed Gemini response schema bug (`nullable: true` not `type: ["string","null"]`). **Vercel**: `VITE_POSTHOG_KEY`, `VITE_SENTRY_DSN`. Events confirmed 200 OK via Network tab. |
| 15 | Onboarding gaps: (1) **Sample result preview** — compact horizontal card (plant name, scientific name, health badge, 93% confidence, care pills) shown above the upload form on first visit only, auto-hides when user adds their first photo. (2) **First-scan celebration upgrade** — floating leaf particles (`floatUp` keyframe), bouncing white card (`celebPop` keyframe) showing actual plant name ("Meet your Snake Gourd!"), "See your results →" CTA, tap-anywhere-to-dismiss with proper `clearTimeout` via ref, auto-dismiss extended to 3.5s. (3) **Empty garden redesign** — fan of 3 overlapping photo cards (dark forest / mid-green / light mint gradients, rotated at −14°/+10°/−2°) teases what a full garden looks like. No external animation libs. |
| 16 | AI pipeline enrichments + UX polish + Voice Q&A: (1) **AI enrichments** — `toxicity`, `light_intensity_analysis`, `seasonal_context`, `vital_signs` (hydration/light/nutrients/pest_risk 0–100 scores) now wired through Gemini prompt → DB → UI. `vital_signs` stored in new `plant_logs.vital_signs jsonb` column (migration: `sprint16_enrichments.sql`). (2) **Vital Signs meters** — 4-row progress bar panel in ResultsScreen, teal/amber/red by score, pest_risk inverted. (3) **Toxicity/Safety card** — per-species cat/dog/human risk with colour-coded pills. (4) **Environment card** — light analysis + seasonal care note. (5) **Colourblind-safe palette** — `healthCategoryToColor()` changed from green/red to teal (`#0D9488`)/amber/red; `--healthy` CSS var updated. (6) **HistoryScreen skeleton** — 4-card shimmer grid replaces loading spinner. (7) **Voice Q&A** — 🎤 mic button in Q&A input row, Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`), language-aware (en-US/hi-IN/ta-IN/te-IN), pulsing teal animation while listening, gracefully hidden when unsupported. ✅ **Confirmed working in production** (Bell Pepper scan verified). DB migration executed. Edge function deployed. |
| 17 | Weekly email digest: `weekly-digest` Supabase edge function sends a branded HTML email to all registered users every Sunday 8am UTC via **Brevo** API. Content: each user's plants with latest health status, watering countdown, pest alerts. Opt-out only — one-click unsubscribe link in email sets `users.email_digest_opt_out = true`. Scans matched via `users.guest_id` (how `plant_logs.user_id` is stored). **Secrets**: `BREVO_API_KEY`, `RESEND_FROM_EMAIL` (sender address verified in Brevo), `APP_URL`. **DB migrations**: `sprint17_weekly_digest.sql` + `ALTER TABLE users ADD COLUMN email_digest_opt_out boolean DEFAULT false` (run manually). **pg_cron**: `weekly-plant-digest` scheduled `0 8 * * 0`. ✅ **Confirmed working in production** — 2 emails delivered, cron active. |

---

## Pending Features (priority order)

| # | Feature | Notes |
|---|---|---|
| 1 | **UX polish (remaining)** | Growth narratives across scans (Gemini-generated when history exists), skeleton screens for ResultsScreen correction re-run. |

---

## Common Commands

```powershell
# Deploy edge functions
npx supabase functions deploy plant-processor --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy plant-chat --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy care-reminder --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy weekly-digest --project-ref thgdxffelonamukytosq --no-verify-jwt

# Set VAPID secrets in Supabase (run once after generating keys)
npx supabase secrets set VAPID_PUBLIC_KEY="BNrFg1TOhvBK6EcICaGrzxDmVL-7OGGlLSW4_qPxuHANqFANVLlw8NvR-yUTOunfZ9pJITh2bjUOmtP95iDPPLc" --project-ref thgdxffelonamukytosq
npx supabase secrets set VAPID_PRIVATE_KEY="<from credentials.env.txt>" --project-ref thgdxffelonamukytosq
npx supabase secrets set VAPID_SUBJECT="mailto:poornima.budda@gmail.com" --project-ref thgdxffelonamukytosq

# Set Resend secrets for weekly digest (Sprint 17)
npx supabase secrets set RESEND_API_KEY="<from resend.com dashboard>" --project-ref thgdxffelonamukytosq
npx supabase secrets set RESEND_FROM_EMAIL="BotanIQ <digest@yourdomain.com>" --project-ref thgdxffelonamukytosq
npx supabase secrets set APP_URL="https://plant-health-diagnosis.vercel.app" --project-ref thgdxffelonamukytosq

# Check recent scans
$h = @{ "apikey" = "<SERVICE_ROLE_KEY>"; "Authorization" = "Bearer <SERVICE_ROLE_KEY>" }
Invoke-RestMethod "https://thgdxffelonamukytosq.supabase.co/rest/v1/plant_logs?select=id,status,PlantName,AccuracyScore,created_at&order=created_at.desc&limit=20" -Headers $h | Format-Table

# Force Vercel redeploy
npx vercel --prod --yes

# Verify live deploy
curl -s https://plant-health-diagnosis.vercel.app | grep title
```

---

## Branding Rules
- App name: **BotanIQ** — capital I, capital Q. Never "Botaniq" or "Verdant".
- "IQ" rendered in leaf green italic in the wordmark.
- Primary colour: `#1B4332` (dark forest green)
- Accent: `#52B788` (leaf green) — CSS var `--leaf`
- Design system via CSS custom properties in `src/index.css`
- Font: Playfair Display (headings) + DM Sans (body)

---

## Known Quirks
- VS Code shows Deno import errors ("Cannot find module 'https://deno.land/...'") — false positives from TS server, not real errors. Edge function deploys fine.
- `AccuracyScore = 0` on old records = pre-cross-validation pipeline. Display-only issue, no fix needed.
- HEIC files are rejected client-side in UploadScreen — by design. Users must export as JPEG.
- PlantNet free tier resets at midnight UTC. Gemini-only fallback fires automatically if quota exceeded.
