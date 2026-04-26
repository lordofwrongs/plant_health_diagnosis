import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
    // Shorter heartbeat keeps the WebSocket alive through mobile network idle timeouts.
    // Without this, aggressive NAT/firewalls on mobile data silently drop the socket,
    // causing the analysing screen to spin forever waiting for an update that never arrives.
    heartbeatIntervalMs: 15000,
    // Exponential back-off capped at 10s — recovers quickly after brief network drops
    // without hammering the server on a sustained outage.
    reconnectAfterMs: (tries) => Math.min(tries * 1500, 10000),
  },
})
