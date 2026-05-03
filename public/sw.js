// BotanIQ service worker — Sprint 9
// Strategy:
//   Navigation (HTML):  network-first, fall back to cached shell or inline offline page
//   Static assets:      cache-first (Vite adds content hashes so stale entries never break)
//   API / AI / DB:      always bypass — never cache external API calls

const CACHE = 'botaniq-v1'

const API_HOSTS = [
  'supabase.co',
  'googleapis.com',
  'plantnet.org',
  'ipapi.co',
  'open-meteo.com',
  'resend.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]

function isApiRequest(url) {
  return API_HOSTS.some(h => url.includes(h))
}

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#1B4332" />
  <title>BotanIQ — Offline</title>
  <style>
    body { font-family: -apple-system, sans-serif; text-align: center; padding: 80px 24px;
           background: #f0fdf4; color: #1B4332; }
    h2   { font-size: 24px; margin-bottom: 12px; }
    p    { font-size: 15px; color: #52B788; line-height: 1.6; }
    .leaf { font-size: 56px; margin-bottom: 24px; display: block; }
  </style>
</head>
<body>
  <span class="leaf">🌿</span>
  <h2>You're offline</h2>
  <p>BotanIQ needs a connection to identify plants and diagnose health.<br />
     Your garden history will be here when you're back online.</p>
</body>
</html>`

self.addEventListener('install', () => self.skipWaiting())

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json?.() ?? {}
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'BotanIQ', {
      body: data.body ?? 'Care reminder for your plant',
      icon: data.icon ?? '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? '/' },
      tag: data.tag ?? 'care-reminder',
      requireInteraction: false,
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin) && 'focus' in c)
      if (existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (isApiRequest(e.request.url)) return

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      if (e.request.mode === 'navigate') {
        try {
          const fresh = await fetch(e.request)
          cache.put(e.request, fresh.clone())
          return fresh
        } catch {
          const cached = await cache.match(e.request)
          return cached || new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html' },
          })
        }
      }

      const cached = await cache.match(e.request)
      if (cached) return cached

      try {
        const fresh = await fetch(e.request)
        if (fresh.ok) cache.put(e.request, fresh.clone())
        return fresh
      } catch {
        return new Response('Offline', { status: 503 })
      }
    })
  )
})
