import type { Page } from '@playwright/test';
import { MOCK_TOMATO_RESULT, MOCK_POLL_STATUS, TEST_LOG_ID } from './plant-mocks';

const SUPABASE_URL = 'https://thgdxffelonamukytosq.supabase.co';

/**
 * Registers all Supabase + external API route mocks needed for a full scan flow.
 * Call this before navigating to the page.
 *
 * Override individual handlers by registering your own `page.route()` calls
 * BEFORE calling this function (Playwright uses first-match ordering).
 */
export async function setupMockRoutes(page: Page) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  // Return no session so the app runs in guest mode (no RegisterModal race)
  await page.route(`${SUPABASE_URL}/auth/v1/session`, (route) =>
    route.fulfill({ status: 200, json: null })
  );
  await page.route(`${SUPABASE_URL}/auth/v1/**`, (route) =>
    route.fulfill({ status: 200, json: null })
  );

  // ── External location API ─────────────────────────────────────────────────
  await page.route('https://ipapi.co/**', (route) =>
    route.fulfill({
      json: { city: 'Bangalore', country_name: 'India', latitude: 12.97, longitude: 77.59 },
    })
  );

  // ── RPC: total scan count shown on upload screen trust bar ────────────────
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/get_total_scans`, (route) =>
    route.fulfill({ json: 4729 })
  );

  // ── Storage: accept any image upload, return a dummy storage key ──────────
  await page.route(`${SUPABASE_URL}/storage/v1/object/**`, (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: { Key: 'plant_images/test-upload.jpg' } });
    }
    return route.continue();
  });

  // ── plant_logs REST endpoint ──────────────────────────────────────────────
  await page.route(`${SUPABASE_URL}/rest/v1/plant_logs**`, (route) => {
    const method  = route.request().method();
    const url     = route.request().url();
    const headers = route.request().headers();
    // Supabase .single() sends this Accept header
    const isSingle = (headers['accept'] ?? '').includes('pgrst.object');

    // INSERT (upload screen creates the plant_log record)
    if (method === 'POST') {
      return route.fulfill({ json: isSingle ? { id: TEST_LOG_ID } : [{ id: TEST_LOG_ID }] });
    }

    // Polling: select=status%2Cerror_details  (or select=status,error_details)
    if (url.includes('select=status') || url.includes('select=status%2Cerror_details')) {
      return route.fulfill({
        json: isSingle ? MOCK_POLL_STATUS('done') : [MOCK_POLL_STATUS('done')],
      });
    }

    // Full record fetch after done: id=eq.<log-id>
    if (url.includes(`id=eq.${TEST_LOG_ID}`)) {
      return route.fulfill({
        json: isSingle ? MOCK_TOMATO_RESULT : [MOCK_TOMATO_RESULT],
      });
    }

    // History / garden list fetch: user_id=eq.*
    if (url.includes('user_id=eq.') || url.includes('order=created_at')) {
      return route.fulfill({ json: [MOCK_TOMATO_RESULT] });
    }

    // Default fallback: empty result
    return route.fulfill({ json: isSingle ? null : [] });
  });
}

/**
 * Same as setupMockRoutes but the polling response returns quality_issue.
 * Use this to test the "Better Photo Needed" error flow.
 */
export async function setupQualityIssueRoutes(page: Page) {
  await setupMockRoutes(page);

  // Override polling to return quality_issue
  await page.route(`${SUPABASE_URL}/rest/v1/plant_logs**`, (route) => {
    const method  = route.request().method();
    const url     = route.request().url();
    const headers = route.request().headers();
    const isSingle = (headers['accept'] ?? '').includes('pgrst.object');

    if (method === 'POST') {
      return route.fulfill({ json: isSingle ? { id: TEST_LOG_ID } : [{ id: TEST_LOG_ID }] });
    }
    if (url.includes('select=status')) {
      const payload = MOCK_POLL_STATUS('quality_issue', 'Make sure the plant fills at least 60% of the frame and is in focus.');
      return route.fulfill({ json: isSingle ? payload : [payload] });
    }
    return route.fulfill({ json: isSingle ? null : [] });
  });
}

/**
 * Injects localStorage keys that suppress first-visit UI overlays so
 * tests can focus on the feature under test rather than dismissing modals.
 */
export async function suppressFirstVisitOverlays(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('botaniq_onboarding_done', '1');
    localStorage.setItem('botaniq_first_scan', 'done');
    localStorage.setItem('botaniq_registered', 'true');
    if (!localStorage.getItem('plant_care_guest_id')) {
      localStorage.setItem('plant_care_guest_id', 'guest_test-user-id');
    }
  });
}
