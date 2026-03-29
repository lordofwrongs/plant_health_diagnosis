import { useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient.js'

const POLL_INTERVAL = 3000 // 3 seconds
const MAX_WAIT = 120000   // 2 minutes timeout

export default function AnalysingScreen({ logId, onResultReady }) {
  const startTime = useRef(Date.now())

  useEffect(() => {
    const interval = setInterval(async () => {
      // Timeout guard
      if (Date.now() - startTime.current > MAX_WAIT) {
        clearInterval(interval)
        return
      }

      const { data, error } = await supabase
        .from('plant_logs')
        .select('*')
        .eq('id', logId)
        .single()

      if (error || !data) return

      // n8n writes back: status = 'done' and fills plant_name, health, issues, recommendations
      if (data.status === 'done') {
        clearInterval(interval)
        onResultReady(data)
      }
    }, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [logId, onResultReady])

  return (
    <div style={styles.page}>
      <div style={styles.container} className="fade-up">
        {/* Animated plant scanner */}
        <div style={styles.scannerWrapper}>
          <div style={styles.scannerOuter}>
            <div style={styles.scannerInner}>
              <LeafAnimated />
            </div>
          </div>
          <div style={styles.ripple1} />
          <div style={styles.ripple2} />
        </div>

        <h2 style={styles.title}>Analysing your plant</h2>
        <p style={styles.subtitle}>
          Our AI is examining your plant for health issues, identifying the species, and preparing personalised recommendations.
        </p>

        {/* Steps */}
        <div style={styles.steps}>
          <Step label="Uploading image" done={true} delay="0s" />
          <Step label="Identifying plant species" done={false} delay="0.8s" />
          <Step label="Diagnosing health issues" done={false} delay="1.6s" />
          <Step label="Preparing recommendations" done={false} delay="2.4s" />
        </div>

        <p style={styles.note}>This usually takes 15–30 seconds</p>
      </div>
    </div>
  )
}

function Step({ label, done, delay }) {
  return (
    <div style={{ ...styles.step, animationDelay: delay }} className="fade-up-delay-1">
      <div style={{ ...styles.stepDot, ...(done ? styles.stepDotDone : styles.stepDotPending) }}>
        {done ? '✓' : ''}
      </div>
      <span style={{ ...styles.stepLabel, ...(done ? styles.stepLabelDone : {}) }}>
        {label}
      </span>
    </div>
  )
}

function LeafAnimated() {
  return (
    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" style={{ animation: 'leafSway 2s ease-in-out infinite' }}>
      <path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="#52b788" stroke="#2d6a4f" strokeWidth="1"/>
      <path d="M12 22C12 22 9 16 11 10" stroke="#2d6a4f" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #f0faf4 0%, #faf8f3 60%, #e8f5e9 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
  },
  container: {
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%',
  },
  scannerWrapper: {
    position: 'relative',
    width: '120px',
    height: '120px',
    margin: '0 auto 36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerOuter: {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    background: 'rgba(82,183,136,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  scannerInner: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    background: 'rgba(82,183,136,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple1: {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    border: '2px solid rgba(82,183,136,0.4)',
    animation: 'ripple 2s ease-out infinite',
  },
  ripple2: {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    border: '2px solid rgba(82,183,136,0.25)',
    animation: 'ripple 2s ease-out 0.8s infinite',
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '24px',
    fontWeight: '500',
    color: '#1a3a2a',
    marginBottom: '12px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#4a6358',
    lineHeight: '1.7',
    fontWeight: '300',
    marginBottom: '36px',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    textAlign: 'left',
    background: '#fff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 20px rgba(26,58,42,0.06)',
    marginBottom: '24px',
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  stepDot: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    flexShrink: 0,
    fontWeight: '600',
  },
  stepDotDone: {
    background: '#52b788',
    color: '#fff',
  },
  stepDotPending: {
    background: 'transparent',
    border: '2px solid #b7e4c7',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  stepLabel: {
    fontSize: '14px',
    color: '#8aaa96',
    fontWeight: '300',
  },
  stepLabelDone: {
    color: '#2d6a4f',
    fontWeight: '500',
  },
  note: {
    fontSize: '12px',
    color: '#8aaa96',
  },
}
