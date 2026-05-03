# BotanIQ Production Support

You are the production support agent for **BotanIQ** — an AI-powered plant identification and health diagnosis app. Your job is to triage issues, diagnose root causes, and ship fixes.

## System Overview

| Component | Location | Notes |
|---|---|---|
| Frontend (React+Vite) | `src/` | Deployed on Vercel, auto-deploys on push to `main` |
| AI pipeline | `supabase/functions/plant-processor/index.ts` | PlantNet + Gemini, full diagnosis |
| Q&A | `supabase/functions/plant-chat/index.ts` | 3-turn Q&A per scan |
| Push reminders | `supabase/functions/care-reminder/index.ts` | Hourly pg_cron, Web Push VAPID |
| Email digest | `supabase/functions/weekly-digest/index.ts` | Sunday 8am UTC pg_cron, Brevo |
| Database | Supabase Postgres | See tables below |
| Storage | Supabase Storage | Bucket: `plant_images` (public) |
| Realtime | Supabase Realtime | Channels: `log-monitor-{id}` and `history_realtime_sync` |
| Registration | `src/components/RegisterModal.jsx` | Soft modal after first scan; state in `localStorage.botaniq_registered` |

## Database Tables

| Table | Purpose |
|---|---|
| `plant_logs` | Core scan records — all AI output stored here |
| `users` | Registered users (soft registration); `guest_id` links to `plant_logs.user_id` |
| `user_profiles` | Magic-link auth user profiles (Supabase auth user id as PK) |
| `plantnet_cache` | SHA-256 hash cache of PlantNet API responses |
| `identification_feedback` | Thumbs-down correction submissions |
| `plant_conversations` | Q&A message history per scan |
| `push_subscriptions` | VAPID push subscriptions (endpoint + keys + timezone) |
| `push_mutes` | Per-plant notification mutes |
| `plant_care_actions` | Watering/fertilising/pest-check log; drives watering countdown |

## Credentials (read from `credentials.env.txt`)

- `SUPABASE_PROJECT_URL` — https://thgdxffelonamukytosq.supabase.co
- `SUPABASE_SERVICE_ROLE_KEY` — for direct DB queries
- `SUPABASE_ANON_KEY` — for client-side queries
- `GEMINI_API_KEY` — Gemini 2.5 Flash
- `PLANTNET_API_KEY` — PlantNet botanical ID
- `VAPID_PUBLIC_KEY` — VAPID push public key (also in Vercel as `VITE_VAPID_PUBLIC_KEY`)
- `VAPID_PRIVATE_KEY` — VAPID push private key (Supabase secret)
- `VAPID_SUBJECT` — mailto:botaniqsupport@gmail.com (Supabase secret)
- `BREVO_API_KEY` — Brevo transactional email (Supabase secret)
- `RESEND_FROM_EMAIL` — sender name+email for Brevo: `BotanIQ <botaniqsupport@gmail.com>` (Supabase secret)
- `APP_URL` — https://plant-health-diagnosis.vercel.app (Supabase secret)

## Common Diagnostic Commands

### Check recent scans
```powershell
$headers = @{ "apikey" = "<SERVICE_ROLE_KEY>"; "Authorization" = "Bearer <SERVICE_ROLE_KEY>" }
$r = Invoke-RestMethod -Uri "https://thgdxffelonamukytosq.supabase.co/rest/v1/plant_logs?select=id,status,PlantName,AccuracyScore,created_at,error_details&order=created_at.desc&limit=20" -Headers $headers
$r | Format-Table status, PlantName, AccuracyScore, created_at, error_details -AutoSize
```

### Check registered users
```powershell
$headers = @{ "apikey" = "<SERVICE_ROLE_KEY>"; "Authorization" = "Bearer <SERVICE_ROLE_KEY>" }
$r = Invoke-RestMethod -Uri "https://thgdxffelonamukytosq.supabase.co/rest/v1/users?select=id,first_name,email,guest_id,email_digest_opt_out,created_at&order=created_at.desc" -Headers $headers
$r | Format-Table first_name, email, guest_id, email_digest_opt_out, created_at -AutoSize
```

### Check errors in last 24h
```powershell
$r = Invoke-RestMethod -Uri "https://thgdxffelonamukytosq.supabase.co/rest/v1/plant_logs?select=id,status,error_details,created_at&status=in.(error,quality_issue)&order=created_at.desc&limit=20" -Headers $headers
$r | Format-Table status, error_details, created_at -AutoSize
```

### Check push subscriptions
```powershell
$r = Invoke-RestMethod -Uri "https://thgdxffelonamukytosq.supabase.co/rest/v1/push_subscriptions?select=user_id,endpoint,timezone,created_at&order=created_at.desc" -Headers $headers
$r | Format-Table user_id, timezone, created_at -AutoSize
```

### Check recent care actions (watering log)
```powershell
$r = Invoke-RestMethod -Uri "https://thgdxffelonamukytosq.supabase.co/rest/v1/plant_care_actions?select=user_id,plant_name,action_type,actioned_at&order=actioned_at.desc&limit=20" -Headers $headers
$r | Format-Table user_id, plant_name, action_type, actioned_at -AutoSize
```

### Check Q&A conversations
```powershell
$r = Invoke-RestMethod -Uri "https://thgdxffelonamukytosq.supabase.co/rest/v1/plant_conversations?select=log_id,user_id,messages,created_at&order=created_at.desc&limit=10" -Headers $headers
$r | Format-Table log_id, user_id, created_at -AutoSize
```

### Deploy edge functions
```powershell
npx supabase functions deploy plant-processor --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy plant-chat --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy care-reminder --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy weekly-digest --project-ref thgdxffelonamukytosq --no-verify-jwt
```

### Check edge function list
```powershell
npx supabase functions list --project-ref thgdxffelonamukytosq
```

### Check Supabase secrets
```powershell
npx supabase secrets list --project-ref thgdxffelonamukytosq
```

### Check Vercel deployment status
```powershell
npx vercel ls botaniq --scope lordofwrongs-projects
```

### Force redeploy to Vercel production
```powershell
npx vercel --prod --yes
```

### Verify live site
```powershell
curl -s https://plant-health-diagnosis.vercel.app | Select-String "title"
```

### Manually trigger weekly digest (for testing)
```powershell
$headers = @{ "Authorization" = "Bearer <SERVICE_ROLE_KEY>"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "https://thgdxffelonamukytosq.supabase.co/functions/v1/weekly-digest" -Method POST -Headers $headers -Body "{}"
```

---

## Issue Triage Playbook

### 1. "Analysis is stuck / never finishes"
- Check if record is stuck in `pending` or `processing` status > 5 min
- Check edge function logs: Supabase dashboard → Functions → plant-processor → Logs
- Common causes: Gemini API quota (429), PlantNet timeout, DB update failure
- Fix: retry via HistoryScreen Retry button, or manually update `status = 'error'` in DB

### 2. "Wrong plant identified"
- Check `AccuracyScore` — if < 75, Gemini and PlantNet disagreed; "Possibly" prefix is expected
- Check `processing_log` column for `plantnet_score` and `independent_id` vs `final_scientific_name`
- Common cause: top-down photo angle; fix = user submits correction via thumbs-down → correction modal

### 3. "Confidence shows 0% or blank"
- `AccuracyScore = 0` means record was processed by OLD pipeline (pre cross-validation) — display-only issue
- No fix needed for historical records; new scans use correct pipeline

### 4. "Health status shows long sentence instead of short label"
- Gemini ignored the 2-4 word constraint
- Fix: tighten prompt in `plant-processor/index.ts`, redeploy function

### 5. "App shows white screen / JS error"
- Check browser console for the specific error
- Common: import path mismatch after restructure
- Fix: check `src/` imports, run `npm run build` locally to catch errors

### 6. "HEIC upload error"
- Expected by design — HEIC rejected client-side in UploadScreen.jsx
- User must export as JPEG from Photos app

### 7. "Realtime not updating — stuck on analysing screen"
- HTTP polling fallback fires every 8s; 90s hard timeout fires if nothing arrives
- Check status.supabase.com for Realtime outage

### 8. "PlantNet API quota exceeded"
- PlantNet free tier: 500 req/day; resets midnight UTC
- Edge function logs will show quota warning when ≥400 requests
- Gemini-only fallback fires automatically (confidence capped at 70%)

### 9. "Gemini API quota exceeded (429)"
- Check `processing_log` for `429` status
- Fix: wait for quota reset or temporarily switch model in index.ts

### 10. "Image upload fails"
- Check Supabase Storage bucket `plant_images` is public
- Check CORS policy on storage bucket
- Check network tab for 4xx on the upload request

### 11. "Registration modal keeps appearing"
- `localStorage.botaniq_registered` should be `"true"` or `"skipped"` after first action
- Clearing site data wipes localStorage — user sees modal again; this is expected
- Modal is safe to fill in again (duplicate `guest_id` insert is handled gracefully)

### 12. "User registered but plants don't show in weekly digest"
- Check `users` table: does the user have `email_digest_opt_out = false`?
- Check `users.guest_id` — this must match `plant_logs.user_id` for scans to be found
- Check `plant_logs` for that `user_id` with `status = 'done'`
- Common cause: user registered on a different device/session so `guest_id` doesn't match existing scans

### 13. "Push notifications not arriving"
- Check `push_subscriptions` table — subscription must exist for user
- Check `push_mutes` — plant may be muted
- iOS requires PWA installed to home screen (16.4+); notifications don't work in Safari browser tab
- Check care-reminder edge function logs for VAPID errors or expired endpoints
- Stale endpoints (browser uninstalled) are cleaned up automatically by care-reminder function

### 14. "Q&A not working / not saving"
- Check `plant_conversations` table for the scan's `log_id`
- Check plant-chat edge function logs for Gemini errors
- 3-turn limit per scan — Q&A section shows "Turn 3 of 3" and input is disabled after limit reached
- Guest users: Q&A works but no cross-session history

### 15. "Vital Signs / Toxicity / Environment card missing"
- These fields were added in Sprint 16 — old scan records won't have them (null)
- UI conditionally renders these cards only when data is present
- If a new scan is missing them: check plant-processor prompt has the enrichment instructions; check DB columns exist (`vital_signs`, `toxicity`, `light_intensity_analysis`, `seasonal_context`)

### 16. "Growth narrative not showing"
- Requires ≥2 scans for the same plant identity (plant_nickname || PlantName)
- Check `plant_logs.growth_milestones` for the scan: should be `{ narrative: "..." }`
- If null: check plant-processor prompt instruction 14 is present; check `nearbyLogs` query in edge function

### 17. "Weekly email digest not sending"
- Check weekly-digest edge function logs in Supabase
- Check `users` table: must have `email IS NOT NULL` and `email_digest_opt_out = false`
- Check `users.guest_id` is populated (needed to link to plant_logs)
- Check Brevo API key is set as Supabase secret (`BREVO_API_KEY`)
- Check `RESEND_FROM_EMAIL` secret is set (used as Brevo sender name+email)
- Verify Brevo sender address is verified in Brevo dashboard

---

## Key Files for Fixes

| Issue type | File to edit |
|---|---|
| AI prompt / pipeline logic | `supabase/functions/plant-processor/index.ts` |
| Q&A logic | `supabase/functions/plant-chat/index.ts` |
| Push notification reminders | `supabase/functions/care-reminder/index.ts` |
| Weekly email digest | `supabase/functions/weekly-digest/index.ts` |
| Upload / compression / HEIC | `src/components/UploadScreen.jsx` |
| Analysis progress / quality gate UI | `src/components/AnalysingScreen.jsx` |
| Results display / correction / Q&A | `src/components/ResultsScreen.jsx` |
| Garden grid / skeleton / empty state | `src/components/HistoryScreen.jsx` |
| Per-plant detail / care tracking / push toggle | `src/components/PlantDetailScreen.jsx` |
| Registration modal | `src/components/RegisterModal.jsx` |
| Modal trigger / routing | `src/App.jsx` |
| Design tokens / animations | `src/index.css` |
| Push subscription helpers | `src/utils/pushNotifications.js` |
| PostHog analytics events | `src/utils/analytics.js` |
| Service worker / offline | `public/sw.js` |
| DB schema | `supabase/migrations/` |

---

## Deploy Checklist (after any fix)

- [ ] Fix committed to `main` with descriptive message
- [ ] If edge function changed: `npx supabase functions deploy <function-name> --project-ref thgdxffelonamukytosq --no-verify-jwt`
- [ ] If frontend changed: `git push origin main` (Vercel auto-deploys in ~1–2 min)
- [ ] Verify live site: `curl -s https://plant-health-diagnosis.vercel.app | Select-String "title"`
- [ ] Run a live test scan and check DB for `status=done` with correct data

---

## AI Pipeline Confidence Tiers (for reference)

| Signal | Confidence | Display |
|---|---|---|
| PlantNet ≥ 85% + Gemini confirms | 93% | Normal name |
| Both agree, PlantNet 70–84% | 90% | Normal name |
| Both agree, PlantNet 50–69% | 83% | Normal name |
| Both agree, PlantNet 20–49% | 75% | Normal name |
| Gemini overrides PlantNet | 60% | "Possibly {name}" |
| No PlantNet (Gemini only) | 70% | Normal name |
| Correction re-run, Gemini agrees | 83% | Normal name |
| Correction re-run, Gemini overrides | 60% | "Possibly {name}" |

---

## Required Secrets Reference

### Supabase Secrets
```powershell
npx supabase secrets set GEMINI_API_KEY=<key> --project-ref thgdxffelonamukytosq
npx supabase secrets set PLANTNET_API_KEY=<key> --project-ref thgdxffelonamukytosq
npx supabase secrets set VAPID_PUBLIC_KEY=<key> --project-ref thgdxffelonamukytosq
npx supabase secrets set VAPID_PRIVATE_KEY=<key> --project-ref thgdxffelonamukytosq
npx supabase secrets set VAPID_SUBJECT=mailto:botaniqsupport@gmail.com --project-ref thgdxffelonamukytosq
npx supabase secrets set BREVO_API_KEY=<key> --project-ref thgdxffelonamukytosq
npx supabase secrets set RESEND_FROM_EMAIL="BotanIQ <botaniqsupport@gmail.com>" --project-ref thgdxffelonamukytosq
npx supabase secrets set APP_URL=https://plant-health-diagnosis.vercel.app --project-ref thgdxffelonamukytosq
```

### Vercel Environment Variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL=https://plant-health-diagnosis.vercel.app`
- `VITE_VAPID_PUBLIC_KEY`
- `VITE_POSTHOG_KEY`
- `VITE_SENTRY_DSN`
