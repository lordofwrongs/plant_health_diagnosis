/** Mock data matching the actual plant_logs DB schema from CLAUDE.md */

export const TEST_LOG_ID = 'test-uuid-1234-5678-abcd';

export const MOCK_TOMATO_RESULT = {
  id: TEST_LOG_ID,
  status: 'done',
  user_id: 'guest_test-user',
  image_url: 'https://thgdxffelonamukytosq.supabase.co/storage/v1/object/public/plant_images/test-tomato.jpg',
  additional_images: [],
  PlantName: 'Tomato',
  ScientificName: 'Solanum lycopersicum',
  AccuracyScore: 85,           // < 90 so ReferenceImagePanel renders
  HealthStatus: 'Mildly Stressed',
  CareInstructions: [
    { title: 'Watering', description: 'Water deeply every 2 days.' },
    { title: 'Fertilising', description: 'Apply balanced fertiliser monthly.' },
  ],
  care_schedule: {
    water_every_days: 2,
    fertilise_every_days: 30,
    check_pests_every_days: 7,
    notes: 'Check undersides of leaves for pests weekly.',
  },
  vital_signs: {
    hydration: 80,
    light: 90,
    nutrients: 45,   // < 75 so NutrientCard renders
    pest_risk: 10,
  },
  plant_classification: {
    primary_use: 'vegetable',
    is_edible: true,
    edible_parts: ['Fruit'],
    edibility_notes: 'Rich in lycopene and vitamin C.',
    is_weed: false,
    weed_action: null,
    cultivation_status: 'cultivated',
  },
  // Matches actual DB schema: deficiency_detected, deficiency_signs, primary_fix, organic_option, diy_option
  nutrient_recommendations: {
    deficiency_detected: 'Nitrogen',
    deficiency_signs: 'Yellowing of older leaves, stunted growth.',
    primary_fix: 'Apply a balanced liquid fertiliser (10-10-10).',
    organic_option: 'Blood meal or diluted compost tea.',
    diy_option: 'Steep 1 part compost in 5 parts water for 3 days.',
    stage_note: 'Crucial during early vegetative growth.',
    caution: 'Avoid getting high-nitrogen fertiliser on leaves to prevent burn.',
  },
  // Matches actual DB schema: days_to_first_harvest, current_stage_estimate, visual_readiness_cues
  harvest_guide: {
    days_to_first_harvest: '60–80 days from transplant',
    current_stage_estimate: 'Fruiting — mid stage',
    visual_readiness_cues: ['Fruit turns deep red', 'Slightly soft to touch', 'Stem starts to brown'],
    check_frequency: 'Every 2–3 days once fruit begins to colour',
    how_to_harvest: 'Twist gently or use clean shears at the stem junction.',
    post_harvest_tip: 'Store at room temperature; refrigeration reduces flavour.',
    important_warning: 'Unripe green tomatoes contain higher solanine levels.',
  },
  plantnet_reference_image: 'https://bs.plantnet.org/image/o/test-reference-leaf.jpg',
  growth_milestones: {
    narrative: 'Your tomato has grown significantly since the last scan and is now starting to develop fruit.',
  },
  pest_detected: false,
  pest_name: null,
  pest_treatment: null,
  toxicity: {
    risk_cats: 'Moderate',
    risk_dogs: 'Moderate',
    risk_humans: 'Low',
    notes: 'Leaves and stems contain solanine; fruit is safe when ripe.',
  },
  light_intensity_analysis: 'Currently receiving adequate direct sunlight (6–8 hours/day).',
  seasonal_context: 'Mid-season growth period. Ensure consistent watering as temperatures rise.',
  plantnet_candidates: [
    { name: 'Solanum lycopersicum', common: 'Tomato', score: 0.88 },
  ],
  created_at: new Date().toISOString(),
  error_details: null,
};

export const MOCK_HISTORY_RESULT = MOCK_TOMATO_RESULT;

/** Returns a minimal polling status response */
export const MOCK_POLL_STATUS = (status: 'pending' | 'processing' | 'done' | 'error' | 'quality_issue', errorDetails?: string) => ({
  status,
  error_details: errorDetails ?? null,
});

/** A 1×1 white PNG encoded as base64 — smallest valid image for upload slots */
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
