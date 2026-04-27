# BotanIQ — AI Plant Intelligence

**Live app:** https://plant-health-diagnosis.vercel.app

BotanIQ is a free, AI-powered plant identification and health diagnosis app. Upload a photo of any plant and get instant species identification, health assessment, and a personalised care plan — in English, Hindi, Tamil, or Telugu.

---

## Features

- **Dual-source identification** — PlantNet botanical database + Google Gemini 2.5 Flash, cross-validated independently to eliminate anchoring bias
- **Calibrated confidence** — scored from agreement signal between two sources (not AI self-reporting): 75–93%
- **Health diagnosis** — visual analysis of leaf colour, turgor, spots, wilting, soil condition
- **Care plan** — numbered, actionable recovery steps
- **Smart quality gate** — hard rejects unanalyzable images; soft-proceeds with photo guidance for suboptimal but usable shots
- **Multi-language** — reports in English, Hindi, Tamil, Telugu
- **Weather alerts** — location-aware climate risk warnings
- **History** — tracks all scans per plant over time with health trend comparison and full scan timeline browsing
- **Realtime updates** — WebSocket push with HTTP polling fallback
- **Soft registration** — optional name + email capture after first scan; no password, no verification; stored for support outreach

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Hosting | Vercel (auto-deploy on push to `main`) |
| Backend | Supabase Edge Functions (Deno) |
| Database | Supabase Postgres |
| Storage | Supabase Storage (`plant_images` bucket) |
| Realtime | Supabase Realtime (Postgres changes) |
| Plant ID | PlantNet API (free tier, 500 req/day) |
| AI Analysis | Google Gemini 2.5 Flash |
| Location | Browser Geolocation + ipapi.co fallback |

---

## Project Structure

```
/
├── src/                          # React frontend
│   ├── App.jsx                   # Root component — nav, routing, language
│   ├── main.jsx                  # Vite entry point
│   ├── index.css                 # Design system (CSS custom properties)
│   ├── supabaseClient.js         # Supabase client singleton
│   ├── logger.js                 # Client-side logger
│   └── components/
│       ├── UploadScreen.jsx      # Photo upload + compression
│       ├── AnalysingScreen.jsx   # Real-time analysis progress
│       ├── ResultsScreen.jsx     # Full diagnosis results
│       ├── HistoryScreen.jsx     # Plant garden history
│       └── RegisterModal.jsx     # Soft registration overlay (post-first-scan)
├── supabase/
│   ├── functions/
│   │   └── plant-processor/
│   │       └── index.ts          # Edge function — full AI pipeline
│   └── migrations/               # DB schema migrations
├── index.html                    # PWA-ready HTML shell
├── package.json
├── vite.config.js
├── DESIGN.md                     # Full design system documentation
└── README.md
```

---

## Local Development

```bash
npm install
npm run dev        # http://localhost:5173
```

Requires Node 18+. No environment variables needed for the frontend — Supabase keys are embedded in `src/supabaseClient.js`.

---

## Supabase Edge Function

The AI pipeline runs as a Supabase Edge Function triggered by a Postgres `INSERT` on `plant_logs`.

**Deploy:**
```bash
npx supabase functions deploy plant-processor --project-ref thgdxffelonamukytosq --no-verify-jwt
```

**Required secrets** (set in Supabase dashboard or CLI):
```bash
npx supabase secrets set GEMINI_API_KEY=<key> --project-ref thgdxffelonamukytosq
npx supabase secrets set PLANTNET_API_KEY=<key> --project-ref thgdxffelonamukytosq
```

---

## AI Pipeline

```
Upload → Quality Gate → PlantNet (parallel) + Gemini independent ID
       → Cross-validation → Computed confidence → Health report → DB
```

See `DESIGN.md` for the full pipeline diagram, confidence tiers, and data model.

---

## Design System

Full brand spec, colour palette, typography, and component inventory in [`DESIGN.md`](DESIGN.md).

**Brand:** BotanIQ — "Botan" in forest green (Playfair Display 700) + "IQ" in leaf green italic.

---

## Deployment

Vercel auto-deploys on every push to `main`. Root directory is `/` (project root).

**Vercel project:** `botaniq` under `lordofwrongs-projects`
**Production URL:** https://plant-health-diagnosis.vercel.app
**Supabase project:** `thgdxffelonamukytosq`
