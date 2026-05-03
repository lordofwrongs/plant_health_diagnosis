import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'
import App from './App.jsx'
import './index.css'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}

if (import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: 'https://us.i.posthog.com',
    ui_host: 'https://us.posthog.com',
    capture_pageview: false,
    autocapture: false,
  })
}

function ErrorFallback() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌿</div>
      <h2 style={{ fontFamily: "'Playfair Display', serif", color: '#1B4332', marginBottom: '8px' }}>
        Something went wrong
      </h2>
      <p style={{ color: '#666', marginBottom: '24px' }}>BotanIQ hit an unexpected error.</p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '10px 28px', background: '#1B4332', color: '#fff', border: 'none', borderRadius: '24px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
      >
        Reload app
      </button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
