import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient.js'
import { logger } from '../logger.js'

const POLL_INTERVAL_MS = 8000   // HTTP fallback poll every 8s (catches missed WS events)
const HARD_TIMEOUT_MS  = 90000  // Give up after 90s and show error

export default function AnalysingScreen({ logId, onResultReady, onError }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [errorState, setErrorState] = useState(null)
  const [qualityIssue, setQualityIssue] = useState(null) // photo tip from quality gate
  const [elapsed, setElapsed] = useState(0)
  const resolvedRef = useRef(false)

  useEffect(() => {
    if (!logId) return
    logger.info('AnalysingScreen', 'Starting analysis wait', { record_id: logId })

    // Call at most once — prevents double-navigation if both realtime + poll fire
    const resolve = (data) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      logger.info('AnalysingScreen', 'Analysis done — navigating to results', { record_id: logId })
      onResultReady(data)
    }

    const fail = (msg) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      logger.error('AnalysingScreen', `Analysis failed: ${msg}`, { record_id: logId })
      setErrorState(msg)
    }

    const needsBetterPhoto = (tip) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      logger.info('AnalysingScreen', `Quality gate rejected image: ${tip}`, { record_id: logId })
      setQualityIssue(tip)
    }

    // ------------------------------------------------------------------
    // 1. Realtime subscription (primary path)
    // ------------------------------------------------------------------
    const channel = supabase
      .channel(`log-monitor-${logId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'plant_logs', filter: `id=eq.${logId}` },
        (payload) => {
          logger.info('AnalysingScreen', `Realtime event: status=${payload.new.status}`, { record_id: logId })
          if (payload.new.status === 'done')          resolve(payload.new)
          if (payload.new.status === 'error')         fail(payload.new.error_details || 'Analysis failed. Please try again.')
          if (payload.new.status === 'quality_issue') needsBetterPhoto(payload.new.error_details || 'Please take a clearer photo of the plant.')
        }
      )
      .subscribe((status) => {
        logger.info('AnalysingScreen', `Realtime subscription: ${status}`, { record_id: logId })
      })

    // ------------------------------------------------------------------
    // 2. HTTP polling fallback (catches missed WebSocket events on mobile /
    //    poor networks or when the WS connection drops silently)
    // ------------------------------------------------------------------
    const pollTimer = setInterval(async () => {
      if (resolvedRef.current) return
      try {
        const { data, error } = await supabase
          .from('plant_logs')
          .select('*')
          .eq('id', logId)
          .single()
        if (error) { logger.warn('AnalysingScreen', `Poll error: ${error.message}`, { record_id: logId }); return }
        logger.info('AnalysingScreen', `Poll result: status=${data?.status}`, { record_id: logId })
        if (data?.status === 'done')          resolve(data)
        if (data?.status === 'error')         fail(data?.error_details || 'Analysis failed. Please try again.')
        if (data?.status === 'quality_issue') needsBetterPhoto(data?.error_details || 'Please take a clearer photo of the plant.')
      } catch (e) {
        logger.warn('AnalysingScreen', `Poll exception: ${e?.message}`, { record_id: logId })
      }
    }, POLL_INTERVAL_MS)

    // ------------------------------------------------------------------
    // 3. Hard timeout — network dead-end safety net
    // ------------------------------------------------------------------
    const timeoutTimer = setTimeout(() => {
      fail('Analysis is taking longer than expected. Please check your connection and try again.')
    }, HARD_TIMEOUT_MS)

    // ------------------------------------------------------------------
    // 4. Visual step progression (independent of actual progress)
    // ------------------------------------------------------------------
    const stepTimer = setInterval(() => {
      setCurrentStep((prev) => (prev < 3 ? prev + 1 : prev))
    }, 3500)

    // ------------------------------------------------------------------
    // 5. Elapsed time counter — shows "Analysing… Xs" to the user
    // ------------------------------------------------------------------
    const elapsedTimer = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollTimer)
      clearInterval(stepTimer)
      clearInterval(elapsedTimer)
      clearTimeout(timeoutTimer)
    }
  }, [logId, onResultReady])

  // ------------------------------------------------------------------
  // Quality issue UI — friendly, not scary; guides user to retake
  // ------------------------------------------------------------------
  if (qualityIssue) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.container, gap: '16px' }}>
          <div style={styles.cameraIconWrap}>📸</div>
          <h2 style={styles.title}>Better Photo Needed</h2>
          <p style={styles.subtitle}>We couldn't reliably analyse this image. A clearer photo will give you a much more accurate result.</p>
          <div style={styles.tipBox}>
            <span style={styles.tipLabel}>Tip</span>
            <span style={styles.tipText}>{qualityIssue}</span>
          </div>
          <button style={styles.retryBtn} onClick={onError}>Retake Photo</button>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // Error state UI
  // ------------------------------------------------------------------
  if (errorState) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.container, gap: '16px' }}>
          <div style={styles.errorIconWrap}>⚠️</div>
          <h2 style={styles.title}>Analysis Interrupted</h2>
          <p style={styles.subtitle}>{errorState}</p>
          {logId && (
            <p style={styles.refId}>
              Reference ID: <code style={styles.refCode}>{logId.substring(0, 8)}</code>
            </p>
          )}
          <button style={styles.retryBtn} onClick={onError}>Try Again</button>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // Normal analysing UI
  // ------------------------------------------------------------------
  return (
    <div style={styles.page}>
      <div style={styles.container} className="fade-up">
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

        <div style={styles.steps}>
          <Step label="Uploading image"             done={true}              active={currentStep === 0} />
          <Step label="Identifying plant species"   done={currentStep >= 1}  active={currentStep === 1} />
          <Step label="Diagnosing health issues"    done={currentStep >= 2}  active={currentStep === 2} />
          <Step label="Preparing recommendations"   done={currentStep >= 3}  active={currentStep === 3} />
        </div>

        <p style={styles.note}>Analysing… {elapsed}s</p>
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
        ...(active ? styles.stepDotActive : {}),
      }}>
        {done ? '✓' : ''}
      </div>
      <span style={{
        ...styles.stepLabel,
        ...(done ? styles.stepLabelDone : {}),
        ...(active ? styles.stepLabelActive : {}),
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
    flex: 1,
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
  },
  container: {
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
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
    width: '100%',
  },
  step: { display: 'flex', alignItems: 'center', gap: '14px' },
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
  stepDotDone:    { background: '#52b788', color: '#fff', border: 'none' },
  stepDotActive:  { border: '2px solid #52b788', background: 'rgba(82,183,136,0.1)', animation: 'pulse 1.5s ease-in-out infinite' },
  stepDotPending: { background: 'transparent', border: '2px solid #e8f5e9', color: 'transparent' },
  stepLabel:      { fontSize: '14px', color: '#cbdad2', fontWeight: '300', transition: 'all 0.3s ease' },
  stepLabelDone:  { color: '#2d6a4f', fontWeight: '500' },
  stepLabelActive:{ color: '#52b788', fontWeight: '500' },
  note: { fontSize: '12px', color: '#8aaa96' },

  // Quality issue state
  cameraIconWrap: { fontSize: '56px', marginBottom: '4px' },
  tipBox: { background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left', width: '100%' },
  tipLabel: { fontSize: '10px', fontWeight: '800', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  tipText: { fontSize: '14px', color: '#78350f', lineHeight: '1.5' },

  // Error state
  errorIconWrap: { fontSize: '48px', marginBottom: '8px' },
  refId:   { fontSize: '12px', color: '#8aaa96', margin: '4px 0 16px' },
  refCode: { background: '#f0f4f2', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' },
  retryBtn: {
    padding: '14px 32px',
    background: 'linear-gradient(135deg, #2d6a4f, #52b788)',
    color: '#fff',
    border: 'none',
    borderRadius: '14px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '15px',
    boxShadow: '0 4px 15px rgba(45,106,79,0.2)',
    marginTop: '8px',
  },
}
