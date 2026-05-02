# BotanIQ — Product Roadmap

## Vision
A state-of-the-art plant intelligence companion for home gardeners — accurate identification, honest confidence, actionable care, and a persistent garden that grows with the user across devices and time.

## Guiding Principles
- **Ship continuously** — every sprint ends with a deployed improvement, never a broken app
- **One sprint at a time** — no parallel feature work that creates merge complexity
- **Accuracy + speed + UX are always in scope** — no sprint ignores them
- **Validate before building the next** — each sprint is assessed before the next begins

---

## Current State (May 2026)
| What works | What's missing |
|---|---|
| Dual-source cross-validated plant ID | Account system — garden lives in localStorage only |
| Calibrated confidence scoring | Care reminders — no reason to return |
| Multi-language (EN/HI/TA/TE) | Monetisation — no revenue path |
| Weather-aware care advice | Pest identification |
| Scan history timeline | Onboarding — cold drop zone on first visit |
| Soft registration (name + email) | Low-confidence UX — 60% looks same as 93% |
| Regional plant context (India/SEA) | Multi-angle diagnosis |
| Plain-English analysis | PlantNet quota ceiling (500 req/day) |

---

## Sprint Plan

---

### Sprint 1 — Speed: Merge Pipeline into One Gemini Call
**Goal:** Cut scan time from ~8s to ~4–5s
**Why first:** Every other improvement is undermined if the app feels slow. Performance is table-stakes.

**Deliverables:**
- Merge Stage 1 (quality gate) into Stage 3 (analysis) as a single Gemini call
  - Quality fields (`is_analyzable`, `photo_tip`, `organ`) added to the main JSON schema
  - If `is_analyzable = false`, pipeline short-circuits after one call instead of two
- PlantNet runs in parallel with the single Gemini call (no longer blocked by a separate quality call)
- Add skeleton loading shimmer in ResultsScreen while result is pending
- Add scan timer in AnalysingScreen ("Analysing… 3s") so users see progress not a spinner

**Success metric:** p50 scan time < 5s, p95 < 8s on a mobile connection

---

### Sprint 2 — Account: Permanent Garden with Cross-Device Recovery
**Goal:** Plant history survives browser clears, device switches, and reinstalls
**Why second:** Everything downstream (reminders, monetisation, personalisation) requires a real user identity.

**Deliverables:**
- Supabase Auth with **magic link** (email → one-time link → verified, no password)
- On first registration: link `guest_id` → authenticated `user.id`, migrate `plant_logs` rows
- On subsequent logins from a new device: garden is restored from the server
- Auth state persisted in Supabase session (not just localStorage)
- Graceful guest mode still supported — users can scan without signing in, but prompted to save their garden after first result
- Update RegisterModal to send magic link instead of just storing name/email
- New `user_profiles` table replacing the current `users` table: `id`, `email`, `first_name`, `last_name`, `phone`, `created_at`

**Success metric:** User can clear site data and recover full garden history by entering email

---

### Sprint 3 — Onboarding: Convert First-Time Visitors
**Goal:** A new visitor understands BotanIQ's value within 10 seconds and is motivated to scan
**Why third:** Account system now exists, so onboarding can drive sign-ups with a real value proposition.

**Deliverables:**
- **Sample result walkthrough** — new users see an animated preview of a complete diagnosis (identification, confidence, health status, care plan) before they upload anything
- **"X plants diagnosed" live counter** — pulled from DB count, shown on the Upload screen trust bar
- **First-scan celebration** — after a user's first result, show a "Welcome to your garden" moment before the registration prompt
- **Empty garden state redesign** — HistoryScreen empty state becomes an invitation with a sample plant card, not just a seedling emoji
- **Photo guide tooltip** — before upload, show 3 ideal photo angles (side, close-up leaf, stem base) with illustrated examples

**Success metric:** First-scan completion rate (upload → result) > 70%

---

### Sprint 4 — Retention: Care Schedule + Email Reminders
**Goal:** Users return to the app because BotanIQ reminds them what to do and when
**Why fourth:** The biggest commercial gap. Without return visits, everything else is a one-shot product.

**Deliverables:**
- **Structured care schedule** — Gemini generates a JSON schedule alongside the care plan:
  ```json
  { "water_every_days": 3, "fertilise_every_days": 14, "check_pests_every_days": 7, "next_action": "2026-05-04" }
  ```
- New `care_schedules` table in Supabase storing schedules per plant log
- **Email reminder system** via [Resend](https://resend.com) (free tier: 3,000 emails/month):
  - "Time to water your Snake Gourd 🌱" — triggered by schedule
  - "It's been 2 weeks — rescan your Chili Pepper to track its recovery"
  - Digest email: weekly garden health summary
- Reminder preferences stored per user (opt-out per plant or globally)
- **Garden view shows upcoming care actions** — next watering, next fertilising, overdue indicator

**Success metric:** 30-day retention rate > 40% for registered users

---

### Sprint 5 — Low-Confidence UX: Honest Uncertainty Communication
**Goal:** Users understand what low confidence means and take action to improve it
**Why fifth:** Accuracy work is already done in the pipeline; this makes uncertainty visible and actionable in the UI.

**Deliverables:**
- **Tiered result cards** — visual treatment changes by confidence:
  - 90–93% → normal hero card, green confidence badge
  - 75–89% → amber confidence badge, subtle "Based on limited visual evidence" note
  - 60–74% → amber card border, "Uncertain identification" label, "Could also be" row prominent
  - <60% → "We're not sure" state, large re-scan CTA, alternatives shown
- **Re-scan guide** — when confidence < 80%, show exactly which angle/feature would help (pulled from `photo_tip`)
- **"Scan again with better angle"** button in low-confidence results that pre-fills the nickname and opens the camera
- Confidence badge tooltip: tap to see "What does 75% mean?" explanation

**Success metric:** Re-scan rate on low-confidence results > 25%

---

### Sprint 6 — Monetisation: Freemium Model
**Goal:** Generate revenue to cover API costs and sustain the product at scale
**Why sixth:** Product quality is now high enough to charge for. Account system exists to gate features.

**Tiers:**

| | Free | BotanIQ Pro (₹199/mo or $2.99/mo) |
|---|---|---|
| Scans | 10/month | Unlimited |
| Languages | English only | All 4 languages |
| Care reminders | — | ✓ |
| Scan history | Last 5 | Unlimited |
| Pest identification | — | ✓ (Sprint 8) |
| Multi-angle diagnosis | — | ✓ (Sprint 7) |

**Deliverables:**
- Stripe Checkout integration (one-time setup, Stripe handles all payment complexity)
- Scan usage counter per user per month in DB
- Soft gate with upgrade prompt when free limit approached (at 8/10: "2 free scans left this month")
- Feature flags per user tier stored in `user_profiles`
- PlantNet API upgrade to paid plan OR implement result caching:
  - Cache PlantNet results by image hash (SHA-256 of compressed image bytes)
  - Saves quota and speeds up repeat identifications of common plants

**Success metric:** 5% of active users convert to Pro within 60 days of launch

---

### Sprint 7 — Multi-Angle Diagnosis: Accuracy for Hard Cases
**Goal:** Solve the young cucurbit / seedling identification problem at the source
**Why seventh:** Infrastructure is stable, monetisation exists — now focus on accuracy leadership.

**Deliverables:**
- **Guided multi-angle capture UI** in UploadScreen:
  - Step 1: "Whole plant" photo
  - Step 2: "Close-up of a leaf" photo
  - Step 3: "Stem and soil" photo
  - Each slot shows an illustrated guide icon
  - Can still submit with just 1 photo (backward compatible)
- **Pipeline change** — when multiple images submitted for same plant, send all images to Gemini in a single call (Gemini supports multiple `inlineData` parts)
- **Single diagnosis result** from multiple angles, not separate scan records
- PlantNet still runs on the best-quality image (auto-selected by size/sharpness heuristic)

**Success metric:** Identification accuracy on cucurbit seedlings > 80% (manual test set)

---

### Sprint 8 — Pest Identification: New High-Value Use Case
**Goal:** Diagnose specific pest infestations, not just general health
**Why eighth:** Pest problems are urgent — users discover this need fast and will pay for it. Pro-tier feature.

**Deliverables:**
- **Pest detection added to Stage 3 Gemini prompt** — new JSON fields:
  ```json
  "pest_detected": true,
  "pest_name": "Spider Mites",
  "pest_description": "...",
  "pest_treatment": ["Step 1...", "Step 2..."]
  ```
- New `pest_detected`, `pest_name`, `pest_treatment` columns in `plant_logs`
- **Pest result card** in ResultsScreen — shown below health analysis when pest detected
  - Pest name, description in plain English
  - Treatment steps with product type recommendations (neem oil spray, insecticidal soap, etc.)
  - "Check surrounding plants" warning when applicable
- **Pest ID is a Pro-tier feature** — free users see "Pest detected — upgrade to see treatment plan"
- **Common pests reference** — static library page showing 10 most common pests with photo examples

**Success metric:** Pest detection tested on 20 known-pest photos with > 80% correct identification

---

### Sprint 9 — PWA + Push Notifications
**Goal:** Installable app with native-like experience and true push reminders
**Why ninth:** Care reminders (Sprint 4) used email. Push notifications are more effective for time-sensitive care actions.

**Deliverables:**
- **PWA manifest** — app installable on iOS/Android home screen with BotanIQ icon
- **Service worker** — caches app shell, last garden state, last 3 scan results for offline viewing
- **Offline mode** — graceful "You're offline — here's your last garden" page instead of blank screen
- **Web Push notifications** via Supabase Edge Functions + VAPID keys:
  - Watering reminders
  - "Your plant hasn't been scanned in 3 weeks"
  - Weather alert push ("Heavy rain forecast — check drainage on your bottle gourd")
- **Notification preferences** in a new Settings screen (per-plant, per-type opt-in)

**Success metric:** PWA install rate > 15% of registered users; push opt-in > 50% of PWA installs

---

### Sprint 10 — Accessibility + Observability
**Goal:** Commercial-grade quality bar — usable by everyone, observable in production
**Why last:** Product is mature enough that polishing is high-leverage.

**Deliverables:**
- **Accessibility:**
  - Health status communicated in text AND colour (not colour alone)
  - All interactive elements keyboard-navigable
  - ARIA labels on all meaningful elements
  - Alt text generated by Gemini for each scanned plant image (stored in DB)
  - Minimum contrast ratios met (WCAG AA)
- **Observability:**
  - Error tracking via Sentry (free tier)
  - Scan funnel analytics: upload → analysing → result → registration → reminder opt-in
  - PlantNet quota monitoring with Slack/email alert at 80% daily usage
  - p50/p95 scan latency dashboard
- **UI polish:**
  - Colourblind-safe health palette (shape + colour, not colour alone)
  - Skeleton screens for all async states
  - Micro-animations on result reveal

**Success metric:** Lighthouse accessibility score > 90; zero P0 errors undetected in production

---

## Summary Timeline

| Sprint | Focus | Est. Effort | Unlocks |
|---|---|---|---|
| 1 | Speed — single Gemini call | 2 days | Better UX immediately |
| 2 | Account — magic link auth | 4 days | Everything downstream |
| 3 | Onboarding — first-time UX | 2 days | Conversion |
| 4 | Retention — care reminders | 4 days | DAU/MAU |
| 5 | UX — low confidence states | 2 days | Trust + re-scan |
| 6 | Monetisation — freemium | 4 days | Revenue + sustainability |
| 7 | Accuracy — multi-angle | 3 days | Differentiation |
| 8 | Pest ID | 3 days | Pro tier value |
| 9 | PWA + push | 4 days | Native-like reach |
| 10 | Accessibility + observability | 3 days | Commercial grade |

**Total: ~31 working days across 10 sprints**

---

## Metrics Dashboard (track from Sprint 1)

| Metric | Today | Target |
|---|---|---|
| p50 scan time | ~8s | < 5s |
| Scan success rate (pending → done) | ~95% | > 98% |
| First-scan completion rate | unknown | > 70% |
| 30-day retention | ~0% (no reminders) | > 40% |
| Pro conversion rate | — | > 5% |
| PlantNet quota utilisation | unknown | < 70%/day |
| Identification accuracy (curated test set) | ~70% | > 85% |
