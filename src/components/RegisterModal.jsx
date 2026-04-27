import { useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function RegisterModal({ onComplete, onSkip }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async () => {
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
    const { error: dbErr } = await supabase.from('users').insert({
      guest_id:   guestId,
      first_name: form.firstName.trim(),
      last_name:  form.lastName.trim(),
      email:      form.email.trim(),
      phone:      form.phone.trim() || null,
    })

    if (dbErr) {
      // Duplicate guest_id means they registered on another device — treat as success
      if (!dbErr.message?.includes('unique')) {
        setError('Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
    }

    localStorage.setItem('botaniq_registered', 'true')
    onComplete({ firstName: form.firstName.trim() })
  }

  const handleSkip = () => {
    localStorage.setItem('botaniq_registered', 'skipped')
    onSkip()
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Header badge */}
        <div style={styles.badge}>
          <span style={styles.badgeLeaf}>🌿</span>
          <span style={styles.badgeText}>BotanIQ</span>
        </div>

        <h2 style={styles.heading}>Welcome to BotanIQ</h2>
        <p style={styles.sub}>
          Save your plant garden and let us reach out if you ever need support.
          No password, no spam — just your name and email.
        </p>

        {/* Name row */}
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

        {/* Email */}
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

        {/* Phone */}
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
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Saving…' : 'Join BotanIQ'}
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
