# BotanIQ — Design System & Architecture

## Brand Identity

**Name:** BotanIQ  
**Tagline:** Plant Intelligence, Powered by AI  
**Wordmark treatment:** "Botan" in forest green (Playfair Display) + "IQ" in leaf green italic — the capital Q visually signals IQ.

### Brand Pillars
- **Trust** — calibrated confidence scores, honest quality gate, clear error states
- **Precision** — botanical accuracy via dual-source AI (PlantNet + Gemini)
- **Warmth** — friendly language, natural green palette, no jargon

---

## Colour Palette

| Token | Value | Use |
|---|---|---|
| `--forest` | `#0A1F14` | Text at maximum weight |
| `--primary` | `#1B4332` | Primary actions, nav active, step indicators |
| `--mid` | `#2D6A4F` | Secondary actions, secondary text |
| `--leaf` | `#52B788` | Highlights, active states, logo IQ mark |
| `--mint` | `#95D5B2` | Decorative accents, logo stem |
| `--sage` | `#D8F3DC` | Vernacular badges, soft accents |
| `--mist` | `#F0FAF4` | Card backgrounds, input fills, subtle containers |
| `--bg` | `#F7FAF7` | Page background |
| `--card` | `#FFFFFF` | Elevated card surfaces |
| `--border` | `#E4EDE8` | Dividers, input borders |
| `--text-1` | `#0A1F14` | Headings, primary content |
| `--text-2` | `#2D4F38` | Body copy |
| `--text-3` | `#6B8C72` | Supporting text, subtitles |
| `--text-4` | `#9DB8A4` | Placeholders, timestamps, muted labels |
| `--gold` | `#C9982A` | Premium accents (confidence badges) |
| `--healthy` | `#059669` | Healthy status |
| `--fair` | `#D97706` | Fair / processing status |
| `--critical` | `#DC2626` | Critical / error status |

---

## Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Logo wordmark | Playfair Display | 700 | 20px |
| Page headings (h1) | Playfair Display | 700 | 26–34px |
| Section headings | DM Sans | 800, uppercase | 11px |
| Body copy | DM Sans | 400–500 | 14–15px |
| Labels | DM Sans | 600–700 | 11–12px |
| Navigation | DM Sans | 600 | 13px |
| Scientific names | DM Sans italic | 400 | 13–16px |

**Loading strategy:** Playfair Display (weights 500/600/700 + italic 500) + DM Sans (optical size 9–40, weights 300–700 + italic 400) via Google Fonts with `display=swap`.

---

## Spacing & Radii

| Token | Value | Common use |
|---|---|---|
| `--r-sm` | `10px` | Badges, tags, small chips |
| `--r-md` | `16px` | Dropdowns, medium cards |
| `--r-lg` | `24px` | Main cards, sections |
| `--r-xl` | `32px` | Large hero cards |
| `--r-full` | `9999px` | Pills, buttons, nav tabs |

---

## Elevation

| Token | Value | Use |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(10,31,20,0.05)` | Nav bar, cards at rest |
| `--shadow-sm` | `0 2px 8px rgba(10,31,20,0.07)` | Thumbnail badge, small floats |
| `--shadow-md` | `0 6px 24px rgba(10,31,20,0.10)` | Dropdowns |
| `--shadow-lg` | `0 16px 48px rgba(10,31,20,0.14)` | Language picker |

---

## Navigation

Sticky top nav (62px height, white, `--shadow-xs`) with three zones:
1. **Left** — BotanIQ logo mark + wordmark (taps to reset to Scan screen)
2. **Centre** — Tab group: **Scan** (upload/analysing) | **Garden** (history/results)
3. **Right** — Language selector pill (EN dropdown)

Active tab: `--mist` background, `--primary` text, 4px leaf-green dot indicator below label.

---

## Screen Inventory

### Upload Screen
- **Hero copy** above card: eyebrow label + headline + one-line sub
- **Drop zone**: dashed border → solid leaf green when photos are selected; drag-and-drop supported
- **Preview grid**: 3-column, 90px thumbnails; × remove button per tile; "+ Add more" tile
- **Photo tip callout**: lightbulb icon with angle guidance
- **Nickname field**: optional, helps group repeat scans of the same plant
- **CTA button**: full-width pill, `--primary` fill; disabled state at 45% opacity
- **Trust bar**: three pill badges (PlantNet · Gemini · Location)

### Analysing Screen
- **Centred focus layout**: leaf animation with two ripple rings
- **Step tracker**: 4 steps with animated dot progression
- **Quality gate** (when image rejected): amber tip box + "Retake Photo" CTA
- **Error state**: ⚠️ icon + message + reference ID + "Try Again" CTA

### Results Screen
- **Back / New Scan** nav row at top
- **Weather alert** (amber card, shown only when present)
- **Hero card**: full-width image (300px) + health status pill overlaid at bottom-left
- **Plant identity**: name (localised if non-English), scientific name italic, vernacular badges, confidence tag
- **Health Journey** (shown only when ≥2 scans exist): previous date + status + trend note
- **Visual Analysis**: AI narrative paragraph
- **Care Recommendations**: numbered step list with `--primary` circle indicators
- **Expert Tip**: dark forest green box with PRO TIP badge
- **Photo Tip**: brown box (shown only when AI returned a `photo_tip`)
- **Feedback widget**: "Was this accurate?" with Yes/No buttons; thanks message on submit

### Garden (History) Screen
- **Header**: "My Garden" (Playfair serif) + species count
- **Plant card**: thumbnail (80px, `--r-md`) + name + scientific name + health status dot
  - Scan badge (top-left of thumbnail): count when >1 scan exists
  - Error state: red-tinted card + friendly message + Retry button
  - Quality issue: amber card + tip message + Retake Photo button
  - Processing: amber pulsing dot
- **Empty state**: centred seedling emoji + headline + instruction

---

## AI Pipeline

```
User uploads image
       ↓
  Quality Gate (Gemini)
  → is_analyzable: false → quality_issue status → amber UI
  → is_analyzable: true  → continue (photo_tip stored for soft guidance)
       ↓
  PlantNet API (botanical specialist, parallel)
  + Gemini independent ID (no PlantNet hint)
       ↓
  Cross-validation logic:
  • PlantNet ≥ 85%  → use as ground truth → 93% confidence
  • PlantNet 20–85% → Gemini commits first, then reconciles:
      - Agree at 70%+  → 90%
      - Agree at 50–70% → 83%
      - Agree at 20–50% → 75%
      - Disagree        → 60%, prefix "Possibly"
  • No PlantNet      → Gemini only → 70%
       ↓
  Gemini generates full report (health, care plan, expert tip, weather alert)
       ↓
  Supabase stores result → realtime push to client
```

---

## Data Model (plant_logs)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | text | Guest ID from localStorage |
| `image_url` | text | Public Supabase Storage URL |
| `status` | text | `pending` / `done` / `error` / `quality_issue` |
| `PlantName` | text | Common name (English) |
| `ScientificName` | text | Genus species |
| `HealthStatus` | text | e.g. "Healthy", "Needs Attention" |
| `HealthColor` | text | Hex color for status badge |
| `AccuracyScore` | integer | Computed confidence 60–93 |
| `VisualAnalysis` | text | AI narrative |
| `CarePlan` | text | Newline-separated steps |
| `ExpertTip` | text | Optional expert advice |
| `WeatherAlert` | text | Optional climate warning |
| `vernacular_metadata` | jsonb | `{ english, hindi, tamil, telugu }` |
| `error_details` | text | Error message or photo tip |
| `plant_nickname` | text | User-assigned label |
| `preferred_language` | text | Report language |
| `latitude` / `longitude` | float | For weather context |
| `location_name` | text | Human-readable location |
| `IsCorrect` | boolean | Feedback flag |
| `UserCorrection` | text | User-supplied correct name |
| `processing_log` | jsonb | Edge function observability log |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Hosting | Vercel |
| Backend | Supabase Edge Functions (Deno) |
| Database | Supabase Postgres |
| Storage | Supabase Storage (`plant_images` bucket) |
| Realtime | Supabase Realtime (Postgres changes) |
| Plant ID | PlantNet API (free tier, 500 req/day) |
| AI Analysis | Google Gemini 2.5 Flash |
| Location | Browser Geolocation + ipapi.co fallback |

---

## Supported Languages

English · Hindi · Tamil · Telugu

Language selection stored in `localStorage` as `plant_care_prefs`. Report language sent as `preferred_language` in the DB insert and used in the Gemini prompt.
