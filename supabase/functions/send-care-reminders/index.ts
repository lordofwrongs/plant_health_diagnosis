// send-care-reminders — called daily by pg_cron
//
// Setup required (one-time, in Supabase dashboard):
//   1. Add secret: RESEND_API_KEY = <your key from resend.com>
//   2. Enable pg_cron extension: Settings → Extensions → pg_cron
//   3. Schedule in SQL editor:
//      select cron.schedule('botaniq-care-reminders', '0 7 * * *',
//        $$select net.http_post(url:='https://<ref>.supabase.co/functions/v1/send-care-reminders',
//          headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb, body:='{}'::jsonb)$$);
//   4. (Optional) Update the 'from' address once you verify a domain in Resend.
//      Until then, onboarding@resend.dev works for testing (sends only to your own email).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

  if (!RESEND_KEY) {
    console.log('RESEND_API_KEY not configured — skipping')
    return new Response(JSON.stringify({ skipped: 'RESEND_API_KEY not set' }), { status: 200 })
  }

  // Fetch all done scans that have a care schedule
  const { data: plants, error } = await supabase
    .from('plant_logs')
    .select('id, PlantName, plant_nickname, user_id, care_schedule, created_at')
    .eq('status', 'done')
    .not('care_schedule', 'is', null)

  if (error || !plants?.length) {
    return new Response(JSON.stringify({ sent: 0, reason: error?.message ?? 'no plants' }))
  }

  // Filter to plants where watering is due today or overdue
  const now = Date.now()
  const duePlants = plants.filter(p => {
    const days = p.care_schedule?.water_every_days
    if (!days) return false
    const nextWater = new Date(p.created_at).getTime() + Number(days) * 86400000
    return nextWater <= now
  })

  if (!duePlants.length) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no plants due today' }))
  }

  // Get emails from user_profiles for these users
  const userIds = [...new Set(duePlants.map(p => p.user_id))]
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, email, first_name')
    .in('id', userIds)

  const profileMap: Record<string, { email: string; first_name: string | null }> =
    Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  let sent = 0

  for (const userId of userIds) {
    const profile = profileMap[userId]
    if (!profile?.email) continue

    const plants = duePlants.filter(p => p.user_id === userId)
    const name = profile.first_name || 'Gardener'
    const listHtml = plants
      .map(p => `<li style="margin:6px 0">${p.plant_nickname || p.PlantName || 'Your plant'}</li>`)
      .join('')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BotanIQ <onboarding@resend.dev>',
        to: profile.email,
        subject: `${name}, your ${plants.length === 1 ? 'plant needs' : 'plants need'} watering today 💧`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a3a2a">
            <div style="background:#1B4332;padding:24px;border-radius:12px 12px 0 0;text-align:center">
              <span style="font-size:32px">🌿</span>
              <h1 style="color:#fff;font-size:20px;margin:8px 0 0">BotanIQ Garden Reminder</h1>
            </div>
            <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e0e0e0">
              <p style="font-size:16px">Hi ${name},</p>
              <p>The following plants in your garden are due for watering today:</p>
              <ul style="background:#f0fdf4;border-radius:8px;padding:16px 16px 16px 32px">
                ${listHtml}
              </ul>
              <p>Open BotanIQ to view their full care plans and rescan if needed.</p>
              <p style="font-size:12px;color:#888;margin-top:24px">
                BotanIQ — AI plant intelligence for home gardeners<br>
                You're receiving this because you registered your garden.
              </p>
            </div>
          </div>
        `,
      }),
    })

    if (res.ok) sent++
    else {
      const body = await res.text()
      console.error(`Resend failed for ${profile.email}: ${body}`)
    }
  }

  return new Response(JSON.stringify({ sent, checked: duePlants.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
