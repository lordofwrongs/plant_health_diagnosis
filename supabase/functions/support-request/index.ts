import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!
const FROM_EMAIL    = Deno.env.get('RESEND_FROM_EMAIL') ?? 'BotanIQ <botaniqsupport@gmail.com>'
const SUPPORT_EMAIL = 'botaniqsupport@gmail.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { name?: string; email?: string; message?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { name, email, message } = body
  if (!email?.trim())   return json({ error: 'Email is required.' }, 400)
  if (!message?.trim()) return json({ error: 'Message is required.' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return json({ error: 'Invalid email address.' }, 400)
  if (message.trim().length > 1000) return json({ error: 'Message too long.' }, 400)

  const fromMatch  = FROM_EMAIL.match(/^(.+?)\s*<(.+?)>$/)
  const senderName  = fromMatch ? fromMatch[1].trim() : 'BotanIQ'
  const senderEmail = fromMatch ? fromMatch[2].trim() : FROM_EMAIL

  const displayName   = name?.trim() || 'Anonymous'
  const submittedAt   = new Date().toUTCString()
  const escapedMsg    = message.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const escapedEmail  = email.trim().replace(/&/g,'&amp;')
  const escapedName   = displayName.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const htmlContent = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
  <div style="background:#1B4332;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
    <h1 style="color:#fff;font-size:20px;margin:0;">🌿 BotanIQ Support Request</h1>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;width:120px;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">From</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">${escapedName}</td>
    </tr>
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Email</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;"><a href="mailto:${escapedEmail}" style="color:#1B4332;">${escapedEmail}</a></td>
    </tr>
    <tr>
      <td style="padding:10px 0;color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Submitted</td>
      <td style="padding:10px 0;">${submittedAt}</td>
    </tr>
  </table>
  <div style="background:#f0fdf4;border-radius:10px;padding:20px 24px;border-left:4px solid #52B788;">
    <p style="font-size:13px;font-weight:700;color:#1B4332;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Message</p>
    <p style="margin:0;line-height:1.7;white-space:pre-wrap;">${escapedMsg}</p>
  </div>
  <p style="margin-top:28px;font-size:12px;color:#9ca3af;text-align:center;">Sent via BotanIQ in-app support form</p>
</div>`

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:  { name: senderName, email: senderEmail },
      to:      [{ email: SUPPORT_EMAIL, name: 'BotanIQ Support' }],
      replyTo: { email: email.trim(), name: displayName },
      subject: `Support: ${displayName} — ${message.trim().slice(0, 60)}${message.trim().length > 60 ? '…' : ''}`,
      htmlContent,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('Brevo error:', res.status, errText)
    return json({ error: 'Failed to send. Please try again.' }, 502)
  }

  return json({ ok: true })
})
