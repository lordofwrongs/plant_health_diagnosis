# BotanIQ — Review Fix Blueprint

> Generated from comprehensive security, performance, scalability, and UX review.
> Fixes marked ✅ are shipped and confirmed working in production.

---

## TIER 1 — Deploy Blockers & Critical Security

---

### ✅ FIX-01 · Corrupted Gemini Prompt Template
**Status:** Done (Sprint 18/19)  
Duplicate instruction 14 block removed; template literal now closes correctly at the end of instruction 15. Function compiles and deploys cleanly.

---

### ✅ FIX-02 · Q&A Turn Limit Bypass
**Status:** Done (Sprint 19)  
Turn limit moved to DB-side enforcement. `plant-chat` fetches existing conversation from `plant_conversations` and counts stored user turns — not the client-supplied `messages` body. Client can no longer bypass by sending `messages: []`.

---

### ✅ FIX-03 · user_id Not Verified Against Auth Session
**Status:** Done (Sprint 19)  
`plant-chat` extracts `user_id` from Supabase JWT for authenticated users; guest users must pass a `guest_`-prefixed ID from the request body. Cross-user impersonation is no longer possible.

---

### ✅ FIX-27 · Harden Anon RLS (Mass Deletion Vulnerability)
**Status:** Done (Sprint 19) — migration `security_rls_plant_logs.sql`  
Anon delete policy changed from `USING (true)` to `USING (user_id IS NOT NULL)`. Authenticated users now scoped to `auth.uid()`. Mass deletion via anon key no longer possible.

---

### ✅ FIX-04 · PostgREST Filter Injection via Plant Nickname
**Status:** Done (Sprint 19)  
Nearby-scan query in `plant-processor` replaced with parameterized `.eq()` / `.gte()` / `.lte()` calls. No more `.or()` string interpolation with user-controlled input.

---

## TIER 2 — High Priority (Functionality & Cost)

---

### ✅ FIX-05 · No Timeout on Gemini Call in plant-chat
**Status:** Done (Sprint 19)  
`plant-chat` Gemini call wrapped in `fetchWithTimeout(30_000ms)`. Hanging Gemini requests no longer block the function for the full 150s Supabase limit.

---

### ✅ FIX-06 · Polling Fetches SELECT * Every 8 Seconds
**Status:** Done (Sprint 19)  
HTTP polling fallback now fetches `status, error_details` only. Full record fetched in a second call once `status = 'done'`. Unnecessary JSONB column data no longer transmitted during polling.

---

### ✅ FIX-07 · No Per-User Rate Limiting on plant-processor
**Status:** Done (Sprint 19)  
`plant-processor` enforces 10 scans/user/day. Count query on `plant_logs` by `user_id` within UTC day; returns 429 at limit. Correction re-runs are exempt.

---

### ✅ FIX-07b · No Per-User Rate Limiting on plant-chat
**Status:** Done (Sprint 20)  
`plant-chat` sums `role: 'user'` messages across all `plant_conversations` updated in last 24 hours for the requesting user; returns 429 at ≥20.

---

### ✅ FIX-08 · care-reminder Will OOM at Scale
**Status:** Done (Sprint 19/21)  
`care-reminder` processes push subscriptions in paginated batches of 100. No longer loads all subscriptions into memory at once.

---

## TIER 3 — Medium Priority (Bugs & UX)

---

### ✅ FIX-09 · Language Dropdown Doesn't Close on Outside Click
**Status:** Done (Sprint 19)  
`useEffect` with `mousedown` listener on `document` added to `App.jsx`. Dropdown closes when user clicks anywhere outside it.

---

### ✅ FIX-10 · Q&A Messages Not Cleared After Correction Re-run
**Status:** Done (Sprint 19)  
`setQaMessages([])` and `setQaLoaded(false)` called when correction re-run starts. Old Q&A about the incorrectly identified plant no longer shown after re-analysis.

---

### ✅ FIX-11 · Race Condition in Correction Polling
**Status:** Done (Sprint 19)  
`active` flag prevents overlapping `setInterval` iterations. Stale results can no longer double-fire state updates.

---

### ✅ FIX-12 · Guest ID Uses Math.random() Instead of crypto
**Status:** Done (Sprint 19)  
Guest ID generation changed to `guest_${crypto.randomUUID()}`. Unpredictable across high-traffic scenarios.

---

### ✅ FIX-13 · Q&A Message Length Not Validated
**Status:** Done (Sprint 19)  
`plant-chat` enforces 500-character maximum on question. Returns 400 with clear error message if exceeded.

---

### ✅ FIX-14 · module-level navigator.userAgent
**Status:** Done (Sprint 19)  
`isAndroid` check moved inside `UploadScreen` via `useMemo`. No longer crashes in test environments or SSR.

---

### ✅ FIX-15 · PlantNet Cache Has No TTL
**Status:** Done (Sprint 19)  
Cache lookup now includes `.gte('created_at', cutoff.toISOString())` where cutoff is 60 days ago. Entries older than 60 days are ignored; a fresh API call is made.

---

### ✅ FIX-16 · care-reminder Auth Check is Misleading
**Status:** Done (Sprint 19)  
Manual Bearer prefix check removed from `care-reminder`. Comment added explaining that auth is enforced at the Supabase infrastructure layer (deployed without `--no-verify-jwt`).

---

### ✅ FIX-17 · Guest Records Never Cleaned Up
**Status:** Done (Sprint 19) — migration `sprint19_cleanup_cron.sql`  
pg_cron job `cleanup-orphan-guest-logs` (job ID 3) runs at 3am UTC daily. Deletes `plant_logs` rows where `user_id LIKE 'guest_%'` AND `created_at < NOW() - INTERVAL '30 days'`.

---

## TIER 4 — New Feature: Edibility & Plant Classification

---

### ✅ FIX-18 · Results Don't Classify Plant as Edible, Weed, Medicinal, or Ornamental
**Status:** Done (Sprint 20) — migration `sprint20_classification_reminders.sql`  
`plant_classification` jsonb column added to `plant_logs`. Gemini instruction 16 produces `primary_use` enum, `is_edible`, `edible_parts`, `edibility_notes`, `is_weed`, `weed_action`, `cultivation_status`. `ClassificationCard` displayed in About tab of ResultsScreen with use-category badge (teal=edible, amber=weed, purple=medicinal, blue=ornamental), edibility section, and weed-removal action block.

---

## TIER 5 — Low Priority / Feature Gaps

---

### FIX-19 · Fertilise & Pest Check Actions Not Exposed in UI
**Status:** Pending  
DB supports it (`plant_care_actions` with `action_type`). UI only exposes watering via "Mark Watered". Add "Mark fertilised" and "Mark pest checked" buttons to PlantDetailScreen.

---

### FIX-20 · No Search / Filter in My Garden
**Status:** Pending  
Add a search input to HistoryScreen that filters plant groups client-side by `PlantName` or `plant_nickname`. No backend change required.

---

### FIX-21 · Share Functionality Missing
**Status:** Pending  
Web Share API (`navigator.share()`) — plant name, health status, confidence, app URL. Fallback to clipboard copy.

---

### FIX-22 · Photos Lost on Scan Error
**Status:** Pending  
Lift `slotImages` state to `App.jsx`. On error, pass existing `slotImages` back to `UploadScreen`. Add "Retry with same photos" secondary button on `AnalysingScreen` error state.

---

### FIX-23 · No Account Logout or Data Export
**Status:** Pending  
`supabase.auth.signOut()` behind "Sign out" in language/settings dropdown. "Delete my data" button → edge function deletes all `plant_logs`, `plant_conversations`, `user_profiles` rows → signs out. (GDPR compliance medium term.)

---

### FIX-24 · Confidence Score Tooltip is Opaque
**Status:** Pending  
Replace tooltip text with source-explicit language: "PlantNet's botanical database and our AI both identified this as the same species — high agreement between independent sources."

---

### FIX-25 · Dark Mode Support
**Status:** Pending  
Add `@media (prefers-color-scheme: dark)` to `index.css` overriding `--bg`, `--card`, `--border`, `--text-*`, `--mist`, `--sage`. All components use CSS vars — no JSX changes needed.

---

### FIX-26 · Realtime Channel Limit at Scale
**Status:** Pending — low now, high at 500+ concurrent users  
Existing HTTP polling fallback already handles missed WebSocket events. At scale: remove Realtime, rely on polling at 4s interval.

---

## TIER 6 — Care-First Proactive Intelligence

---

### ✅ FIX-28 · Treatment Follow-up Logic
**Status:** Done (Sprint 20/21)  
`plant-processor` inserts into `follow_up_reminders` (remind_at = now + 7 days) after every pest-detected scan. `care-reminder` reads this table hourly, sends push notification to subscribed users, marks `processed = true` regardless of subscription status (prevents infinite retry).

---

### FIX-29 · Weather-Driven Care Alerts
**Status:** Pending  
Update Gemini prompt to use `weatherSnippet` to suggest moving plants indoors or extra watering if extreme heat/rain detected.

---

### ✅ FIX-30 · Offline Scan Queue
**Status:** Done (Sprint 20)  
`UploadScreen` checks `navigator.onLine`. Offline: compress images, save blobs + metadata to IndexedDB (`botaniq_offline_v1`). `window online` event auto-flushes: uploads to Storage, inserts `plant_logs`, calls `onUploadComplete`. Blue banner shows queued count.

---

## Pending Fix Summary

| Fix ID | What | Priority |
|---|---|---|
| FIX-19 | Fertilise/pest check UI buttons | Low |
| FIX-20 | Search in My Garden | Low |
| FIX-21 | Share functionality | Low |
| FIX-22 | Preserve photos on scan error | Low |
| FIX-23 | Logout + data deletion (GDPR) | Medium |
| FIX-24 | Confidence tooltip clarity | Low |
| FIX-25 | Dark mode | Low |
| FIX-26 | Realtime channel scaling | Low (now) |
| FIX-29 | Weather-driven care alerts | Medium |

---

*Effort key: XS = <30 min · S = 30–90 min · M = 2–4 hours*
