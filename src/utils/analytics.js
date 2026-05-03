import posthog from 'posthog-js'

export function track(event, props = {}) {
  try { posthog.capture(event, props) } catch {}
}

export function identify(userId, traits = {}) {
  try { posthog.identify(userId, traits) } catch {}
}
