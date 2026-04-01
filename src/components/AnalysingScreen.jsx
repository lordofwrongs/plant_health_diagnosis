import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function AnalysingScreen({ logId, onResultReady }) {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    // 1. REAL-TIME SUBSCRIPTION: Listen for the specific record update
    const channel = supabase
      .channel(`log-monitor-${logId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'plant_logs',
          filter: `id=eq.${logId}`
        },
        (payload) => {
          // As soon as status changes to 'done', trigger the results
          if (payload.new.status === 'done') {
            onResultReady(payload.new)
          }
        }
      )
      .subscribe()

    // 2. VISUAL PROGRESSION: Managed steps for better UX
    // We move through steps 1-3 visually while waiting for the real data
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev < 3 ? prev + 1 : prev))
    }, 3500)

    // 3. CLEANUP: Kill the subscription and interval when component unmounts
    return () => {
      supabase.removeChannel(channel)
      clearInterval(stepInterval)
    }
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

        {/* Steps with dynamic "done" states based on currentStep */}
        <div style={styles.steps}>
          <Step label="Uploading image" done={true} active={currentStep === 0} />
          <Step label="Identifying plant species" done={currentStep >= 1} active={currentStep === 1} />
          <Step label="Diagnosing health issues" done={currentStep >= 2} active={currentStep === 2} />
          <Step label="Preparing recommendations" done={currentStep >= 3} active={currentStep === 3} />
        </div>

        <p style={styles.note}>This usually takes 15–30 seconds</p>
      </div>
    </div>
  )
}

function Step({ label, done, active }) {
  return (
    <div style={styles.step}>
      <div style={{ 
        ...styles.stepDot, 
        ...(done ? styles.stepDotDone : styles.stepDotPending),
        ...(active ? styles.stepDotActive : {})
      }}>
        {done ? '✓' : ''}
      </div>
      <span style={{ 
        ...styles.stepLabel, 
        ...(done ? styles.stepLabelDone : {}),
        ...(active ? styles.stepLabelActive : {})
      }}>
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
    transition: 'all 0.3s ease',
  },
  stepDotDone: {
    background: '#52b788',
    color: '#fff',
    border: 'none',
  },
  stepDotActive: {
    border: '2px solid #52b788',
    background: 'rgba(82,183,136,0.1)',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  stepDotPending: {
    background: 'transparent',
    border: '2px solid #e8f5e9',
    color: 'transparent'
  },
  stepLabel: {
    fontSize: '14px',
    color: '#cbdad2',
    fontWeight: '300',
    transition: 'all 0.3s ease',
  },
  stepLabelDone: {
    color: '#2d6a4f',
    fontWeight: '500',
  },
  stepLabelActive: {
    color: '#52b788',
    fontWeight: '500',
  },
  note: {
    fontSize: '12px',
    color: '#8aaa96',
  },
}