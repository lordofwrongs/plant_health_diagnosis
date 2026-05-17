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
| `--healthy` | `#0D9488` | Healthy status — teal (colourblind-safe; was `#059669` green) |
| `--fair` | `#D97706` | Fair / processing status — amber |
| `--critical` | `#DC2626` | Critical / error status — red |

**Note:** Health status colouring uses `healthCategoryToColor()` function which maps to teal/amber/red, never green/red, for colourblind accessibility.

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
3. **Right** — Language selector pill (EN dropdown) + `?` support button

Active tab: `--mist` background, `--primary` text, 4px leaf-green dot indicator below label.

---

## Screen Inventory

### Upload Screen
- **Sample result preview** (first visit only): compact horizontal card above upload form showing a specimen plant name, scientific name, health badge, 93% confidence, and care pills — auto-hides when user adds first photo
- **Hero copy** above card: eyebrow label + headline + one-line sub
- **Drop zone**: dashed border → solid leaf green when photos are selected; drag-and-drop supported
- **3-slot upload**: whole plant / leaf close-up / stem or soil; first-visit pulsing green borders (onboarding tour)
- **Onboarding tour banner**: green callout above slots on first visit; auto-dismisses on first photo added; "Got it" button; `localStorage` flag `botaniq_onboarding_done`
- **Preview thumbnails**: 90px with × remove button per slot
- **Nickname field**: optional, groups repeat scans of the same plant
- **CTA button**: full-width pill, `--primary` fill; disabled until at least one photo added
- **Trust bar**: three pill badges (PlantNet · Gemini · Location)
- **Offline queue banner**: blue banner when scans are queued in IndexedDB (shown when `navigator.onLine = false` during submit)
- **Android bottom sheet**: tap a slot on Android → native-style sheet ("📷 Take Photo / 🖼️ Choose from Gallery / Cancel"); separate hidden inputs for camera vs gallery

### Analysing Screen
- **Centred focus layout**: leaf animation with two ripple rings
- **Step tracker**: 4 steps with animated dot progression
- **Realtime + polling**: Supabase Realtime WebSocket; HTTP polling fallback every 8s (polls `status` + `error_details` only; fetches full record on `done`); 90s hard timeout
- **Quality gate** (when image rejected): amber tip box + "Retake Photo" CTA
- **Error state**: ⚠️ icon + message + reference ID + "Try Again" CTA

### Results Screen (3-Tab Layout — Sprint 23)

The Results Screen uses a **3-tab layout** (Diagnosis / Care / About) replacing the previous 14-card linear scroll. Structure from top to bottom:

1. **Back / New Scan** nav row
2. **Correction re-run state**: when re-analysis is running, all tab content hidden; 4 skeleton shimmer cards shown with spinning banner
3. **Hero card** (always visible, above tabs): full-width image (300px) + health status pill overlaid at bottom-left (teal/amber/red) + plant name + scientific name italic + vernacular badges + confidence tag + Health Journey sentence (if ≥2 scans)
4. **ReferenceImagePanel** (between hero and tabs, shown only when `plantnet_reference_image` is set AND `AccuracyScore < 90`): PlantNet's reference leaf image on the left + "REFERENCE LEAF" label + scientific name + "Does your plant's leaf shape match this?" prompt + "Wrong plant" CTA
5. **Tab bar**: Diagnosis | Care | About — pill-style selector, active tab gets `--mist` background and `--primary` text

**Diagnosis tab:**
- Weather alert (amber card, shown only when present)
- Visual Analysis narrative paragraph
- Vital Signs panel: 4-row progress bars — Hydration / Light / Nutrients / Pest Risk (0–100 from `vital_signs` jsonb); teal/amber/red by score; Pest Risk bar is inverted (high = red)
- Health Journey (shown only when ≥2 scans): previous date + status + Gemini-generated growth narrative from `growth_milestones.narrative`
- Pest card (shown only when `pest_detected = true`): pest name + treatment steps

**Care tab:**
- Care Schedule: watering / fertilising / pest-check intervals from `care_schedule` jsonb
- NutrientCard (shown when `nutrient_recommendations` is not null): deficiency alert (amber pill) + deficiency signs + primary fix (product name, recipe, application method) + organic alternative + DIY recipe + stage note (teal) + caution (red)
- HarvestGuideCard (shown when `harvest_guide` is not null AND `plant_classification.is_edible = true`): days-to-first-harvest + current stage estimate + visual readiness cues (✓ list) + check frequency + how-to-harvest + post-harvest tip + important warning (red)
- "Set watering reminders in My Garden →" nudge button (navigates to PlantDetailScreen)

**About tab:**
- ClassificationCard: `primary_use` badge (teal=vegetable/fruit/herb, amber=weed/invasive, purple=medicinal, blue=ornamental) + edible parts + edibility notes + weed-removal action box (amber, when `is_weed = true`)
- Toxicity/Safety card: per-species cat/dog/human risk with colour-coded pills (Safe / Caution / Toxic)
- Environment card: light intensity analysis (from photo) + seasonal care advice for current month

**Always below tabs (regardless of active tab):**
- Feedback widget: "Was this accurate?" with thumbs-up / thumbs-down; thumbs-down opens correction modal (user types correct name → correction re-run skips PlantNet, injects user correction as Gemini candidate)
- Q&A section: collapsible; mic button for voice input (Web Speech API, pulsing teal when listening); 3 turns per scan (DB-enforced); conversation stored in `plant_conversations`; guest sign-up nudge after turn 3; Q&A cleared when correction re-run starts

### Registration Modal
- Full-screen overlay (blurred dark backdrop) after first scan result, if user not yet registered
- Never shown more than once — state in `localStorage.botaniq_registered` (`"true"` or `"skipped"`)
- **Fields**: First name (required) · Last name (required) · Email (required) · Phone (optional)
- Magic-link OTP flow: submitting sends a Supabase magic link to the email
- **Skip link**: "Skip for now" — stores `"skipped"` in localStorage
- Animation: card fades up on entry (`fadeUp` keyframe, 0.3s)

### Support Modal
- Opens via `?` button in nav (right of language selector)
- **Fields**: Name (optional), Email (required), Message (required, 1000 char limit)
- POSTs to `support-request` Supabase edge function → Brevo email to botaniqsupport@gmail.com with Reply-To set to user's email
- Confirmation screen shows submitted details + "Email myself a copy" button (opens pre-filled mailto)
- Error boundary fallback retains mailto link for crash scenarios

### Garden (History) Screen
- **Header**: "My Garden" (Playfair serif) + species count
- **Loading state**: 4-card skeleton shimmer grid (`skeleton-shimmer` CSS class) while data loads
- **2-column photo grid**: plants grouped by identity (plant_nickname || PlantName); sorted by most recent scan
- **Plant card**: thumbnail (80×80px, `--r-md`) + name + scan count badge (top-left when >1 scan) + health status dot
  - Error state: red-tinted card + friendly message + Retry button
  - Quality issue: amber card + tip message + Retake Photo button
  - Processing: amber pulsing dot
- **Empty state**: fan of 3 overlapping photo cards (dark/mid/light green gradients, rotated) teasing what a full garden looks like; CTA to scan first plant
- Tap a plant card → PlantDetailScreen

### Plant Detail Screen
- **Back** nav to Garden
- **Hero banner**: blurred primary scan image as full-width background (200px) + plant name + health status pill
- **Watering badge**: "Water in X days" / "Water today!" with urgency colour; updates from `care_schedule.water_every_days` and last `plant_care_actions` watered entry
- **Mark Watered button**: resets watering countdown from today; writes to `plant_care_actions`
- **Push notifications toggle**: global Web Push opt-in (shows browser permission prompt); per-plant mute toggle below; mute state stored in `push_mutes`; iOS note shown when unsupported
- **Scan history timeline**: full list of all scans for this plant; each row shows date, health status (coloured), 💬 if Q&A exists; tap row → ResultsScreen (back returns here)
- **Retry / Retake** per scan; **Delete** per scan with confirmation

---

## First-Scan Celebration

Triggered after first scan result returns (if `botaniq_first_scan_celebrated` not in localStorage):
1. Floating leaf particles: 8 leaves with `floatUp` keyframe animation, varied sizes (18–32px), staggered delays
2. Bouncing card: white card (`celebPop` keyframe, 0.5s spring) showing "Meet your {PlantName}!" with plant icon
3. "See your results →" CTA button
4. Tap-anywhere-to-dismiss; auto-dismisses at 3.5s via clearTimeout ref

---

## AI Pipeline

```
User uploads 1–3 images (whole plant / leaf / stem)
       ↓
  Quality Gate (Gemini)
  → is_analyzable: false → quality_issue status → amber UI, retake CTA
  → is_analyzable: true  → continue (photo_tip stored for soft guidance)
       ↓
  PlantNet API (botanical specialist, parallel on primary image)
  SHA-256 cache check → skip API if cached result < 60 days old
  include-related-images=true → reference leaf image URL extracted
       ↓
  Gemini pipeline (with all images as inlineData parts):
    Step 1 — independent ID (no PlantNet hint yet — anti-anchoring)
    Step 2 — show PlantNet candidates (or user correction if re-run)
    Step 3 — reconcile → final ID + health + care + enrichments
  ↓
  Cross-validation logic → AccuracyScore:
  • PlantNet ≥ 85%  + Gemini confirms → 93%
  • Both agree, PlantNet 70–84%       → 90%
  • Both agree, PlantNet 50–69%       → 83%
  • Both agree, PlantNet 20–49%       → 75%
  • Gemini overrides PlantNet          → 60%, "Possibly" prefix
  • No PlantNet (Gemini only)          → 70%
  • Correction re-run, Gemini agrees   → 83%
  • Correction re-run, Gemini overrides→ 60%
       ↓
  Gemini structured output (PLANT_ANALYSIS_SCHEMA):
  • Core: PlantName, ScientificName, HealthStatus, CareInstructions, care_schedule
  • Enrichments: toxicity, vital_signs, light_intensity_analysis, seasonal_context
  • Classification: plant_classification (primary_use, is_edible, is_weed, etc.)
  • Nutrients: nutrient_recommendations (null if vital_signs.nutrients ≥ 75)
  • Harvest: harvest_guide (null for non-edible plants)
  • Pest: pest_detected, pest_name, pest_treatment
  • Growth: growth_milestones.narrative (if prior scans exist)
       ↓
  DB update → plantnet_reference_image stored (or preserved from prior scan on re-run)
       ↓
  Realtime push to client
```

---

## Data Model (users)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `guest_id` | text (unique) | Links to `plant_care_guest_id` in localStorage — joins to `plant_logs.user_id` |
| `first_name` | text | |
| `last_name` | text | |
| `email` | text | Required for weekly digest |
| `phone` | text | Optional |
| `email_digest_opt_out` | boolean | Default false — set true via unsubscribe link |
| `created_at` | timestamptz | Auto-set |

---

## Data Model (plant_logs)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | text | Guest ID from localStorage |
| `image_url` | text | Public Supabase Storage URL (primary image) |
| `additional_images` | text[] | Secondary angle URLs (leaf, stem) |
| `status` | text | `pending` / `processing` / `done` / `error` / `quality_issue` |
| `PlantName` | text | Common name (localised) |
| `ScientificName` | text | Genus species |
| `HealthStatus` | text | 2–4 word label e.g. "Mildly Stressed" |
| `AccuracyScore` | integer | Computed confidence 60–93 |
| `CarePlan` | jsonb | Array of `{title, description}` care instructions |
| `care_schedule` | jsonb | `{water_every_days, fertilise_every_days, check_pests_every_days, notes}` |
| `pest_detected` | boolean | |
| `pest_name` | text | |
| `pest_treatment` | jsonb | Array of treatment step strings |
| `toxicity` | jsonb | `{risk_cats, risk_dogs, risk_humans, notes}` — Safe/Caution/Toxic per group |
| `light_intensity_analysis` | text | Narrative from photo analysis |
| `seasonal_context` | text | Care note for current month |
| `vital_signs` | jsonb | `{hydration, light, nutrients, pest_risk}` — 0–100 integer scores |
| `growth_milestones` | jsonb | `{narrative: "..."}` — Gemini-generated growth comparison sentence |
| `plant_classification` | jsonb | `{primary_use, is_edible, edible_parts, edibility_notes, is_weed, weed_action, cultivation_status}` |
| `plantnet_reference_image` | text | PlantNet reference leaf image URL (medium size) — shown when AccuracyScore < 90 |
| `nutrient_recommendations` | jsonb | `{deficiency_detected, deficiency_signs, primary_fix, organic_option, diy_option, stage_note, caution}` — null when nutrients ≥ 75 |
| `harvest_guide` | jsonb | `{days_to_first_harvest, current_stage_estimate, visual_readiness_cues, check_frequency, how_to_harvest, post_harvest_tip, important_warning}` — null for non-edible plants |
| `plant_nickname` | text | User-assigned label (groups scans together) |
| `preferred_language` | text | EN / HI / TA / TE |
| `IsCorrect` | boolean | User feedback thumbs-up/down |
| `UserCorrection` | text | User-supplied correct name |
| `plantnet_candidates` | jsonb | Top 3 PlantNet candidates `[{name, common, score}]` |
| `processing_log` | jsonb | Edge function observability: plantnet_score, independent_id, etc. |
| `error_details` | text | Error message or photo_tip |
| `created_at` | timestamptz | |

---

## Data Model (supporting tables)

| Table | Key columns | Purpose |
|---|---|---|
| `push_subscriptions` | `user_id`, `endpoint`, `p256dh`, `auth_key`, `timezone` | VAPID push subscription per device |
| `push_mutes` | `user_id`, `plant_name` | Per-plant notification mute |
| `plant_care_actions` | `user_id`, `plant_name`, `action_type`, `actioned_at` | Watering/fertilising/pest-check log |
| `plant_conversations` | `log_id`, `user_id`, `messages jsonb` | Q&A history per scan |
| `identification_feedback` | `log_id`, `user_id`, `user_correction` | Thumbs-down corrections |
| `plantnet_cache` | `image_hash` (SHA-256), `result jsonb` | PlantNet API response cache (60-day TTL) |
| `user_profiles` | `id` (= auth user id), `email`, `guest_id` | Magic-link auth user profiles |
| `follow_up_reminders` | `log_id`, `user_id`, `remind_at`, `processed` | Pest follow-up push notifications (7 days after pest scan) |

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
| Plant ID | PlantNet API (free tier, 500 req/day, SHA-256 cache, 60-day TTL) |
| AI Analysis | Google Gemini 2.5 Flash (`thinkingBudget: 0`) |
| Push | Web Push via VAPID (`care-reminder` edge function) |
| Email | Brevo transactional API (`weekly-digest` + `support-request` edge functions) |
| Analytics | PostHog (us.i.posthog.com, 15 events) |
| Observability | Sentry (ErrorBoundary + `VITE_SENTRY_DSN`) |
| Location | Browser Geolocation + ipapi.co fallback |

---

## Supported Languages

English · Hindi · Tamil · Telugu

Language selection stored in `localStorage` as `plant_care_prefs`. Report language sent as `preferred_language` in the DB insert and used in the Gemini prompt. Voice Q&A uses language-appropriate speech recognition locale (en-US / hi-IN / ta-IN / te-IN).

---

## Security Model

| Area | Implementation |
|---|---|
| Auth | Magic link only (Supabase Auth). Guest users get `crypto.randomUUID()`-based guest IDs. |
| RLS | `plant_logs`: anon insert/select/delete (user_id must not be null for delete). Auth users scoped to `auth.uid()`. |
| Rate limiting | `plant-processor`: 10 scans/user/day (corrections exempt). `plant-chat`: 20 Q&A questions/user/day. |
| Q&A identity | `plant-chat` verifies `user_id` against Supabase JWT for authenticated users; guests must pass `guest_`-prefixed ID. |
| Q&A turn limit | Enforced from DB record count, not client-supplied `messages` body. |
| Unsubscribe | Weekly digest unsubscribe URL is HMAC-SHA256 signed (`UNSUBSCRIBE_SECRET`). |
| Guest cleanup | pg_cron job (3am UTC daily) deletes guest `plant_logs` rows older than 30 days. |
| Offline queue | IndexedDB (`botaniq_offline_v1`); blobs stored locally; auto-flushed on `window online`. |
