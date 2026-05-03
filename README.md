# BotanIQ — AI Plant Intelligence

**Live app:** https://plant-health-diagnosis.vercel.app  
**Status:** v1.0 — Production complete

BotanIQ is a free, AI-powered plant identification and health diagnosis app. Upload a photo of any plant and get instant species identification, health assessment, and a personalised care plan — in English, Hindi, Tamil, or Telugu.

---

## Features

### Identification & Diagnosis
- **Dual-source identification** — PlantNet botanical database + Google Gemini 2.5 Flash, cross-validated independently to eliminate anchoring bias
- **Calibrated confidence** — scored from agreement signal between two sources (not AI self-reporting): 60–93%
- **Health diagnosis** — visual analysis of leaf colour, turgor, spots, wilting, soil condition with colourblind-safe status palette (teal / amber / red)
- **Vital Signs panel** — Hydration, Light, Nutrients, Pest Risk scored 0–100 with progress bars
- **Toxicity / Safety card** — per-species cat, dog, and human risk with colour-coded assessment
- **Environment card** — light intensity analysis from photo + seasonal care advice for current month
- **Pest detection** — identifies pests by name with step-by-step treatment plan
- **Smart quality gate** — hard-rejects unanalyzable images; soft-proceeds with guidance for suboptimal but usable shots
- **Multi-angle diagnosis** — 3-slot upload (whole plant / leaf / stem) for higher accuracy

### Care & Reminders
- **Care schedule** — Gemini generates structured watering, fertilising, and pest-check intervals
- **Watering countdown** — badge in Plant Detail showing days until next water
- **Mark watered** — resets countdown from today, logged to `plant_care_actions`
- **Push notifications** — Web Push (VAPID) watering reminders; global opt-in + per-plant mute; 8am delivery in user's local timezone; iOS requires PWA installed (16.4+)
- **Weekly email digest** — Sunday 8am UTC via Brevo; plant health summary + watering countdown + pest alerts per plant; one-click unsubscribe

### Garden & History
- **My Plants grid** — 2-column photo garden grouped by plant, with health dot and scan count
- **Plant Detail screen** — hero banner, full scan timeline (tappable), care badge, retry/delete
- **Growth narratives** — Gemini writes a warm 1–2 sentence comparison when a plant has prior scans, shown in Health Journey card
- **Scan history timeline** — full chronological list on Results screen; switch between scans in place
- **Realtime updates** — WebSocket push with HTTP polling fallback; 90s hard timeout

### User Experience
- **Voice Q&A** — mic button in Q&A using Web Speech API; language-aware (EN/HI/TA/TE); gracefully hidden when unsupported
- **Q&A (3 turns/scan)** — ask Gemini follow-up questions; conversation stored per scan
- **User corrections** — thumbs-down → submit correct name → re-analysis (skips PlantNet, anti-anchoring design); skeleton shimmer while re-analysing
- **Care reminder nudge** — "Set watering reminders →" button in Care Schedule section navigates to Plant Detail
- **Onboarding tour** — first-visit banner + pulsing slot borders; sample result preview; first-scan celebration with floating leaf animation
- **Multi-language** — reports in English, Hindi, Tamil, Telugu; stored in `localStorage`
- **Soft registration** — optional magic-link email capture after first scan; no passwords
- **PWA** — installable, offline-capable; icons 192+512 PNG + SVG; theme `#1B4332`
- **Accessibility** — ARIA labels, roles, alt text on all key elements
- **Analytics** — PostHog funnel (15 events); Sentry error tracking

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Hosting | Vercel (auto-deploy on push to `main`) |
| Backend | Supabase Edge Functions (Deno) |
| Database | Supabase Postgres |
| Storage | Supabase Storage (`plant_images` bucket, public) |
| Realtime | Supabase Realtime (Postgres changes) |
| Plant ID | PlantNet API (free tier, 500 req/day, SHA-256 cache) |
| AI Analysis | Google Gemini 2.5 Flash (`thinkingBudget: 0`) |
| Push | Web Push via VAPID (`care-reminder` edge function) |
| Email | Brevo transactional API (`weekly-digest` edge function) |
| Analytics | PostHog (us.i.posthog.com) |
| Observability | Sentry (ErrorBoundary + `VITE_SENTRY_DSN`) |
| Location | Browser Geolocation + ipapi.co fallback |

---

## Project Structure

```
/
├── src/
│   ├── App.jsx                        # Router, nav, auth session, register modal trigger
│   ├── main.jsx                       # Vite entry — PostHog + Sentry init
│   ├── index.css                      # Design tokens (CSS custom properties + animations)
│   ├── supabaseClient.js              # Supabase client singleton
│   ├── logger.js                      # Structured client-side logger
│   ├── components/
│   │   ├── UploadScreen.jsx           # 3-slot upload, compression, onboarding tour
│   │   ├── AnalysingScreen.jsx        # Progress UI, Realtime + polling, 90s timeout
│   │   ├── ResultsScreen.jsx          # Full diagnosis, Q&A, feedback/correction, growth narrative
│   │   ├── HistoryScreen.jsx          # My Garden grid, skeleton shimmer, Realtime
│   │   ├── PlantDetailScreen.jsx      # Per-plant detail, care tracking, push notifications
│   │   └── RegisterModal.jsx          # Soft registration, magic link OTP
│   └── utils/
│       ├── pushNotifications.js       # Subscribe/unsubscribe/mute helpers, VAPID
│       └── analytics.js               # PostHog track/identify wrappers
├── supabase/
│   ├── functions/
│   │   ├── plant-processor/           # Core AI pipeline: PlantNet + Gemini + health report
│   │   ├── plant-chat/                # 3-turn Q&A: Gemini answers using plant context
│   │   ├── care-reminder/             # Hourly cron: Web Push watering reminders via VAPID
│   │   └── weekly-digest/             # Weekly cron: Brevo HTML email digest to registered users
│   └── migrations/                    # 12 incremental DB migrations
├── public/
│   ├── sw.js                          # Service worker: network-first nav, cache-first assets
│   ├── manifest.json                  # PWA manifest — BotanIQ, theme #1B4332
│   └── icons/                         # icon-192.png, icon-512.png, icon.svg
├── index.html                         # PWA shell — Google Fonts preload
├── package.json
├── vite.config.js
├── CLAUDE.md                          # Full project context for AI-assisted development
├── DESIGN.md                          # Design system, screen inventory, data models
└── ROADMAP.md                         # Sprint history and product decisions
```

---

## Local Development

```bash
npm install
npm run dev        # http://localhost:5173
```

Requires Node 18+. No environment variables needed for the frontend — Supabase keys are in `src/supabaseClient.js`.

---

## Edge Functions

Four Deno edge functions deployed to Supabase:

| Function | Trigger | Purpose |
|---|---|---|
| `plant-processor` | HTTP (on DB insert) | Full AI pipeline |
| `plant-chat` | HTTP (on demand) | 3-turn Q&A |
| `care-reminder` | pg_cron hourly | Web Push reminders |
| `weekly-digest` | pg_cron weekly (Sun 8am UTC) | Brevo email digest |

**Deploy all:**
```powershell
npx supabase functions deploy plant-processor --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy plant-chat --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy care-reminder --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy weekly-digest --project-ref thgdxffelonamukytosq --no-verify-jwt
```

**Required Supabase secrets:**
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

---

## AI Pipeline

```
Upload → Quality Gate → PlantNet (parallel) + Weather + Prior scan history
       → Gemini: independent ID → cross-validate → health report
       → Confidence tier (60–93%) → Growth narrative (if prior scan)
       → DB update → Realtime push to client
```

See `DESIGN.md` for full pipeline diagram, confidence tiers, and data model.

---

## Design System

Full brand spec, colour palette, typography, component inventory, and screen designs in [`DESIGN.md`](DESIGN.md).

**Brand:** BotanIQ — "Botan" in forest green (Playfair Display 700) + "IQ" in leaf green italic.  
**Primary:** `#1B4332` · **Accent:** `#52B788` · **Healthy:** `#0D9488` (teal, colourblind-safe)

---

## Deployment

Vercel auto-deploys on every push to `main`.

**Vercel project:** `botaniq` under `lordofwrongs-projects`  
**Production URL:** https://plant-health-diagnosis.vercel.app  
**Supabase project:** `thgdxffelonamukytosq`

**Required Vercel environment variables:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL=https://plant-health-diagnosis.vercel.app`
- `VITE_VAPID_PUBLIC_KEY`
- `VITE_POSTHOG_KEY`
- `VITE_SENTRY_DSN`
