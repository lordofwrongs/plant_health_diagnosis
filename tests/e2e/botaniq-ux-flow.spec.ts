import { test, expect, type Page } from '@playwright/test';
import {
  setupMockRoutes,
  setupQualityIssueRoutes,
  suppressFirstVisitOverlays,
  mockPushNotifications,
} from '../mocks/route-handlers';
import { TINY_PNG_BASE64, MOCK_TOMATO_RESULT } from '../mocks/plant-mocks';

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Returns a Buffer payload suitable for page.setInputFiles() */
function tinyImageFile(name = 'test-plant.png') {
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  };
}

/**
 * Fills the first upload slot and clicks Analyse.
 * The file inputs are hidden (display:none); setInputFiles bypasses the picker.
 * There are 2 hidden inputs per slot (camera + gallery), nth(1) is the gallery input.
 */
async function uploadAndAnalyse(page: Page) {
  // Slot gallery inputs: positions 1, 3, 5 (camera inputs are 0, 2, 4)
  await page.locator('input[type="file"]').nth(1).setInputFiles(tinyImageFile());
  // Button becomes "Analyse 1 Photo" once a file is selected
  await expect(page.getByRole('button', { name: /Analyse/i })).toBeEnabled({ timeout: 5000 });
  await page.getByRole('button', { name: /Analyse/i }).click();
}

/**
 * Waits for the ResultsScreen to fully load (polls return done, 3 tabs appear).
 * Polling interval in AnalysingScreen is 8 s; allow up to 20 s total.
 */
async function waitForResults(page: Page) {
  // Polling interval is 8 s; allow 30 s to cover geolocation + upload + first poll
  await expect(page.getByRole('tab', { name: 'Diagnosis' })).toBeVisible({ timeout: 30000 });
}

// ─── Test suite ────────────────────────────────────────────────────────────────

test.describe('BotanIQ Regression Suite', () => {

  // ── 1. Upload screen smoke test ─────────────────────────────────────────────
  test('upload screen loads with correct elements', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await page.goto('/');

    await expect(page).toHaveTitle(/BotanIQ/i);
    await expect(page.getByRole('heading', { name: /Know your plant/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analyse Plant' })).toBeDisabled();

    // 3 slots × 2 hidden inputs = 6 file inputs total
    await expect(page.locator('input[type="file"]')).toHaveCount(6);

    // Trust bar items
    await expect(page.getByText('Gemini AI analysis')).toBeVisible();
    await expect(page.getByText('PlantNet botanical ID')).toBeVisible();
  });

  // ── 2. Full happy-path scan ─────────────────────────────────────────────────
  test('full scan flow: upload → analysing → results tabs', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await page.goto('/');

    // Upload and kick off scan
    await uploadAndAnalyse(page);

    // AnalysingScreen — allow 20 s (geolocation + upload + handoff to AnalysingScreen)
    await expect(page.getByRole('heading', { name: 'Analysing your plant' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Uploading image')).toBeVisible();
    await expect(page.getByText('Identifying plant species')).toBeVisible();

    // ResultsScreen — wait for HTTP poll to resolve (~8 s)
    await waitForResults(page);

    // Sprint-23: 3-tab layout
    const tablist = page.getByRole('tablist', { name: 'Results sections' });
    await expect(tablist).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Diagnosis' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Care' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'About' })).toBeVisible();

    // Diagnosis tab is active by default
    await expect(page.getByRole('tab', { name: 'Diagnosis' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(MOCK_TOMATO_RESULT.PlantName)).toBeVisible();
    await expect(page.getByText(MOCK_TOMATO_RESULT.HealthStatus)).toBeVisible();
    await expect(page.getByText('VITAL SIGNS')).toBeVisible();

    // ReferenceImagePanel: AccuracyScore=85 (<90) + plantnet_reference_image is set
    await expect(page.getByText('REFERENCE LEAF')).toBeVisible();
    await expect(page.getByText(/Does your plant.*leaf shape match/i)).toBeVisible();
  });

  // ── 3. Care tab content ─────────────────────────────────────────────────────
  test('Care tab shows nutrient and harvest cards', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await mockPushNotifications(page);
    await page.goto('/');

    await uploadAndAnalyse(page);
    await waitForResults(page);

    await page.getByRole('tab', { name: 'Care' }).click();
    await expect(page.getByRole('tab', { name: 'Care' })).toHaveAttribute('aria-selected', 'true');

    // NutrientCard — visible because vital_signs.nutrients=45 (<75)
    await expect(page.getByText('NUTRIENTS')).toBeVisible();
    await expect(page.getByText('Nitrogen deficiency detected')).toBeVisible();
    await expect(page.getByText('PRIMARY FIX')).toBeVisible();

    // HarvestGuideCard — visible because plant_classification.is_edible=true
    await expect(page.getByText('Harvest Guide')).toBeVisible();
    await expect(page.getByText('Time to harvest')).toBeVisible();

    // Reminder nudge is visible when push is supported and not yet subscribed
    await expect(page.getByRole('button', { name: /Enable watering reminders/i })).toBeVisible();
  });

  // ── 4. About tab content ─────────────────────────────────────────────────────
  test('About tab shows classification and toxicity', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await page.goto('/');

    await uploadAndAnalyse(page);
    await waitForResults(page);

    await page.getByRole('tab', { name: 'About' }).click();
    await expect(page.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true');

    // Plant overview card
    await expect(page.getByRole('heading', { name: 'About This Plant' })).toBeVisible();
    await expect(page.getByText(/fruiting vegetable/i)).toBeVisible();
    // ClassificationCard
    await expect(page.getByRole('heading', { name: 'Plant Classification' })).toBeVisible();
    // Toxicity card — heading is <h3>Safety</h3>
    await expect(page.getByRole('heading', { name: 'Safety' })).toBeVisible();
  });

  // ── 5. Quality gate ─────────────────────────────────────────────────────────
  test('quality gate: shows "Better Photo Needed" on quality_issue status', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupQualityIssueRoutes(page);
    await page.goto('/');

    await uploadAndAnalyse(page);

    await expect(page.getByRole('heading', { name: 'Better Photo Needed' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("We couldn't reliably analyse this image")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retake Photo' })).toBeVisible();

    // Tip box shows the quality issue message from the mock
    await expect(page.getByText(/fill.*frame|60%/i)).toBeVisible();
  });

  // ── 6. Retake photo resets to upload screen ─────────────────────────────────
  test('Retake Photo button returns to upload screen', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupQualityIssueRoutes(page);
    await page.goto('/');

    await uploadAndAnalyse(page);
    await expect(page.getByRole('heading', { name: 'Better Photo Needed' })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'Retake Photo' }).click();
    await expect(page.getByRole('button', { name: 'Analyse Plant' })).toBeVisible({ timeout: 5000 });
  });

  // ── 7. Garden navigation ────────────────────────────────────────────────────
  test('Garden tab shows plant card after scan', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await page.goto('/');

    // Navigate to Garden via nav tab (it's a <button>, not a <link>)
    await page.getByRole('button', { name: 'Garden' }).click();

    // Mock returns MOCK_TOMATO_RESULT for the history list
    await expect(page.getByText('My Garden')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(MOCK_TOMATO_RESULT.PlantName)).toBeVisible({ timeout: 5000 });
  });

  // ── 8. New Scan button resets to upload ─────────────────────────────────────
  test('+ New Scan from results returns to upload screen', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await page.goto('/');

    await uploadAndAnalyse(page);
    await waitForResults(page);

    await page.getByRole('button', { name: '+ New Scan' }).click();
    await expect(page.getByRole('button', { name: 'Analyse Plant' })).toBeVisible({ timeout: 5000 });
  });

  // ── 9. Feedback widget ───────────────────────────────────────────────────────
  test('feedback widget is visible on results screen', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await page.goto('/');

    await uploadAndAnalyse(page);
    await waitForResults(page);

    await expect(page.getByText('Was this identification correct?')).toBeVisible();
    await expect(page.getByRole('button', { name: /Looks right/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Wrong plant/i })).toBeVisible();
  });

  // ── 10. Q&A section is accessible ───────────────────────────────────────────
  test('Q&A section is present on results screen', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await page.goto('/');

    await uploadAndAnalyse(page);
    await waitForResults(page);

    // Q&A is a collapsible section (qaOpen=false by default) — click header to expand
    const qaHeader = page.getByRole('button', { name: /Ask a follow-up question/i });
    await expect(qaHeader).toBeVisible();
    await qaHeader.click();
    await expect(page.getByPlaceholder('Ask a care question...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask →' })).toBeVisible();
  });

  // ── 11. Support modal ────────────────────────────────────────────────────────
  test('support modal opens and closes', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Contact support' }).click();
    // SupportModal uses a div overlay — check for the modal heading
    await expect(page.getByRole('heading', { name: 'Get support' })).toBeVisible({ timeout: 3000 });
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();

    // Close by clicking the overlay backdrop (the outer div has onClick={onClose})
    await page.mouse.click(10, 10);
    await expect(page.getByRole('heading', { name: 'Get support' })).not.toBeVisible({ timeout: 3000 });
  });

  // ── 12. Multiple photos: button label updates ────────────────────────────────
  test('analyse button label reflects photo count', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await page.goto('/');

    // One photo
    await page.locator('input[type="file"]').nth(1).setInputFiles(tinyImageFile('whole.png'));
    await expect(page.getByRole('button', { name: 'Analyse 1 Photo' })).toBeVisible({ timeout: 5000 });

    // Two photos
    await page.locator('input[type="file"]').nth(3).setInputFiles(tinyImageFile('leaf.png'));
    await expect(page.getByRole('button', { name: 'Analyse 2 Photos' })).toBeVisible({ timeout: 3000 });
  });

  // ── 13. Reminder subscribe flow ──────────────────────────────────────────────
  test('Enable watering reminders button subscribes and shows confirmation', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await mockPushNotifications(page);  // not yet subscribed
    await page.goto('/');

    await uploadAndAnalyse(page);
    await waitForResults(page);

    await page.getByRole('tab', { name: 'Care' }).click();

    // Button visible before subscribing
    const btn = page.getByRole('button', { name: /Enable watering reminders/i });
    await expect(btn).toBeVisible();
    await btn.click();

    // After subscribing, confirmation message replaces the button
    await expect(page.getByText(/8am when watering is due/i)).toBeVisible({ timeout: 5000 });
    await expect(btn).not.toBeVisible();
  });

  // ── 14. Reminder already on — shows status instead of button ────────────────
  test('Already-subscribed state shows reminders-on status, not button', async ({ page }) => {
    await suppressFirstVisitOverlays(page);
    await setupMockRoutes(page);
    await mockPushNotifications(page, { alreadySubscribed: true });
    await page.goto('/');

    await uploadAndAnalyse(page);
    await waitForResults(page);

    await page.getByRole('tab', { name: 'Care' }).click();

    await expect(page.getByText(/Watering reminders on/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Enable watering reminders/i })).not.toBeVisible();
  });

});
