# BotanIQ — Product Roadmap

## Vision
A state-of-the-art plant intelligence companion for home gardeners — accurate identification, honest confidence, actionable care, and a persistent garden that grows with the user across devices and time.

## Guiding Principles
- **Ship continuously** — every sprint ends with a deployed improvement, never a broken app
- **One sprint at a time** — no parallel feature work that creates merge complexity
- **Accuracy + speed + UX are always in scope** — no sprint ignores them
- **Validate before building the next** — each sprint is assessed before the next begins

---

## Current State — v1.0 (May 2026)

**Status: Production complete.** All planned features shipped and confirmed working.

| What works | Notes |
|---|---|
| Dual-source cross-validated plant ID (PlantNet + Gemini) | Anti-anchoring design |
| Calibrated confidence scoring (5 tiers, 60–93%) | Displayed with visual tier badge |
| Multi-language (EN/HI/TA/TE) | Stored in localStorage, passed to Gemini |
| Weather-aware care advice | Browser geolocation + ipapi.co fallback |
| Multi-angle diagnosis (3 slots) | Whole plant / leaf / stem |
| Pest identification + treatment plan | Gemini instruction, pest card in UI |
| Pest follow-up reminder push notification | Sent 7 days after pest-detected scan |
| Vital Signs panel (Hydration/Light/Nutrients/Pest Risk) | 0–100 progress bars |
| Toxicity/Safety card (cat/dog/human) | Per-species coloured risk pills |
| Environment card (light analysis + seasonal context) | From photo analysis + current month |
| Plant classification (edibility, weed, use category) | `plant_classification` jsonb, shown in About tab |
| Nutrient deficiency recommendations | Specific products, organic options, DIY recipes; Care tab |
| Harvest timing guide for edible plants | Visual readiness cues, days to harvest; Care tab |
| PlantNet reference leaf image | Shown when AccuracyScore < 90 to help verify ID |
| 3-tab results layout (Diagnosis / Care / About) | Replaces 14-card linear scroll |
| Growth narratives across scans | Gemini-generated warm 1–2 sentence comparison |
| PlantNet SHA-256 result caching | `plantnet_cache` table, 60-day TTL |
| Permanent garden with cross-device recovery | Magic link auth + guest_id migration |
| My Plants 2-column photo grid | HistoryScreen with skeleton shimmer loading |
| Per-plant detail screen (hero, timeline, care badge) | PlantDetailScreen |
| User feedback corrections + Q&A (3 turns/scan, DB-enforced) | Skips PlantNet on re-run; anti-anchoring |
| Voice Q&A via Web Speech API | Language-aware; gracefully hidden when unsupported |
| Push notifications (VAPID) + per-plant mute | Global opt-in in PlantDetailScreen, 8am local |
| Watering countdown + Mark Watered | Resets countdown, logged to `plant_care_actions` |
| Weekly email digest (Brevo) | Sunday 8am UTC; HMAC-signed one-click unsubscribe |
| In-app support form | `?` nav button → email to botaniqsupport@gmail.com via Brevo |
| Offline scan queue (IndexedDB) | Auto-flushes when connection returns |
| Onboarding tour | Banner + pulsing slot borders; auto-dismisses |
| Sample result preview on first visit | Horizontal card above upload; hides on first photo |
| First-scan celebration | Floating leaf particles + bouncing card with plant name |
| Empty garden redesign | Fan of 3 overlapping photo cards |
| Correction re-run skeleton | Shimmer cards replace stale content during re-analysis |
| Care reminder nudge in ResultsScreen | In Care tab; navigates to PlantDetailScreen |
| PWA — installable, offline-capable | Icons 192+512 PNG + SVG, theme `#1B4332` |
| Colourblind-safe health palette | Teal (`#0D9488`) / Amber / Red — no green/red reliance |
| HistoryScreen skeleton shimmer | 4-card shimmer grid replaces loading spinner |
| Accessibility | ARIA labels, roles, alt text |
| PostHog analytics | 15 events across scan funnel |
| Sentry error tracking | ErrorBoundary + DSN wired |
| Android camera bottom sheet | Native-style sheet (📷 Take Photo / 🖼️ Gallery / Cancel) |
| iOS safe area + viewport height fix | `env(safe-area-inset-bottom)` + `100dvh` / `100svh` |
| Security hardening | Rate limits, DB-side turn limits, JWT identity checks, RLS hardened |
| Guest data cleanup | pg_cron daily at 3am UTC; 30-day retention |

---

## Sprint History

### ✅ Sprint 1 — Speed: Merge Pipeline into One Gemini Call
Quality gate merged into main Gemini call (single call handles quality + ID + health). PlantNet runs in parallel. p50 scan time reduced to ~4–5s.

---

### ✅ Sprint 2 — Account: Permanent Garden with Cross-Device Recovery
Magic link auth, guest_id → auth user migration, cross-device garden recovery, `user_profiles` table.

---

### ✅ Sprint 3 — Onboarding: Convert First-Time Visitors
- Live "X plants analysed" counter on UploadScreen trust bar
- Photo guide accordion (3 ideal angles) on UploadScreen
- Onboarding tour banner + pulsing slot borders on first visit (Sprint 12a)
- Sample result preview card above upload slots (Sprint 15)
- First-scan celebration (Sprint 15)
- Empty garden redesign — fan of overlapping cards (Sprint 15)

---

### ✅ Sprint 4 — Retention: Care Schedule + Email Reminders
- Structured `care_schedule` JSON generated by Gemini, stored in `plant_logs`
- Watering badge in PlantDetailScreen (next water date + urgency)
- Push notifications (Sprint 13) — Web Push VAPID, 8am local time
- Weekly email digest (Sprint 17) — Brevo, Sunday 8am UTC

---

### ✅ Sprint 5 — Low-Confidence UX: Honest Uncertainty Communication
Tiered result cards (colour + border by confidence tier), "We're not sure" banner, "Could also be" row, confidence badge tooltip, re-scan CTA on low/uncertain results, "Possibly" prefix on override IDs.

---

### ✅ Sprint 6 — PlantNet Caching
PlantNet SHA-256 result caching (`plantnet_cache` table) — quota protection and repeat ID speedup. PlantNet quota monitoring (warns at ≥400/day in edge function logs). Cache TTL: 60 days.

---

### ✅ Sprint 7 — Multi-Angle Diagnosis
3-slot upload UI (whole plant / leaf / stem), multi-image Gemini call, single diagnosis record from multiple angles. PlantNet runs on primary image.

---

### ✅ Sprint 8 — Pest Identification
Pest detection in Gemini prompt (`pest_detected`, `pest_name`, `pest_treatment`). Pest card in ResultsScreen with treatment steps.

---

### ✅ Sprint 9 — PWA
PWA manifest, service worker (network-first nav, cache-first assets, offline page). Icons (192+512 PNG + SVG), theme colour, installable on iOS/Android.

---

### ✅ Sprint 10 — Accessibility + Observability
- ARIA labels, roles, alt text on all key elements
- Sentry ErrorBoundary wired (`VITE_SENTRY_DSN`)
- PostHog funnel analytics — 15 events (Sprint 14)
- Colourblind-safe health palette — teal/amber/red (Sprint 16)
- Skeleton screens — HistoryScreen shimmer grid (Sprint 16), correction re-run skeleton (Sprint 18)

---

### ✅ Sprint 11 — My Plants Garden View
HistoryScreen 2-column photo grid grouped by plant. PlantDetailScreen: hero banner, scan timeline, retry/delete, watering badge. Navigation: Garden → PlantDetailScreen → ResultsScreen (back returns to PlantDetailScreen).

---

### ✅ Sprint 12a — Onboarding Tour
First-visit green callout banner above upload slots + pulsing green border animation on all 3 slots. `localStorage` flag `botaniq_onboarding_done`. Auto-dismisses on first photo added.

---

### ✅ Sprint 12b — User Feedback + Q&A
- Thumbs-down → correction modal → re-run (skips PlantNet; Gemini IDs independently first)
- `plant-chat` edge function: 3-turn Q&A per scan, history stored in `plant_conversations`
- Registered users: prior Q&A passed to Gemini as personalisation context
- Q&A collapsible section in ResultsScreen with turn counter + guest sign-up nudge
- 💬 Q&A indicator badge on PlantDetailScreen scan rows
- `identification_feedback` + `plant_conversations` tables (migration executed)

---

### ✅ Sprint 13 — Push Notifications + Care Tracking
Web Push via VAPID, global opt-in + per-plant mute in PlantDetailScreen. "Mark watered" resets countdown via `plant_care_actions`. `care-reminder` edge function runs hourly via pg_cron, sends at 8am in user's local timezone (captured at subscribe time). iOS requires PWA installed (16.4+).

---

### ✅ Sprint 14 — Observability
Sentry ErrorBoundary active (`VITE_SENTRY_DSN`). PostHog 15-event funnel (`app_opened` → `scan_submitted` → `analysis_complete` → `register_completed` → `notification_opted_in`). PlantNet quota monitor in `plant-processor` (warns ≥400/day). Fixed Gemini `nullable: true` schema bug.

---

### ✅ Sprint 15 — Onboarding Polish
1. **Sample result preview** — compact horizontal card above upload form on first visit; auto-hides when first photo added.
2. **First-scan celebration** — floating leaf particles (`floatUp` keyframe) + bouncing card (`celebPop`) showing actual plant name. Tap-anywhere-to-dismiss, 3.5s auto-dismiss.
3. **Empty garden redesign** — fan of 3 overlapping photo cards (dark/mid/light gradients, rotated at −14°/+10°/−2°).

---

### ✅ Sprint 16 — AI Enrichments + UX Polish + Voice Q&A
1. **AI enrichments** — `toxicity`, `light_intensity_analysis`, `seasonal_context`, `vital_signs` wired through Gemini → DB → UI. Migration `sprint16_enrichments.sql` executed.
2. **Vital Signs meters** — 4-row progress bar panel (teal/amber/red by score; pest_risk inverted).
3. **Toxicity/Safety card** — per-species cat/dog/human risk with colour-coded pills.
4. **Environment card** — light intensity analysis + seasonal care note.
5. **Colourblind-safe palette** — `healthCategoryToColor()` changed to teal/amber/red; `--healthy` CSS var updated.
6. **HistoryScreen skeleton** — 4-card shimmer grid replaces loading spinner.
7. **Voice Q&A** — 🎤 mic button, Web Speech API, language-aware, pulsing teal animation. Confirmed working in production.

---

### ✅ Sprint 17 — Weekly Email Digest
Registered users receive a weekly garden digest every Sunday at 8am UTC via Brevo transactional email API. Content: plant health status, watering countdown, pest alerts. Opt-out only with HMAC-SHA256 signed one-click unsubscribe. `email_digest_opt_out` column on `users` table. `weekly-digest` edge function deployed.

---

### ✅ Sprint 18 — Final UX Polish
1. **Growth narratives** — Gemini writes 1–2 warm, specific sentences comparing current and previous scan. Stored in `plant_logs.growth_milestones.narrative`. Shown in Health Journey card.
2. **Correction re-run skeleton** — All result content hidden during re-analysis; 4 skeleton shimmer cards shown instead of stale data.
3. **Care reminder nudge** — "🔔 Set watering reminders in My Garden →" pill button at bottom of Care Schedule section in ResultsScreen.

---

### ✅ Bug Fix — Android Camera
Android browsers opened file manager only (no camera option). Fixed: `isAndroid` UA detection via `useMemo` inside `UploadScreen`; slot tap shows native-style bottom sheet (📷 Take Photo / 🖼️ Choose from Gallery / Cancel); two hidden inputs per slot — `capture="environment"` for camera, no capture for gallery. iOS unchanged. Scroll-lock prevents background scroll while sheet is open.

---

### ✅ Sprint 19 — Security Hardening + Stability
Comprehensive security and stability fixes from full codebase review:
- Q&A turn limit moved to DB-side enforcement (bypass-proof)
- `plant-chat` user identity verified via JWT
- PostgREST filter injection fixed with parameterized queries
- Gemini timeout added to `plant-chat` (30s)
- Polling changed to `status`-only then full fetch on done
- Rate limit: 10 scans/user/day in `plant-processor` (corrections exempt)
- `care-reminder` paginated to batches of 100
- Language dropdown click-outside handler
- Q&A cleared on correction re-run
- Correction poll race condition fixed
- Guest ID uses `crypto.randomUUID()`
- Q&A question length capped at 500 chars
- PlantNet cache TTL: 60 days
- `care-reminder` misleading Bearer check removed
- Daily guest log cleanup cron at 3am UTC
- Anon delete RLS tightened

---

### ✅ Sprint 20 — Classification UI + Pest Reminders + Offline Queue + Q&A Rate Limit
1. **ClassificationCard** — `primary_use` badge (teal=vegetable/fruit/herb, amber=weed), edible parts + notes, amber weed-removal action box. Reads from `plant_classification` jsonb.
2. **Pest follow-up reminders** — `plant-processor` inserts into `follow_up_reminders` (remind_at = now + 7 days) after every pest-detected scan; message names pest and plant.
3. **Offline scan queue** — `UploadScreen` checks `navigator.onLine`; offline path saves to IndexedDB (`botaniq_offline_v1`); `window online` event auto-flushes. Blue banner shows queued count.
4. **Q&A daily rate limit** — `plant-chat` sums `role: 'user'` messages across all conversations updated in last 24 hours; returns 429 at ≥20.

---

### ✅ Sprint 21 — Pest Follow-up Delivery + Cross-Platform Baseline
1. **Pest follow-up notifications delivered** — `care-reminder` reads `follow_up_reminders` after each watering pass; sends push notification per subscribed user; marks `processed = true` regardless of subscription status.
2. **iOS safe area on bottom sheet** — Cancel button padding changed to `max(40px, calc(env(safe-area-inset-bottom) + 20px))` to clear iPhone home indicator.
3. **Viewport height fix** — `#root` uses `min-height: 100dvh`; app container uses `100svh` to prevent iOS Safari address-bar overflow clipping.

---

### ✅ Sprint 22 — In-App Support Form
`?` button in nav opens `SupportModal` — name (optional), email (required), message (required, 1000 char limit). POSTs to new `support-request` edge function which sends HTML email to botaniqsupport@gmail.com via Brevo with Reply-To set to user's email. Confirmation screen shows all submitted details + "Email myself a copy" mailto button. Error boundary fallback retains mailto link for crash scenarios.

---

### ✅ Sprint 23 — Results Page Overhaul
1. **3-tab layout** — `ResultsScreen` restructured from 14-card linear scroll into Diagnosis / Care / About tabs. Feedback widget and Q&A always below tabs.
2. **ReferenceImagePanel** — when PlantNet returns a reference image and `AccuracyScore < 90`, shows compact leaf comparison card ("Does your plant's leaf shape match this?") between hero and tab bar. PlantNet URL changed to `include-related-images=true`; URL stored in `plant_logs.plantnet_reference_image`.
3. **NutrientCard** — Gemini produces `nutrient_recommendations` jsonb: deficiency detection, primary fix (product/recipe/application), organic alternative, DIY recipe, stage note, caution. Null when nutrients ≥ 75 and no visible deficiency. Shown in Care tab.
4. **HarvestGuideCard** — Gemini produces `harvest_guide` jsonb for edible plants: days to first harvest, current stage, visual readiness cues (✓ list), how-to-harvest, post-harvest tip, important warning. Null for non-edible plants. Shown in Care tab.
5. **DB migration** — `sprint23_results_overhaul.sql` adds `plantnet_reference_image`, `nutrient_recommendations`, `harvest_guide` to `plant_logs`.

---

## Future Enhancements (post v1.0)

These are not planned sprints — they are candidate improvements if the app grows or user feedback drives them.

| Enhancement | Notes |
|---|---|
| **Monetisation** | Stripe freemium, scan usage limit, Pro gating — deliberately excluded from v1.0 |
| **Growth timeline visualisation** | Chart or timeline of health scores across scans per plant |
| **Community plant library** | Shared identification database from anonymised scan data |
| **Fertilise & Pest Check actions in UI** | DB supports it (`plant_care_actions`); UI only exposes watering |
| **Search / Filter in My Garden** | Filter by plant name or nickname — client-side only, no backend change |
| **Share functionality** | Web Share API — plant name, health, confidence, app URL |
| **Preserve photos on scan error** | Lift `slotImages` to App.jsx; "Retry with same photos" on error |
| **Account logout + data export** | `supabase.auth.signOut()` + edge function to delete all user data |
| **Dark mode** | CSS custom property overrides via `prefers-color-scheme: dark` |
| **Apple/Google sign-in** | Reduce friction vs magic link for mobile users |
| **PlantNet quota upgrade** | Paid PlantNet plan for >500 req/day if traffic demands it |
| **Weather-driven care alerts** | Use `weatherSnippet` in Gemini prompt to trigger indoor/watering alerts |

---

## Metrics (track in PostHog)

| Metric | Target |
|---|---|
| p50 scan time | < 5s |
| Scan success rate (pending → done) | > 98% |
| First-scan completion rate | > 70% |
| 30-day retention | > 40% |
| PlantNet quota utilisation | < 70%/day |
| Identification accuracy | > 85% |
