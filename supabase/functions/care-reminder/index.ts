import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore npm specifier — Supabase Deno runtime supports npm:
import webpush from 'npm:web-push'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

// Returns true when the current UTC time is in the 8am hour for the given IANA timezone
function isDeliveryHour(timezone: string): boolean {
  try {
    const hour = parseInt(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(new Date()),
      10
    )
    return hour === 8
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  // Only accept calls from pg_cron (Bearer token)
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  // ── 1. Load all push subscriptions ────────────────────────────────────────
  const { data: subscriptions } = await supabase.from('push_subscriptions').select('*')
  if (!subscriptions?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  // Filter to subscriptions whose local time is in the 8am delivery window
  const eligible = subscriptions.filter(s => isDeliveryHour(s.timezone))
  if (!eligible.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no eligible timezones this hour' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const eligibleUserIds = [...new Set(eligible.map((s: { user_id: string }) => s.user_id))]

  // ── 2. Load mutes for eligible users ──────────────────────────────────────
  const { data: mutes } = await supabase
    .from('push_mutes')
    .select('user_id, plant_name')
    .in('user_id', eligibleUserIds)

  const muteSet = new Set((mutes ?? []).map((m: { user_id: string; plant_name: string }) => `${m.user_id}::${m.plant_name}`))

  // ── 3. Load latest done scans with care schedules ─────────────────────────
  const { data: logs } = await supabase
    .from('plant_logs')
    .select('id, user_id, PlantName, plant_nickname, care_schedule, created_at')
    .eq('status', 'done')
    .not('care_schedule', 'is', null)
    .in('user_id', eligibleUserIds)
    .order('created_at', { ascending: false })

  if (!logs?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no plant data' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 4. Load last watered actions ──────────────────────────────────────────
  const { data: careActions } = await supabase
    .from('plant_care_actions')
    .select('user_id, plant_name, actioned_at')
    .eq('action_type', 'watered')
    .in('user_id', eligibleUserIds)
    .order('actioned_at', { ascending: false })

  // Index: "user_id::plantIdentity" → latest watered Date
  const lastWatered: Record<string, Date> = {}
  for (const action of (careActions ?? [])) {
    const key = `${action.user_id}::${action.plant_name}`
    if (!lastWatered[key]) lastWatered[key] = new Date(action.actioned_at)
  }

  // ── 5. Deduplicate logs: latest per (user_id, plant identity) ─────────────
  const latestPerPlant: Record<string, typeof logs[0]> = {}
  for (const log of logs) {
    const identity = log.plant_nickname || log.PlantName || ''
    if (!identity) continue
    const key = `${log.user_id}::${identity}`
    if (!latestPerPlant[key]) latestPerPlant[key] = log
  }

  // ── 6. Group subscriptions by user_id ─────────────────────────────────────
  const subsByUser: Record<string, typeof eligible> = {}
  for (const sub of eligible) {
    if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = []
    subsByUser[sub.user_id].push(sub)
  }

  const today = new Date()
  const staleEndpoints: string[] = []
  let sentCount = 0

  // ── 7. Send notifications ─────────────────────────────────────────────────
  await Promise.all(
    Object.entries(subsByUser).map(async ([userId, subs]) => {
      const userPlants = Object.values(latestPerPlant).filter(l => l.user_id === userId)

      const due = userPlants.filter(log => {
        const identity = log.plant_nickname || log.PlantName || ''
        if (muteSet.has(`${userId}::${identity}`)) return false
        const waterDays = log.care_schedule?.water_every_days
        if (!waterDays) return false
        // Use last explicitly-watered date if available, else fall back to scan date
        const baseDate = lastWatered[`${userId}::${identity}`] ?? new Date(log.created_at)
        const daysSince = (today.getTime() - baseDate.getTime()) / 86400000
        return daysSince >= waterDays
      })

      if (!due.length) return

      await Promise.all(
        due.flatMap(log => {
          const identity = log.plant_nickname || log.PlantName || 'your plant'
          const payload = JSON.stringify({
            title: `Time to water ${identity}`,
            body: `${identity} is due for watering today.`,
            icon: '/icons/icon-192.png',
            url: '/',
            tag: `water-${userId}-${identity}`,
          })

          return subs.map((sub: { endpoint: string; p256dh: string; auth_key: string }) =>
            webpush
              .sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
                payload
              )
              .then(() => { sentCount++ })
              .catch((err: { statusCode?: number }) => {
                if (err.statusCode === 410) staleEndpoints.push(sub.endpoint)
              })
          )
        })
      )
    })
  )

  // ── 8. Remove expired subscriptions ──────────────────────────────────────
  if (staleEndpoints.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return new Response(
    JSON.stringify({ ok: true, sent: sentCount, cleaned: staleEndpoints.length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
