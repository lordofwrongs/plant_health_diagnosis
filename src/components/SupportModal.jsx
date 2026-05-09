import { useState } from 'react'

const SUPPORT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-request`

export default function SupportModal({ onClose }) {
  const [form, setForm]       = useState({ name: '', email: '', message: '' })
  const [submitting, setSub]  = useState(false)
  const [error, setError]     = useState(null)
  const [submitted, setSubmitted] = useState(null) // holds { name, email, message, sentAt }

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async () => {
    setError(null)
    if (!form.email.trim()) { setError('Please enter your email so we can reply.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Please enter a valid email address.'); return }
    if (!form.message.trim()) { setError('Please describe what you need help with.'); return }

    setSub(true)
    try {
      const res = await fetch(SUPPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), message: form.message.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong. Please try again.'); return }
      setSubmitted({ ...form, sentAt: new Date().toLocaleString() })
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSub(false)
    }
  }

  const handleEmailCopy = () => {
    if (!submitted) return
    const body = [
      submitted.name ? `Name: ${submitted.name}` : null,
      `Email: ${submitted.email}`,
      `Submitted: ${submitted.sentAt}`,
      '',
      submitted.message,
    ].filter(l => l !== null).join('\n')
    const mailto = `mailto:${encodeURIComponent(submitted.email)}?subject=${encodeURIComponent('My BotanIQ support request')}&body=${encodeURIComponent(body)}`
    window.open(mailto, '_blank')
  }

  // ── Confirmation screen ───────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.card} onClick={e => e.stopPropagation()}>
          <div style={styles.icon}>✅</div>
          <h2 style={styles.heading}>Message sent</h2>
          <p style={styles.sub}>We've received your request and will get back to you at <strong>{submitted.email}</strong>.</p>

          <div style={styles.receipt}>
            {submitted.name && (
              <div style={styles.receiptRow}>
                <span style={styles.receiptLabel}>Name</span>
                <span style={styles.receiptValue}>{submitted.name}</span>
              </div>
            )}
            <div style={styles.receiptRow}>
              <span style={styles.receiptLabel}>Email</span>
              <span style={styles.receiptValue}>{submitted.email}</span>
            </div>
            <div style={styles.receiptRow}>
              <span style={styles.receiptLabel}>Sent</span>
              <span style={styles.receiptValue}>{submitted.sentAt}</span>
            </div>
            <div style={{ ...styles.receiptRow, flexDirection: 'column', gap: '6px', alignItems: 'flex-start', borderBottom: 'none' }}>
              <span style={styles.receiptLabel}>Message</span>
              <span style={{ ...styles.receiptValue, whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{submitted.message}</span>
            </div>
          </div>

          <button style={styles.copyBtn} onClick={handleEmailCopy}>
            Email myself a copy
          </button>
          <button style={styles.cta} onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={e => e.stopPropagation()}>
        <div style={styles.icon}>🌿</div>
        <h2 style={styles.heading}>Get support</h2>
        <p style={styles.sub}>Tell us what you need help with and how to reach you.</p>

        <div style={{ ...styles.field, marginBottom: '14px' }}>
          <label style={styles.label}>Your name <span style={styles.optional}>(optional)</span></label>
          <input
            style={styles.input}
            type="text"
            placeholder="e.g. Priya"
            value={form.name}
            onChange={set('name')}
            autoComplete="given-name"
          />
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
          <label style={styles.label}>How can we help? <span style={styles.req}>*</span></label>
          <textarea
            style={styles.textarea}
            placeholder="Describe the issue or question…"
            value={form.message}
            onChange={set('message')}
            rows={4}
            maxLength={1000}
          />
          <span style={styles.charCount}>{form.message.length}/1000</span>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...styles.cta, ...(submitting ? styles.ctaBusy : {}) }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Sending…' : 'Send message'}
        </button>

        <button style={styles.cancel} onClick={onClose}>Cancel</button>
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
    maxHeight: '90vh',
    overflowY: 'auto',
  },

  icon: {
    fontSize: '44px',
    marginBottom: '14px',
    display: 'block',
    textAlign: 'center',
  },

  heading: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--text-1)',
    marginBottom: '10px',
    lineHeight: '1.2',
    textAlign: 'center',
  },

  sub: {
    fontSize: '14px',
    color: 'var(--text-3)',
    lineHeight: '1.6',
    marginBottom: '24px',
    textAlign: 'center',
  },

  field: {
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
  req:      { color: 'var(--leaf)', fontWeight: '900' },
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

  textarea: {
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
    resize: 'vertical',
    minHeight: '96px',
    transition: 'border-color 0.15s',
  },

  charCount: {
    fontSize: '11px',
    color: 'var(--text-4)',
    textAlign: 'right',
    marginTop: '4px',
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

  receipt: {
    background: 'var(--mist)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    padding: '4px 16px',
    marginBottom: '20px',
    fontSize: '13px',
  },

  receiptRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid var(--border)',
    gap: '12px',
  },

  receiptLabel: {
    fontWeight: '700',
    color: 'var(--text-3)',
    flexShrink: 0,
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },

  receiptValue: {
    color: 'var(--text-1)',
    textAlign: 'right',
    wordBreak: 'break-word',
  },

  copyBtn: {
    width: '100%',
    padding: '13px',
    background: 'none',
    color: 'var(--primary)',
    border: '1.5px solid var(--primary)',
    borderRadius: 'var(--r-full)',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    marginBottom: '12px',
    transition: 'opacity 0.2s',
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

  cancel: {
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
