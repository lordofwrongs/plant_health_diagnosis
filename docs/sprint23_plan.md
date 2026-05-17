# Sprint 23 — Results Page Overhaul

## Context (read this first)

The current `ResultsScreen` renders up to **14 cards in a single linear scroll**, producing ~3,000px of content per scan. This was identified as the primary UX problem in a review session (May 2026). Four improvements were agreed:

1. **3-tab layout** — collapse 14 cards into Diagnosis / Care / About tabs after the hero card
2. **Nutrient specifics** — Gemini currently outputs vague "balanced liquid fertiliser" advice; we need named products, DIY recipes, and deficiency-specific guidance
3. **Harvest guide** — no harvest timing is shown for edible plants; this is a critical gap for food growers
4. **PlantNet reference image** — show a reference leaf image from PlantNet alongside the hero, so users can verify the AI identification with their own eyes

All four are implemented together. The tab layout is purely frontend. The other three require a Gemini schema change, a DB migration, and a plant-processor update.

---

## Files Changed in This Sprint

| File | Change |
|---|---|
| `supabase/functions/plant-processor/index.ts` | PlantNet reference image capture; new Gemini schema fields; nutrient & harvest prompt instructions |
| `src/components/ResultsScreen.jsx` | 3-tab layout; new NutrientCard, HarvestGuideCard, ReferenceImagePanel components; card reorder |
| `supabase/migrations/sprint23_results_overhaul.sql` | Add 3 new columns to `plant_logs` |

---

## Change 1 — DB Migration

**File:** `supabase/migrations/sprint23_results_overhaul.sql`

Create this file and run it in the Supabase SQL editor before deploying anything else.

```sql
-- Sprint 23: results page overhaul
-- Three new columns on plant_logs

ALTER TABLE plant_logs
  ADD COLUMN IF NOT EXISTS plantnet_reference_image text,
  ADD COLUMN IF NOT EXISTS nutrient_recommendations jsonb,
  ADD COLUMN IF NOT EXISTS harvest_guide jsonb;
```

No indexes needed — these are read once per scan view, not queried in bulk.

---

## Change 2 — PlantNet Reference Image

### Why

PlantNet is called with `include-related-images=false` (line 183 of `plant-processor/index.ts`). PlantNet CAN return reference organ images for the top match — we just disabled it. These are species-confirmed leaf photos, which is exactly what users need to compare against their own plant right now (before any fruit appears).

### What to change in `plant-processor/index.ts`

**Step 1 — Change the API call URL** (line 183):

```
// Before
`https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}&lang=en&include-related-images=false&nb-results=3`

// After
`https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}&lang=en&include-related-images=true&nb-results=3`
```

**Step 2 — Extend the `PlantNetResult` interface** (after line 163):

```typescript
interface PlantNetResult {
  scientificName: string
  commonName: string
  family: string
  score: number
  topCandidates: Array<{ name: string; common: string; score: number }>
  referenceImageUrl: string | null   // ← add this
}
```

**Step 3 — Extract the reference image URL from the API response** (in `identifyWithPlantNet`, after line 207, inside the result construction):

PlantNet returns `results[0].images` — an array of objects with a `url` property that has `m` (medium), `s` (small), `o` (original) size keys. Use `m` (medium thumbnail ~200px wide).

```typescript
const result: PlantNetResult = {
  scientificName: top.species?.scientificNameWithoutAuthor ?? '',
  commonName:     top.species?.commonNames?.[0] ?? '',
  family:         top.species?.family?.scientificNameWithoutAuthor ?? '',
  score:          Math.round((top.score ?? 0) * 100),
  topCandidates:  (data.results ?? []).slice(0, 3).map((r: Record<string, unknown>) => ({
    name:   (r.species as Record<string, unknown>)?.scientificNameWithoutAuthor,
    common: ((r.species as Record<string, unknown>)?.commonNames as string[])?.[0],
    score:  Math.round(((r.score as number) ?? 0) * 100),
  })),
  referenceImageUrl: (top.images as Array<{ url: { m: string } }>)?.[0]?.url?.m ?? null,  // ← add this
}
```

**Step 4 — Store `referenceImageUrl` in the DB update** (Stage 3, inside the `.update({...})` block around line 817):

```typescript
plantnet_reference_image: plantNet?.referenceImageUrl ?? null,
```

**Important:** The PlantNet cache stores the full `PlantNetResult` object as jsonb. Existing cached results won't have `referenceImageUrl` — that's fine. The field will be null for old scans and populated for new ones. No cache invalidation needed.

---

## Change 3 — Gemini Schema: Nutrient Recommendations

### Why

The current `recovery_steps` array produces vague advice ("give a balanced liquid fertiliser"). Cucumbers and other vegetables show specific deficiency patterns (magnesium → interveinal chlorosis, calcium → blossom end rot, iron → yellowing new growth) that warrant named products and DIY recipes. A separate `nutrient_recommendations` field lets us display this distinctly in the Care tab without bloating the Care Recommendations step list.

### Add to `PLANT_ANALYSIS_SCHEMA` in `plant-processor/index.ts`

Inside the `properties` object (after the `plant_classification` block, before the closing `}`):

```typescript
nutrient_recommendations: {
  type: "object",
  nullable: true,
  properties: {
    deficiency_detected: { type: "string", nullable: true },
    deficiency_signs: { type: "string", nullable: true },
    primary_fix: {
      type: "object",
      nullable: true,
      properties: {
        product: { type: "string" },
        recipe: { type: "string" },
        application: { type: "string" }
      }
    },
    organic_option: {
      type: "object",
      nullable: true,
      properties: {
        name: { type: "string" },
        recipe: { type: "string" }
      }
    },
    diy_option: {
      type: "object",
      nullable: true,
      properties: {
        name: { type: "string" },
        recipe: { type: "string" }
      }
    },
    stage_note: { type: "string", nullable: true },
    caution: { type: "string", nullable: true }
  }
},
```

### Add to the Gemini prompt instructions (after instruction 15, before instruction 16)

```
16. NUTRIENT RECOMMENDATIONS: Assess the plant's nutrient status from visual evidence.
    - If a specific deficiency is visible (e.g., interveinal yellowing on older leaves = magnesium;
      yellowing new growth = iron; dark green with purple tinge = phosphorus; soft rotting fruit tips = calcium):
      name the deficiency in deficiency_detected, describe the visual signs in deficiency_signs.
    - primary_fix: the most effective corrective product — name it specifically (e.g., "Epsom salt" not
      "magnesium supplement"), give an exact recipe and application method.
    - organic_option: a widely available organic alternative (e.g., fish emulsion, compost tea, seaweed extract).
    - diy_option: a simple home remedy (e.g., banana peel water, eggshell calcium water).
    - stage_note: if the plant is about to flower or is fruiting, note any fertiliser switch required
      (e.g., "Switch to a low-nitrogen bloom booster once flowers appear to promote fruit set").
    - caution: warn against the most common mistake for this plant/stage.
    - If nutrients look adequate (nutrients vital_sign ≥ 75 and no visible deficiency symptoms), set
      nutrient_recommendations to null.
    - Write all text in ${userLang}.
```

Re-number the old instruction 16 (PLANT CLASSIFICATION) to instruction 17.

### Store in DB update (Stage 3)

```typescript
nutrient_recommendations: result.nutrient_recommendations ?? null,
```

---

## Change 4 — Gemini Schema: Harvest Guide

### Why

For edible plants (vegetables, fruits, culinary herbs), harvest timing is the most important question a home grower has. The app currently provides zero guidance. `plant_classification.is_edible` already tells us when to show it. Gemini knows the species and current growth stage from the photo.

### Add to `PLANT_ANALYSIS_SCHEMA`

Inside the `properties` object (after `nutrient_recommendations`):

```typescript
harvest_guide: {
  type: "object",
  nullable: true,
  properties: {
    days_to_first_harvest: { type: "string", nullable: true },
    current_stage_estimate: { type: "string", nullable: true },
    visual_readiness_cues: { type: "array", items: { type: "string" }, nullable: true },
    check_frequency: { type: "string", nullable: true },
    how_to_harvest: { type: "string", nullable: true },
    post_harvest_tip: { type: "string", nullable: true },
    important_warning: { type: "string", nullable: true }
  }
},
```

### Add to the Gemini prompt instructions (after the nutrient instruction)

```
17. HARVEST GUIDE (only when plant_classification.is_edible = true OR primary_use is
    vegetable / fruit / herb_culinary):
    - days_to_first_harvest: typical range from transplant (e.g., "50–70 days from transplant").
      Use variety-specific knowledge where possible.
    - current_stage_estimate: estimate how far from harvest the plant appears to be based on
      the photo (e.g., "Likely 3–5 weeks away — no fruit forming yet").
    - visual_readiness_cues: 2–4 specific, observable signs the produce is ready to pick
      (e.g., "Cucumber: 6–8 inches long, firm, dark green skin — no yellowing").
    - check_frequency: how often to inspect once fruiting begins.
    - how_to_harvest: the correct technique (cut vs. pull, angle, tool needed).
    - post_harvest_tip: storage and quality note.
    - important_warning: the single most important thing NOT to do
      (e.g., for cucumber: "Never let any fruit turn yellow on the vine — the plant stops
       producing new fruit once it thinks it has seeded").
    - For herbs: harvesting method that encourages regrowth (e.g., "Cut stems above a leaf node").
    - If the plant is NOT edible, set harvest_guide to null.
    - Write all text in ${userLang}.
```

Re-number PLANT CLASSIFICATION to instruction 18.

### Store in DB update (Stage 3)

```typescript
harvest_guide: result.harvest_guide ?? null,
```

---

## Change 5 — ResultsScreen: 3-Tab Layout

### Architecture

```
[Hero Card — always visible]
[PlantNet Reference Image Panel — conditionally below hero]
─────────────────────────────
[ Diagnosis ]  [ Care ]  [ About ]    ← tab bar
─────────────────────────────
[Tab content — only the active tab renders]
─────────────────────────────
[Feedback widget — always visible below tabs]
[Q&A section — always visible below tabs]
```

### Tab contents

**Diagnosis tab** (default):
1. Visual Analysis
2. Vital Signs meters
3. Health Journey (if ≥2 scans)
4. Weather Alert (moved from above hero)

**Care tab**:
1. Care Schedule (water / fertilise / pest intervals + reminder nudge)
2. Care Recommendations (the numbered step list)
3. Nutrient Recommendations card (new — shown when `nutrient_recommendations` is not null)
4. Harvest Guide card (new — shown when `harvest_guide` is not null)
5. Environment (light analysis + seasonal context)
6. Expert Tip (dark green PRO TIP box)

**About tab**:
1. Plant Classification card
2. Safety / Toxicity card
3. Scan History timeline (all scans for this plant)
4. Photo Tip (if present)

### Tab state

Store active tab in local state only — do NOT persist to localStorage. User always lands on Diagnosis. Reset to Diagnosis when `result.id` changes (new scan selected from timeline).

```javascript
const [activeTab, setActiveTab] = useState('diagnosis')

// Reset on scan change (already in the existing useEffect for result.id)
useEffect(() => {
  setLocalResult(result)
  setActiveTab('diagnosis')   // ← add this line
  // ...rest of existing resets
}, [result?.id])
```

### Tab bar styles

Match the existing nav tab style from the top navigation (see DESIGN.md): `--mist` background, `--primary` text, 4px leaf-green dot indicator below active tab. Use three full-width equal columns. Keep it compact — 40px height, `--shadow-xs` bottom border.

```javascript
// Tab config
const TABS = [
  { id: 'diagnosis', label: 'Diagnosis' },
  { id: 'care',      label: 'Care'      },
  { id: 'about',     label: 'About'     },
]
```

### Pest card placement

Pest detection is currently standalone. Move it into the **Diagnosis tab**, after Weather Alert. It's a diagnosis finding, not a care recommendation. (The numbered treatment steps can stay in Care tab as part of Care Recommendations if you prefer separation — designer's call.)

---

## Change 6 — PlantNet Reference Image Panel (frontend)

### Where it renders

Between the hero card and the tab bar. Only shown when `localResult.plantnet_reference_image` is not null.

### What it looks like

A compact horizontal card:

```
┌─────────────────────────────────────────────────────┐
│  [leaf photo]   Reference: Cucumis sativus          │
│   80×80px       This is what PlantNet matched to    │
│   rounded       your plant. Does your plant's       │
│   border        leaf shape look similar?            │
└─────────────────────────────────────────────────────┘
```

- Background: `var(--mist)`, border: `1px solid var(--border)`, radius: `var(--r-md)`
- Image: 80×80px, `border-radius: var(--r-sm)`, `object-fit: cover`
- Label above image: "REFERENCE LEAF" in the same style as `sectionTitle` (11px, uppercase, `var(--text-4)`)
- Scientific name in italic below
- Short prompt text: "Does your plant look like this? If not, tap 👎 below to correct it."

Do NOT show this panel when `AccuracyScore >= 90` — at high confidence, the reference image adds noise, not value. Only show when `AccuracyScore < 90`.

---

## Change 7 — NutrientCard Component (frontend)

Only renders when `localResult.nutrient_recommendations` is not null.

Place it in the **Care tab**, after Care Recommendations.

```
┌──────────────────────────────────────────────┐
│ NUTRIENTS                                    │
│                                              │
│ ⚠️ Magnesium deficiency detected             │  ← amber alert row, only if deficiency_detected
│    Interveinal yellowing on older leaves     │
│                                              │
│ Primary fix                                  │  ← section label
│ Epsom salt — Dissolve 1 tbsp in 1 gallon    │
│ of water. Apply as foliar spray every 2 wks  │
│                                              │
│ 🌿 Organic option                            │
│ Fish emulsion — dilute per label, every 14d  │
│                                              │
│ 🏠 DIY option                                │
│ Banana peel water — soak 2–3 peels in 1L    │
│ for 48h, use as soil drench                  │
│                                              │
│ 💡 Once flowers appear: switch to a low-N   │  ← stage_note
│    bloom booster for better fruit set        │
│                                              │
│ ⚠️ Don't over-fertilise with nitrogen during │  ← caution, amber tinted box
│    flowering — causes leaves, not fruit      │
└──────────────────────────────────────────────┘
```

---

## Change 8 — HarvestGuideCard Component (frontend)

Only renders when `localResult.harvest_guide` is not null AND `localResult.plant_classification?.is_edible === true`.

Place it in the **Care tab**, after the NutrientCard.

```
┌──────────────────────────────────────────────┐
│ 🌽 HARVEST GUIDE                             │
│                                              │
│ Time to first harvest   3–5 weeks away       │  ← two-col grid
│ Typical range           50–70 days           │
│                                              │
│ When it's ready                              │  ← section label
│ ✓ 6–8 inches long                           │
│ ✓ Firm and dark green                        │
│ ✓ No yellowing on the fruit                  │
│                                              │
│ Check every 1–2 days once fruit forms        │  ← check_frequency
│                                              │
│ How to pick                                  │
│ Cut with scissors — don't pull the vine      │
│                                              │
│ After picking                                │
│ Store unwashed in fridge for up to 1 week    │
│                                              │
│ ⚠️ Never let fruit turn yellow on the vine — │  ← important_warning, red-tinted box
│    the plant stops producing when seeded     │
└──────────────────────────────────────────────┘
```

Section title style: same `sectionTitle` as other cards (11px uppercase `var(--text-3)`).
Warning box: same style as `pestWarning` (amber/red tint, `var(--r-sm)` border).

---

## Fetch Query Update (ResultsScreen.jsx and correction poll)

The two places where `plant_logs` is read need to include the new columns:

1. **Correction poll** (`pollRef.current` setInterval, line ~186 in ResultsScreen.jsx) — add to the `.select(...)` string:
   ```
   nutrient_recommendations, harvest_guide, plantnet_reference_image
   ```

2. **Parent component (App.jsx or wherever the result is fetched)** — same three fields added to the select query that loads the result for display.

Also check `HistoryScreen.jsx` / `PlantDetailScreen.jsx` — if they pass scan rows to ResultsScreen, they also need to include the new fields in their queries.

---

## Implementation Order

Do these steps in sequence. Each step is independently deployable.

| Step | What | Deploy where |
|---|---|---|
| 1 | Run `sprint23_results_overhaul.sql` migration | Supabase SQL editor |
| 2 | Update `plant-processor` (PlantNet ref image + Gemini schema) | `npx supabase functions deploy plant-processor --project-ref thgdxffelonamukytosq --no-verify-jwt` |
| 3 | Verify one new scan — check `plantnet_reference_image`, `nutrient_recommendations`, `harvest_guide` are populated in the DB | Supabase table editor |
| 4 | Update `ResultsScreen.jsx` — tab layout + new components | git push → Vercel auto-deploys |
| 5 | Update fetch queries to include new columns | same push |
| 6 | Test on a new cucumber or vegetable scan end to end | Live app |

---

## Edge Cases and Fallbacks

| Scenario | Behaviour |
|---|---|
| PlantNet returns no images for top result | `plantnet_reference_image = null` → reference panel hidden |
| Plant is non-edible (ornamental, succulent) | `harvest_guide = null` → HarvestGuideCard not rendered |
| Nutrients vital sign ≥ 75, no deficiency visible | `nutrient_recommendations = null` → NutrientCard not rendered |
| AccuracyScore ≥ 90 | Reference image panel hidden (high confidence = no need for user verification) |
| Old scan (before Sprint 23) | All three new columns are null → new cards silently absent, tab layout still works |
| Correction re-run | PlantNet is skipped → `plantnet_reference_image` is fetched from existing DB record (no new PlantNet call); nutrient/harvest are regenerated by Gemini |

---

## What Is NOT Changing

- Q&A section — stays below the tabs, always visible
- Identification Feedback (thumbs up/down) — stays below the tabs
- Hero card — no change to layout, just add reference image panel beneath it
- Correction modal — no change
- Re-run skeleton / banner — no change
- AnalysingScreen, HistoryScreen, PlantDetailScreen — not touched in this sprint
- CLAUDE.md — update sprint table and DB schema section after completion
