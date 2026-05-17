# BotanIQ — Production-Ready AI Plant Intelligence

**Live app:** [https://plant-health-diagnosis.vercel.app](https://plant-health-diagnosis.vercel.app)  
**Status:** v1.0 — Commercial Grade MVP

BotanIQ is a high-performance, AI-powered plant identification and health diagnosis engine. It uses a multi-source validation pipeline to deliver high-confidence species identification, health assessments, personalised care plans, nutrient guidance, and harvest timing for home gardeners.

---

## Commercial Value Proposition
- **Multi-Source Cross-Validation:** PlantNet + Google Gemini 2.5 Flash with anti-anchoring prompt design — calibrated confidence scores of 60–93%
- **Reference Image Verification:** PlantNet's own leaf reference images shown to users when confidence is below 90%, enabling self-correction
- **Actionable Nutrient & Harvest Guidance:** Specific deficiency diagnosis with product recommendations; harvest readiness cues for edible plants
- **Cost-Optimized Architecture:** SHA-256 image caching, status-only polling, rate limiting (10 scans/user/day), and Q&A turn limits prevent quota abuse
- **Retention-Focused:** Web Push (VAPID) watering/pest reminders + weekly email digests (Brevo) drive daily active usage
- **Global Ready:** Native support for English, Hindi, Tamil, and Telugu

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite (PWA optimized) |
| Backend | Supabase Edge Functions (Deno) + PostgreSQL |
| Database | Supabase Postgres (16+ DB migrations) |
| AI Orchestration | Gemini 2.5 Flash + PlantNet API |
| Messaging | VAPID Push Notifications + Brevo Email |
| Monitoring | Sentry + PostHog Analytics |

---

## Quality & Reliability
- **Security hardened:** DB-side rate limits, JWT identity verification, HMAC-signed unsubscribe URLs, hardened RLS policies
- **Observability:** Sentry ErrorBoundary, PostHog 15-event funnel, PlantNet quota monitoring
- **Offline capable:** IndexedDB scan queue auto-flushes when connection returns
- **Scalability:** Realtime WebSocket updates with HTTP polling fallback; care-reminder paginated in batches of 100

---

## Documentation

| Doc | Contents |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Design system, screen inventory, data models, AI pipeline, security model |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, data flow, edge function responsibilities |
| [docs/API_SPEC.md](docs/API_SPEC.md) | Edge function API contracts, request/response schemas |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Full sprint history (23 sprints), current state, future backlog |
| [docs/REVIEW_FIX_BLUEPRINT.md](docs/REVIEW_FIX_BLUEPRINT.md) | Security/UX fix backlog — 21 fixes completed, 9 pending |
| [CLAUDE.md](CLAUDE.md) | Project context, key files, common commands (for AI-assisted development) |

## Local Development
```bash
npm install
npm run dev        # http://localhost:5173
```

Requires Node 18+. No environment variables needed for the frontend — Supabase keys are in `src/supabaseClient.js`.

---

## Edge Functions

Five Deno edge functions deployed to Supabase:

| Function | Trigger | Purpose |
|---|---|---|
| `plant-processor` | HTTP (on DB insert) | Full AI pipeline: PlantNet → Gemini → DB update |
| `plant-chat` | HTTP (on demand) | 3-turn Q&A per scan (DB-enforced turn limit) |
| `care-reminder` | pg_cron hourly | Web Push watering reminders + pest follow-up alerts |
| `weekly-digest` | pg_cron weekly (Sun 8am UTC) | Brevo HTML email digest to all registered users |
| `support-request` | HTTP (from Support modal) | Brevo email to botaniqsupport@gmail.com |

**Deploy all:**
```powershell
npx supabase functions deploy plant-processor --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy plant-chat --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy care-reminder --project-ref thgdxffelonamukytosq
npx supabase functions deploy weekly-digest --project-ref thgdxffelonamukytosq --no-verify-jwt
npx supabase functions deploy support-request --project-ref thgdxffelonamukytosq --no-verify-jwt
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
npx supabase secrets set UNSUBSCRIBE_SECRET=<32-byte hex> --project-ref thgdxffelonamukytosq
```

---

## AI Pipeline

```
Upload 1–3 images → Quality Gate → PlantNet (SHA-256 cached, 60-day TTL, reference image)
  → Gemini: independent ID → cross-validate → health + care + enrichments
  → nutrient recommendations + harvest guide (edible plants)
  → growth narrative (if prior scans exist)
  → Confidence tier (60–93%) → DB update → Realtime push to client
```

See [docs/DESIGN.md](docs/DESIGN.md) for full pipeline diagram, confidence tiers, and data model.

---

## Design System

Full brand spec, colour palette, typography, component inventory, and screen designs in [docs/DESIGN.md](docs/DESIGN.md).

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
