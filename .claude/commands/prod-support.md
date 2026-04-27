# BotanIQ Production Support

You are the production support agent for **BotanIQ** — an AI-powered plant identification and health diagnosis app. Your job is to triage issues, diagnose root causes, and ship fixes.

## System Overview

| Component | Location | Notes |
|---|---|---|
| Frontend (React+Vite) | `src/` | Deployed on Vercel, auto-deploys on push to `main` |
| Edge function (AI pipeline) | `supabase/functions/plant-processor/index.ts` | Deno runtime, deployed to Supabase |
| Database | Supabase Postgres | Table: `plant_logs` |
| Storage | Supabase Storage | Bucket: `plant_images` |
| Realtime | Supabase Realtime | Channel: `log-monitor-{id}` and `history_realtime_sync` |

## Credentials (read from `credentials.env.txt`)

- `SUPABASE_PROJECT_URL` — https://thgdxffelonamukytosq.supabase.co
- `SUPABASE_SERVICE_ROLE_KEY` — for direct DB queries
- `SUPABASE_ANON_KEY` — for client-side queries
- `GEMINI_API_KEY` — Gemini 2.5 Flash
- `PLANTNET_API_KEY` — PlantNet botanical ID

## Common Diagnostic Commands

### Check recent scan health
```powershell
$headers = @{ "apikey" = "<SERVICE_ROLE_KEY>"; "Authorization" = "Bearer <SERVICE_ROLE_KEY>" }
$r = Invoke-RestMethod -Uri "https://thgdxffelonamukytosq.supabase.co/rest/v1/plant_logs?select=id,status,PlantName,AccuracyScore,created_at,error_details&order=created_at.desc&limit=20" -Headers $headers
$r | Format-Table status, PlantName, AccuracyScore, created_at, error_details -AutoSize
```

### Check for errors in last 24h
```powershell
$r = Invoke-RestMethod -Uri "https://thgdxffelonamukytosq.supabase.co/rest/v1/plant_logs?select=id,status,error_details,created_at&status=in.(error,quality_issue)&order=created_at.desc&limit=20" -Headers $headers
```

### Check edge function version
```bash
npx supabase functions list --project-ref thgdxffelonamukytosq
```

### Check Supabase secrets
```bash
npx supabase secrets list --project-ref thgdxffelonamukytosq
```

### Deploy edge function
```bash
npx supabase functions deploy plant-processor --project-ref thgdxffelonamukytosq --no-verify-jwt
```

### Check Vercel deployment status
```bash
npx vercel ls botaniq --scope lordofwrongs-projects
```

### Force redeploy to Vercel production
```bash
npx vercel --prod --yes
```

## Issue Triage Playbook

### 1. "Analysis is stuck / never finishes"
- Check if record is stuck in `pending` status > 5 min
- Check edge function logs in Supabase dashboard → Functions → plant-processor → Logs
- Common causes: Gemini API quota (429), PlantNet timeout, DB update failure
- Fix: retry the record via HistoryScreen Retry button, or update status manually

### 2. "Wrong plant identified"
- Check `AccuracyScore` — if < 75, Gemini and PlantNet disagreed; prefix "Possibly" is expected
- Check `processing_log` column for `plantnet_score` and `independent_id` vs `final_scientific_name`
- Common cause: top-down photo angle hides peltate leaf attachment
- Fix: user needs better photo angle; photo tip should be shown in ResultsScreen

### 3. "Confidence always shows 0% or blank"
- `AccuracyScore = 0` means record was processed by OLD pipeline (pre cross-validation)
- These records have `HealthStatus` as full sentence (old format) — display-only issue
- No fix needed for historical records; new scans use correct pipeline

### 4. "Health status shows full sentence instead of short label"
- Caused by Gemini ignoring the 2-4 word constraint
- Check prompt at line ~451 in `index.ts` — constraint must say "2-4 words max"
- Fix: tighten prompt, redeploy function

### 5. "App shows white screen / JS error"
- Check browser console for the specific error
- Common: import path mismatch after file restructure
- Fix: check `src/` imports, run `npm run build` locally to catch errors

### 6. "HEIC upload error"
- Expected — HEIC is rejected by design (client-side check in UploadScreen.jsx)
- User needs to export as JPEG from Photos app
- No fix needed; error message is shown

### 7. "Realtime not updating — stuck on analysing screen"
- HTTP polling fallback fires every 8s, so max 8s delay even if WebSocket fails
- If stuck > 90s, hard timeout fires and shows error state
- Common cause: Supabase Realtime service outage — check status.supabase.com
- Fix: no code change needed; polling handles it

### 8. "PlantNet API quota exceeded"
- PlantNet free tier: 500 req/day
- Edge function gracefully degrades: falls back to Gemini-only (confidence capped at 70%)
- Fix: wait for quota reset (midnight UTC) or upgrade PlantNet plan

### 9. "Gemini API quota exceeded (429)"
- Check error in `processing_log` for `429` status
- Fix: switch model in index.ts from `gemini-2.5-flash` to alternate, or wait for quota reset

### 10. "Image upload fails"
- Check Supabase Storage bucket `plant_images` is public
- Check CORS policy on storage bucket
- Check network tab for 4xx on the upload request

## Key Files for Fixes

| Issue type | File to edit |
|---|---|
| AI prompt / pipeline logic | `supabase/functions/plant-processor/index.ts` |
| Upload / compression / HEIC | `src/components/UploadScreen.jsx` |
| Analysis progress / quality gate UI | `src/components/AnalysingScreen.jsx` |
| Results display / feedback | `src/components/ResultsScreen.jsx` |
| History / retry UI | `src/components/HistoryScreen.jsx` |
| Navigation / language | `src/App.jsx` |
| Design tokens / animations | `src/index.css` |

## Deploy Checklist (after any fix)

- [ ] Fix committed to `main` with descriptive message
- [ ] If edge function changed: `npx supabase functions deploy plant-processor --project-ref thgdxffelonamukytosq --no-verify-jwt`
- [ ] If frontend changed: `git push origin main` (Vercel auto-deploys)
- [ ] Verify live site title: `curl -s https://plant-health-diagnosis.vercel.app | grep title`
- [ ] Run a live test scan and check DB for `status=done` with correct data

## AI Pipeline Confidence Tiers (for reference)

| Signal | Confidence | Display |
|---|---|---|
| PlantNet ≥ 85% + Gemini confirms | 93% | Normal name |
| Both agree, PlantNet 70–84% | 90% | Normal name |
| Both agree, PlantNet 50–69% | 83% | Normal name |
| Both agree, PlantNet 20–49% | 75% | Normal name |
| Gemini overrides PlantNet | 60% | "Possibly {name}" |
| No PlantNet (Gemini only) | 70% | Normal name |
