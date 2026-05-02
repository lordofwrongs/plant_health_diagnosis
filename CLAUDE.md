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
| Edge function | Deno (Supabase) | `supabase/functions/plant-processor/index.ts` |
| Database | Supabase Postgres | Tables: `plant_logs`, `users`, `user_profiles`, `plantnet_cache` |
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

Vercel env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL=https://plant-health-diagnosis.vercel.app`

---

## Key Files

| File | Purpose |
|---|---|
| `src/App.jsx` | Router, nav, auth session handler, register modal trigger |
| `src/components/UploadScreen.jsx` | 3-slot photo upload (whole plant / leaf / stem), HEIC check, compression |
| `src/components/AnalysingScreen.jsx` | Progress UI, Realtime + HTTP polling fallback, 90s hard timeout |
| `src/components/ResultsScreen.jsx` | Diagnosis display: plant name, confidence, health, care schedule, pest card |
| `src/components/HistoryScreen.jsx` | My Garden grid — 2-column photo grid, groups scans by plant, Realtime subscription |
| `src/components/PlantDetailScreen.jsx` | Per-plant detail: hero banner, scan history timeline, retry/delete, watering badge |
| `src/components/RegisterModal.jsx` | Soft registration modal — magic link OTP, skip option |
| `supabase/functions/plant-processor/index.ts` | Full AI pipeline: PlantNet → Gemini cross-validate → DB update |
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
  processing_log jsonb          -- debug: plantnet_score, independent_id, etc.
  error_details text
  pest_detected boolean
  pest_name text
  pest_treatment jsonb          -- array of treatment step strings
  created_at timestamptz

users
  id uuid PK
  first_name, last_name, email, phone, guest_id, created_at

user_profiles
  id uuid PK (= supabase auth user id)
  email, first_name, last_name, phone, guest_id, created_at

plantnet_cache
  image_hash text PK            -- SHA-256 of image bytes
  result jsonb
  created_at timestamptz
```

RLS: `plant_logs` allows anon insert + select + delete (by user_id). `users` allows anon insert only (no select — use service role to query). `user_profiles` — auth users can upsert their own row.

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

---

## Pending / Next Features (priority order)

1. **Care reminders / push notifications** — browser Push API to remind users when a care task is due. Care schedules already stored in `CareInstructions` on `plant_logs`. Needs: (a) browser Push API subscription stored in Supabase, (b) Supabase scheduled edge function to check due dates and send pushes, (c) UI in PlantDetailScreen or ResultsScreen to enable/disable reminders per plant.

2. **User feedback on identifications** — thumbs down button on ResultsScreen that logs a correction (what the user says the plant actually is) to a new `identification_feedback` table. Data used for prompt tuning later. Needs: new Supabase table, a small modal/input for the user to type the correct name, RLS same as plant_logs.

3. **Weekly email digest** — "your garden summary" via Resend or Sendgrid. Needs: scheduled Supabase function (cron), email template showing each plant's latest health status, only for registered (non-guest) users.

4. **Onboarding tour** — first-time users don't know about the 3-slot photo feature. Simple tooltip/highlight overlay on first visit to UploadScreen. Use `localStorage` flag `botaniq_onboarding_done` to show once. Highlight the 3 upload slots with a pulsing border + tooltip text.

---

## Common Commands

```powershell
# Deploy edge function
npx supabase functions deploy plant-processor --project-ref thgdxffelonamukytosq --no-verify-jwt

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
