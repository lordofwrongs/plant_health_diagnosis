import { useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function RegisterModal({ onComplete, onSkip }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [linkSent, setLinkSent] = useState(false)

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const sendMagicLink = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError('Please fill in your name and email.')
      return
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    if (!emailOk) {
      setError('Please enter a valid email address.')
      return
    }

    setSubmitting(true)
    setError(null)

    const guestId = localStorage.getItem('plant_care_guest_id')
    const { error: authErr } = await supabase.auth.signInWithOtp({
      email: form.email.trim(),
      options: {
        emailRedirectTo: import.meta.env.VITE_APP_URL || window.location.origin,
        // Stored in auth.users.raw_user_meta_data — App.jsx reads this on sign-in
        data: {
          first_name: form.firstName.trim(),
          last_name:  form.lastName.trim(),
          phone:      form.phone.trim() || null,
          guest_id:   guestId,
        },
      },
    })

    if (authErr) {
      setError('Could not send the link. Please try again.')
      setSubmitting(false)
      return
    }

    setLinkSent(true)
    setSubmitting(false)
  }

  const handleSkip = () => {
    localStorage.setItem('botaniq_registered', 'skipped')
    onSkip()
  }

  // ── "Check your inbox" state ─────────────────────────────────────────────
  if (linkSent) {
    return (
      <div style={styles.overlay}>
        <div style={styles.card}>
          <div style={styles.inboxIcon}>📬</div>
          <h2 style={styles.heading}>Check your inbox</h2>
          <p style={styles.sub}>
            We've sent a sign-in link to <strong>{form.email.trim()}</strong>.
            Click the link in the email to save your garden and access it from any device.
          </p>
          <p style={styles.hint}>
            No email? Check your spam folder, or{' '}
            <button style={styles.resendBtn} onClick={() => { setLinkSent(false); setError(null) }}>
              try a different email
            </button>
            .
          </p>
          <button style={styles.skip} onClick={handleSkip}>
            Skip for now — I'll check later
          </button>
        </div>
      </div>
    )
  }

  // ── Registration form ────────────────────────────────────────────────────
  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.badge}>
          <span style={styles.badgeLeaf}>🌿</span>
          <span style={styles.badgeText}>BotanIQ</span>
        </div>

        <h2 style={styles.heading}>Save your garden</h2>
        <p style={styles.sub}>
          We'll send a sign-in link to your email — no password needed.
          Your plants will sync across all your devices.
        </p>

        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>First name <span style={styles.req}>*</span></label>
            <input
              style={styles.input}
              type="text"
              placeholder="e.g. Priya"
              value={form.firstName}
              onChange={set('firstName')}
              autoComplete="given-name"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Last name <span style={styles.req}>*</span></label>
            <input
              style={styles.input}
              type="text"
              placeholder="e.g. Sharma"
              value={form.lastName}
              onChange={set('lastName')}
              autoComplete="family-name"
            />
          </div>
        </div>

        <div style={{ ...styles.field, marginBottom: '14px' }}>
          <label style={styles.label}>Email <span style={styles.req}>*</span></label>
          <input
            style={styles.input}
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={set('email')}
            autoComplete="email"
          />
        </div>

        <div style={{ ...styles.field, marginBottom: '20px' }}>
          <label style={styles.label}>Phone <span style={styles.optional}>(optional)</span></label>
          <input
            style={styles.input}
            type="tel"
            placeholder="+91 98765 43210"
            value={form.phone}
            onChange={set('phone')}
            autoComplete="tel"
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...styles.cta, ...(submitting ? styles.ctaBusy : {}) }}
          onClick={sendMagicLink}
          disabled={submitting}
        >
          {submitting ? 'Sending…' : 'Send sign-in link'}
        </button>

        <button style={styles.skip} onClick={handleSkip}>
          Skip for now
        </button>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10,31,20,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 500,
    padding: '20px',
    backdropFilter: 'blur(2px)',
  },

  card: {
    background: '#fff',
    borderRadius: 'var(--r-xl)',
    padding: '32px 28px 24px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: 'var(--shadow-lg)',
    animation: 'fadeUp 0.3s ease both',
  },

  inboxIcon: {
    fontSize: '52px',
    marginBottom: '16px',
    display: 'block',
    textAlign: 'center',
  },

  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--mist)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-full)',
    padding: '5px 12px',
    marginBottom: '20px',
  },
  badgeLeaf: { fontSize: '15px' },
  badgeText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--primary)',
  },

  heading: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--text-1)',
    marginBottom: '10px',
    lineHeight: '1.2',
  },
  sub: {
    fontSize: '14px',
    color: 'var(--text-3)',
    lineHeight: '1.6',
    marginBottom: '24px',
  },
  hint: {
    fontSize: '13px',
    color: 'var(--text-4)',
    lineHeight: '1.6',
    marginBottom: '24px',
    textAlign: 'center',
  },
  resendBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--leaf)',
    fontSize: '13px',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  },

  row: {
    display: 'flex',
    gap: '12px',
    marginBottom: '14px',
  },
  field: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-2)',
    letterSpacing: '0.2px',
  },
  req: { color: 'var(--leaf)', fontWeight: '900' },
  optional: { fontWeight: '400', color: 'var(--text-4)' },

  input: {
    padding: '11px 13px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    fontSize: '14px',
    color: 'var(--text-1)',
    background: 'var(--mist)',
    outline: 'none',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },

  error: {
    fontSize: '13px',
    color: 'var(--critical)',
    background: '#FFF0F0',
    border: '1px solid #FFCDD2',
    borderRadius: 'var(--r-sm)',
    padding: '9px 12px',
    marginBottom: '14px',
  },

  cta: {
    width: '100%',
    padding: '16px',
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-full)',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    letterSpacing: '0.3px',
    boxShadow: '0 4px 16px rgba(27,67,50,0.25)',
    marginBottom: '14px',
    transition: 'opacity 0.2s',
  },
  ctaBusy: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },

  skip: {
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    color: 'var(--text-4)',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'center',
    padding: '4px',
    textDecoration: 'underline',
  },
}
