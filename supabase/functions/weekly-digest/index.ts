import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'BotanIQ <botaniqsupport@gmail.com>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://plant-health-diagnosis.vercel.app'
const UNSUBSCRIBE_SECRET = Deno.env.get('UNSUBSCRIBE_SECRET') ?? ''

// ── HMAC-SHA256 helpers for tamper-proof unsubscribe links ──────────────────
// Signs the user_id so the unsubscribe URL can't be used to opt-out arbitrary users.
async function hmacSign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(UNSUBSCRIBE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacVerify(data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(data)
  if (expected.length !== signature.length) return false
  // Constant-time comparison prevents timing attacks
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

async function signedUnsubscribeUrl(userId: string): Promise<string> {
  const sig = await hmacSign(userId)
  const base = Deno.env.get('SUPABASE_URL')!
  return `${base}/functions/v1/weekly-digest?action=unsubscribe&user_id=${encodeURIComponent(userId)}&sig=${sig}`
}

function unsubscribeHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Unsubscribed — BotanIQ</title>
  <style>
    body { margin: 0; font-family: 'DM Sans', sans-serif; background: #f0fdf4; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 40px 32px; max-width: 400px; text-align: center; box-shadow: 0 4px 24px rgba(27,67,50,0.08); }
    h1 { color: #1B4332; font-size: 22px; margin: 0 0 12px; }
    p { color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px; }
    a { display: inline-block; background: #1B4332; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 100px; font-size: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>You're unsubscribed 🌿</h1>
    <p>You won't receive weekly BotanIQ garden updates anymore. Your plants are still waiting for you.</p>
    <a href="${APP_URL}">Back to my garden</a>
  </div>
</body>
</html>`
}

function buildEmailHtml(
  user: { id: string; first_name: string | null; email: string },
  plants: Array<{
    identity: string
    PlantName: string
    HealthStatus: string | null
    waterStatus: string | null
    pest_detected: boolean | null
    pest_name: string | null
  }>,
  unsubscribeLink: string
): string {
  const greeting = user.first_name ? `Hi ${user.first_name}` : 'Hi there'

  const plantRows = plants.map(p => {
    const health = p.HealthStatus ?? 'Unknown'
    const healthColor =
      health.toLowerCase().includes('healthy') ? '#0D9488' :
      health.toLowerCase().includes('critical') || health.toLowerCase().includes('severe') ? '#DC2626' :
      '#D97706'

    const pestAlert = p.pest_detected && p.pest_name
      ? `<tr><td style="padding: 0 0 8px 20px; font-size: 13px; color: #DC2626;">⚠️ Pest alert: ${p.pest_name}</td></tr>`
      : ''

    const waterRow = p.waterStatus
      ? `<tr><td style="padding: 0 0 6px 20px; font-size: 13px; color: #0369a1;">💧 ${p.waterStatus}</td></tr>`
      : ''

    return `
      <tr>
        <td style="padding: 16px; background: #f9fafb; border-radius: 10px; border: 1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding: 0 0 4px 0; font-size: 16px; font-weight: 700; color: #111827;">${p.identity}</td>
              <td style="text-align: right;">
                <span style="display: inline-block; background: ${healthColor}22; color: ${healthColor}; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 100px;">${health}</span>
              </td>
            </tr>
            ${waterRow}
            ${pestAlert}
          </table>
        </td>
      </tr>
      <tr><td style="height: 10px;"></td></tr>`
  }).join('')

  const subject = plants.length === 1
    ? `Your ${plants[0].identity} update`
    : `Your ${plants.length} plants this week`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:#1B4332;border-radius:14px 14px 0 0;padding:28px 32px 24px;">
              <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;">
                Botan<em style="color:#52B788;font-style:italic;">IQ</em>
              </p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.7);">Your weekly garden update</p>
            </td>
          </tr>
          <tr>
            <td style="background:#fff;padding:28px 32px;border-radius:0 0 14px 14px;border:1px solid #e5e7eb;border-top:none;">
              <p style="margin:0 0 20px;font-size:16px;color:#111827;">${greeting},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
                Here's how your garden is doing this week.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${plantRows}
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td align="center">
                    <a href="${APP_URL}"
                       style="display:inline-block;background:#1B4332;color:#fff;text-decoration:none;padding:12px 28px;border-radius:100px;font-size:14px;font-weight:700;">
                      Open my garden →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                You're receiving this because you have a BotanIQ account.<br>
                <a href="${unsubscribeLink}" style="color:#9ca3af;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── Unsubscribe (GET) ───────────────────────────────────────────────────────
  if (req.method === 'GET' && url.searchParams.get('action') === 'unsubscribe') {
    const userId = url.searchParams.get('user_id')
    const sig    = url.searchParams.get('sig')
    if (!userId || !sig) return new Response('Missing parameters', { status: 400 })
    if (!UNSUBSCRIBE_SECRET) return new Response('Unsubscribe not configured', { status: 503 })

    const valid = await hmacVerify(userId, sig)
    if (!valid) return new Response('Invalid or expired unsubscribe link', { status: 403 })

    const { error } = await supabase
      .from('users')
      .update({ email_digest_opt_out: true })
      .eq('id', userId)

    if (error) {
      console.error('Unsubscribe failed:', error.message)
      return new Response('Error updating preference', { status: 500 })
    }
    return new Response(unsubscribeHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // ── Cron trigger (Bearer auth) ──────────────────────────────────────────────
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 })

  // ── 1. Load registered users with email who haven't opted out ──────────────
  // plant_logs links to users via guest_id, not the auth user id
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, email, first_name, guest_id')
    .eq('email_digest_opt_out', false)
    .not('email', 'is', null)
    .neq('email', '')

  if (usersErr) {
    return new Response(JSON.stringify({ ok: false, error: usersErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!users?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no eligible users' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Scans are stored under guest_id, not the auth user id
  const guestIds = users.map(u => u.guest_id).filter(Boolean)

  if (!guestIds.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no guest ids found' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 2. Load done scans for these guest ids ─────────────────────────────────
  const { data: logs } = await supabase
    .from('plant_logs')
    .select('id, user_id, PlantName, plant_nickname, HealthStatus, care_schedule, pest_detected, pest_name, created_at')
    .eq('status', 'done')
    .in('user_id', guestIds)
    .order('created_at', { ascending: false })

  // ── 3. Load last-watered care actions ──────────────────────────────────────
  const { data: careActions } = await supabase
    .from('plant_care_actions')
    .select('user_id, plant_name, actioned_at')
    .eq('action_type', 'watered')
    .in('user_id', guestIds)
    .order('actioned_at', { ascending: false })

  const lastWatered: Record<string, Date> = {}
  for (const action of (careActions ?? [])) {
    const key = `${action.user_id}::${action.plant_name}`
    if (!lastWatered[key]) lastWatered[key] = new Date(action.actioned_at)
  }

  // ── 4. Deduplicate: latest scan per (guest_id, plant identity) ─────────────
  const latestPerPlant: Record<string, NonNullable<typeof logs>[0]> = {}
  for (const log of (logs ?? [])) {
    const identity = (log.plant_nickname || log.PlantName || '').trim()
    if (!identity) continue
    const key = `${log.user_id}::${identity}`
    if (!latestPerPlant[key]) latestPerPlant[key] = log
  }

  const today = new Date()
  let sentCount = 0
  const errors: string[] = []

  const fromMatch = FROM_EMAIL.match(/^(.+?)\s*<(.+?)>$/)
  const senderName = fromMatch ? fromMatch[1].trim() : 'BotanIQ'
  const senderEmail = fromMatch ? fromMatch[2].trim() : FROM_EMAIL

  // ── 5. Send one email per user ─────────────────────────────────────────────
  await Promise.all(users.map(async (user) => {
    // Match scans by guest_id (how plant_logs stores the user reference)
    const userPlants = Object.values(latestPerPlant)
      .filter(l => l.user_id === user.guest_id)
      .map(log => {
        const identity = (log.plant_nickname || log.PlantName || '').trim()
        const waterDays = log.care_schedule?.water_every_days
        let waterStatus: string | null = null
        if (waterDays) {
          const baseDate = lastWatered[`${user.guest_id}::${identity}`] ?? new Date(log.created_at)
          const nextMs = baseDate.getTime() + waterDays * 86_400_000
          const days = Math.ceil((nextMs - today.getTime()) / 86_400_000)
          waterStatus = days <= 0 ? 'Water today!' : days === 1 ? 'Water tomorrow' : `Water in ${days} days`
        }
        return {
          identity,
          PlantName: log.PlantName ?? '',
          HealthStatus: log.HealthStatus,
          waterStatus,
          pest_detected: log.pest_detected,
          pest_name: log.pest_name,
        }
      })

    if (!userPlants.length) return

    const unsubscribeLink = await signedUnsubscribeUrl(user.id)
    const html = buildEmailHtml(user, userPlants, unsubscribeLink)
    const subject = userPlants.length === 1
      ? `Your ${userPlants[0].identity} update — BotanIQ`
      : `Your ${userPlants.length} plants this week — BotanIQ`

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: user.email }],
        subject,
        htmlContent: html,
      }),
    })

    if (res.ok) {
      sentCount++
      console.log(`Sent digest to ${user.email} (${userPlants.map(p => p.identity).join(', ')})`)
    } else {
      const body = await res.text()
      const msg = `${user.email}: ${res.status} ${body}`
      errors.push(msg)
      console.error('Brevo error:', msg)
    }
  }))

  return new Response(
    JSON.stringify({ ok: true, sent: sentCount, errors }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
