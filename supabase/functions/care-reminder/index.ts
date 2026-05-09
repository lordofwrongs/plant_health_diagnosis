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

// FIX-08: Process subscriptions in batches to prevent OOM at scale
const BATCH_SIZE = 100

Deno.serve(async () => {
  // FIX-16: Auth is enforced at the Supabase infrastructure layer (deployed without --no-verify-jwt).
  // pg_cron sends the service-role JWT; any other caller is rejected before reaching here.

  const today = new Date()
  const staleEndpoints: string[] = []
  let sentCount = 0
  let offset = 0

  while (true) {
    // ── 1. Load next batch of subscriptions ───────────────────────────────────
    const { data: batch } = await supabase
      .from('push_subscriptions')
      .select('*')
      .range(offset, offset + BATCH_SIZE - 1)

    if (!batch?.length) break

    // Filter to subscriptions whose local time is in the 8am delivery window
    const eligible = batch.filter((s: { timezone: string }) => isDeliveryHour(s.timezone))

    if (eligible.length) {
      const eligibleUserIds = [...new Set(eligible.map((s: { user_id: string }) => s.user_id))]

      // ── 2. Load mutes for eligible users in this batch ─────────────────────
      const { data: mutes } = await supabase
        .from('push_mutes')
        .select('user_id, plant_name')
        .in('user_id', eligibleUserIds)

      const muteSet = new Set(
        (mutes ?? []).map((m: { user_id: string; plant_name: string }) => `${m.user_id}::${m.plant_name}`)
      )

      // ── 3. Load latest done scans with care schedules for eligible users ────
      const { data: logs } = await supabase
        .from('plant_logs')
        .select('id, user_id, PlantName, plant_nickname, care_schedule, created_at')
        .eq('status', 'done')
        .not('care_schedule', 'is', null)
        .in('user_id', eligibleUserIds)
        .order('created_at', { ascending: false })

      if (logs?.length) {
        // ── 4. Load last watered actions for eligible users ─────────────────
        const { data: careActions } = await supabase
          .from('plant_care_actions')
          .select('user_id, plant_name, actioned_at')
          .eq('action_type', 'watered')
          .in('user_id', eligibleUserIds)
          .order('actioned_at', { ascending: false })

        const lastWatered: Record<string, Date> = {}
        for (const action of (careActions ?? [])) {
          const key = `${action.user_id}::${action.plant_name}`
          if (!lastWatered[key]) lastWatered[key] = new Date(action.actioned_at)
        }

        // ── 5. Deduplicate: latest scan per (user_id, plant identity) ───────
        const latestPerPlant: Record<string, typeof logs[0]> = {}
        for (const log of logs) {
          const identity = log.plant_nickname || log.PlantName || ''
          if (!identity) continue
          const key = `${log.user_id}::${identity}`
          if (!latestPerPlant[key]) latestPerPlant[key] = log
        }

        // ── 6. Group subscriptions by user_id ────────────────────────────────
        const subsByUser: Record<string, typeof eligible> = {}
        for (const sub of eligible) {
          if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = []
          subsByUser[sub.user_id].push(sub)
        }

        // ── 7. Send notifications for this batch ─────────────────────────────
        await Promise.all(
          Object.entries(subsByUser).map(async ([userId, subs]) => {
            const userPlants = Object.values(latestPerPlant).filter(l => l.user_id === userId)

            const due = userPlants.filter(log => {
              const identity = log.plant_nickname || log.PlantName || ''
              if (muteSet.has(`${userId}::${identity}`)) return false
              const waterDays = log.care_schedule?.water_every_days
              if (!waterDays) return false
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
      }
    }

    offset += BATCH_SIZE
    if (batch.length < BATCH_SIZE) break
  }

  // ── 8. Process pest follow-up reminders ────────────────────────────────────
  // Reads follow_up_reminders rows inserted by plant-processor when pest_detected=true.
  // Sends once regardless of delivery window (7-day reminders are not daily nudges).
  let followUpSent = 0
  const { data: dueReminders } = await supabase
    .from('follow_up_reminders')
    .select('id, user_id, message')
    .lte('remind_at', new Date().toISOString())
    .eq('processed', false)
    .limit(200)

  if (dueReminders?.length) {
    const reminderUserIds = [...new Set(dueReminders.map((r: { user_id: string }) => r.user_id))]

    const { data: reminderSubs } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth_key')
      .in('user_id', reminderUserIds)

    const reminderSubsByUser: Record<string, { endpoint: string; p256dh: string; auth_key: string }[]> = {}
    for (const sub of (reminderSubs ?? [])) {
      if (!reminderSubsByUser[sub.user_id]) reminderSubsByUser[sub.user_id] = []
      reminderSubsByUser[sub.user_id].push(sub)
    }

    const processedIds: string[] = []

    await Promise.all(
      dueReminders.map(async (reminder: { id: string; user_id: string; message: string }) => {
        const subs = reminderSubsByUser[reminder.user_id]
        if (subs?.length) {
          const payload = JSON.stringify({
            title: '🔍 Pest follow-up',
            body: reminder.message,
            icon: '/icons/icon-192.png',
            url: '/',
            tag: `pest-followup-${reminder.id}`,
          })
          await Promise.all(
            subs.map((sub) =>
              webpush
                .sendNotification(
                  { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
                  payload
                )
                .then(() => { sentCount++; followUpSent++ })
                .catch((err: { statusCode?: number }) => {
                  if (err.statusCode === 410) staleEndpoints.push(sub.endpoint)
                })
            )
          )
        }
        // Mark processed whether or not the user has a push subscription —
        // avoids re-querying indefinitely for users who never opted in.
        processedIds.push(reminder.id)
      })
    )

    if (processedIds.length) {
      await supabase
        .from('follow_up_reminders')
        .update({ processed: true })
        .in('id', processedIds)
    }
  }

  // ── 9. Remove expired subscriptions ────────────────────────────────────────
  if (staleEndpoints.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return new Response(
    JSON.stringify({ ok: true, sent: sentCount, followUpSent, cleaned: staleEndpoints.length }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
