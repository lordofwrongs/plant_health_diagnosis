// Frontend structured logger
// Every entry carries a record_id so any upload can be fully replayed from logs.
// Logs are written to the browser console AND kept in sessionStorage for in-tab retrieval.
// To dump all logs for a specific record: logger.getLogsForRecord('<uuid>')

const SESSION_KEY = 'plantcare_session_logs'
const MAX_ENTRIES = 300

function write(level, component, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...meta,
  }

  const line = `[PlantCare/${component}] ${message}`
  if (level === 'error') console.error(line, meta)
  else if (level === 'warn') console.warn(line, meta)
  else console.log(line, meta)

  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]')
    stored.push(entry)
    if (stored.length > MAX_ENTRIES) stored.splice(0, stored.length - MAX_ENTRIES)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored))
  } catch {
    // Ignore storage quota errors — console output is the primary channel
  }
}

export const logger = {
  info:  (component, message, meta) => write('info',  component, message, meta),
  warn:  (component, message, meta) => write('warn',  component, message, meta),
  error: (component, message, meta) => write('error', component, message, meta),

  /** Returns all session logs — paste into a ticket for full trace */
  getLogs: () => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]') }
    catch { return [] }
  },

  /** Returns logs for a specific record_id — the primary triage tool */
  getLogsForRecord: (recordId) => {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]')
        .filter(e => e.record_id === recordId)
    } catch { return [] }
  },

  /** Pretty-print logs for a record — call from browser console: logger.dump('<id>') */
  dump: (recordId) => {
    const entries = recordId
      ? logger.getLogsForRecord(recordId)
      : logger.getLogs()
    console.table(entries)
    return entries
  },
}

// Expose on window in dev only — use Sentry/PostHog for production diagnostics
if (typeof window !== 'undefined' && import.meta.env.DEV) window.__plantLogger = logger
