import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient.js';
import { track } from '../utils/analytics.js';

const CONF_TIER = (score) => {
  if (!score) return 'unknown'
  if (score >= 90) return 'high'
  if (score >= 75) return 'medium'
  if (score >= 60) return 'low'
  return 'uncertain'
}
const CONF_CONFIG = {
  high:      { color: '#4CAF50', bg: '#E8F5E9', border: 'transparent',  label: 'High confidence',     tip: 'Two independent sources agreed on this identification.' },
  medium:    { color: '#F59E0B', bg: '#FFFBEB', border: 'transparent',  label: 'Moderate confidence', tip: 'Sources partially agreed. Visual evidence was limited.' },
  low:       { color: '#F97316', bg: '#FFF7ED', border: '#F97316',      label: 'Low confidence',      tip: 'Sources disagreed. A clearer photo from a different angle should improve accuracy.' },
  uncertain: { color: '#EF4444', bg: '#FEF2F2', border: '#EF4444',      label: 'Uncertain',           tip: 'We could not identify this plant reliably. Try a side-angle photo in good light.' },
  unknown:   { color: 'var(--primary)', bg: 'var(--mist)', border: 'transparent', label: '', tip: '' },
}

const MAX_QA_TURNS = 3

export default function ResultsScreen({ result, userLanguage, onReset, onBack, allScans = [], onSelectScan }) {
  // Feedback state
  const [feedbackStatus, setFeedbackStatus] = useState(null) // 'correct' | 'incorrect'
  const [showConfTip, setShowConfTip] = useState(false)

  // Correction modal state
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionInput, setCorrectionInput] = useState('')
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false)
  const [correctionError, setCorrectionError] = useState(null)

  // Re-run state (after correction submitted)
  const [rerunning, setRerunning] = useState(false)
  const [rerunError, setRerunError] = useState(null)
  const [localResult, setLocalResult] = useState(result)
  const pollRef = useRef(null)

  // Q&A state
  const [qaOpen, setQaOpen] = useState(false)
  const [qaMessages, setQaMessages] = useState([])
  const [qaInput, setQaInput] = useState('')
  const [qaLoading, setQaLoading] = useState(false)
  const [qaError, setQaError] = useState(null)
  const [qaLoaded, setQaLoaded] = useState(false)

  // Sync localResult when parent passes a new scan (timeline navigation)
  useEffect(() => {
    setLocalResult(result)
    setFeedbackStatus(null)
    setRerunning(false)
    setRerunError(null)
    setQaMessages([])
    setQaLoaded(false)
    setQaOpen(false)
  }, [result?.id])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    if (qaOpen) track('qa_opened', { plant_name: localResult?.PlantName })
  }, [qaOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load existing Q&A conversation when panel opens
  useEffect(() => {
    if (!qaOpen || qaLoaded || !localResult?.id) return
    const userId = localResult.user_id
    supabase
      .from('plant_conversations')
      .select('messages')
      .eq('log_id', localResult.id)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.messages?.length) setQaMessages(data.messages)
        setQaLoaded(true)
      })
  }, [qaOpen, qaLoaded, localResult?.id])

  const getDynamicName = () => {
    if (!localResult) return 'New Discovery'
    const meta = localResult.vernacular_metadata
    const currentLangKey = userLanguage?.toLowerCase()
    if (!meta || !currentLangKey || currentLangKey === 'english') {
      return localResult.PlantName || 'New Discovery'
    }
    const matchingKey = Object.keys(meta).find(k => k.toLowerCase().includes(currentLangKey))
    if (matchingKey && meta[matchingKey]) {
      const localName = meta[matchingKey]
      const englishRef = meta.english || localResult.PlantName
      return `${localName} (${englishRef})`
    }
    return localResult.PlantName || 'New Discovery'
  }

  const previousScan = allScans.length > 1 ? allScans[1] : null
  const tier = CONF_TIER(localResult?.AccuracyScore)
  const conf = CONF_CONFIG[tier]
  const healthColor = localResult?.HealthColor
    ? { bg: `${localResult.HealthColor}18`, text: localResult.HealthColor, dot: localResult.HealthColor }
    : { bg: 'var(--mist)', text: 'var(--mid)', dot: 'var(--leaf)' }
  const recommendations = localResult?.CarePlan
    ? localResult.CarePlan.split('\n').filter(line => line.trim() !== '')
    : []

  // ── Feedback handlers ────────────────────────────────────────────────────────

  const handleThumbsUp = async () => {
    setFeedbackStatus('correct')
    await supabase.from('plant_logs').update({ IsCorrect: true, UserCorrection: null }).eq('id', localResult.id)
  }

  const handleThumbsDown = () => {
    setCorrectionOpen(true)
    setCorrectionInput('')
    setCorrectionError(null)
  }

  const submitCorrection = async () => {
    if (!correctionInput.trim() || correctionSubmitting) return
    setCorrectionSubmitting(true)
    setCorrectionError(null)

    try {
      const userId = localResult.user_id

      await supabase.from('identification_feedback').insert({
        log_id: localResult.id,
        user_id: userId,
        user_correction: correctionInput.trim(),
      })

      await supabase.from('plant_logs').update({
        IsCorrect: false,
        UserCorrection: correctionInput.trim(),
        status: 'pending',
      }).eq('id', localResult.id)

      supabase.functions.invoke('plant-processor', {
        body: {
          record: {
            id: localResult.id,
            image_url: localResult.image_url,
            plant_nickname: localResult.plant_nickname ?? null,
            user_id: userId,
            user_correction: correctionInput.trim(),
          },
        },
      }).catch(err => console.error('Correction re-run invoke failed:', err))

      track('correction_submitted', { wrong_id: localResult?.PlantName })
      setFeedbackStatus('incorrect')
      setCorrectionOpen(false)
      setRerunning(true)
      setRerunError(null)

      // Poll every 3s for up to 90s
      const start = Date.now()
      pollRef.current = setInterval(async () => {
        if (Date.now() - start > 90000) {
          clearInterval(pollRef.current)
          setRerunning(false)
          setRerunError('Re-analysis timed out. Your correction has been saved.')
          return
        }
        const { data } = await supabase
          .from('plant_logs')
          .select('status, PlantName, ScientificName, AccuracyScore, HealthStatus, HealthColor, VisualAnalysis, CarePlan, ExpertTip, WeatherAlert, care_schedule, pest_detected, pest_name, pest_treatment, plantnet_candidates, vernacular_metadata, image_url, error_details')
          .eq('id', localResult.id)
          .single()
        if (data?.status === 'done') {
          clearInterval(pollRef.current)
          setLocalResult(prev => ({ ...prev, ...data }))
          setRerunning(false)
        } else if (data?.status === 'error') {
          clearInterval(pollRef.current)
          setRerunning(false)
          setRerunError('Re-analysis failed. Your correction has been saved.')
        }
      }, 3000)
    } catch (err) {
      setCorrectionError('Failed to submit. Please try again.')
    } finally {
      setCorrectionSubmitting(false)
    }
  }

  // ── Q&A handlers ─────────────────────────────────────────────────────────────

  const userTurns = qaMessages.filter(m => m.role === 'user').length

  const sendQuestion = async () => {
    if (!qaInput.trim() || qaLoading || userTurns >= MAX_QA_TURNS) return
    const question = qaInput.trim()
    setQaInput('')
    setQaLoading(true)
    setQaError(null)
    track('qa_question_sent', { turn_number: userTurns + 1 })

    // Optimistic add
    const optimistic = [...qaMessages, { role: 'user', content: question }]
    setQaMessages(optimistic)

    try {
      const { data, error } = await supabase.functions.invoke('plant-chat', {
        body: {
          log_id: localResult.id,
          user_id: localResult.user_id,
          question,
          messages: qaMessages,
        },
      })
      if (error || !data?.answer) throw new Error(data?.error || error?.message || 'No response')
      setQaMessages(data.messages)
    } catch (err) {
      setQaMessages(prev => prev.slice(0, -1)) // rollback
      setQaError('Could not get a response. Please try again.')
    } finally {
      setQaLoading(false)
    }
  }

  const isGuest = localResult?.user_id?.startsWith('guest_')

  return (
    <div style={styles.page}>
      {/* Correction modal — fixed overlay */}
      {correctionOpen && (
        <div style={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Correct plant identification">
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Correct this identification</h3>
            <p style={styles.modalSub}>
              We identified this as <strong>{localResult?.PlantName}</strong>. What is it actually?
            </p>
            <input
              type="text"
              placeholder="Enter the correct plant name"
              value={correctionInput}
              onChange={e => setCorrectionInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitCorrection()}
              style={styles.modalInput}
              autoFocus
              aria-label="Correct plant name"
            />
            {correctionError && <p style={styles.modalError}>{correctionError}</p>}
            <div style={styles.modalBtns}>
              <button
                style={{ ...styles.modalBtn, ...styles.modalBtnPrimary, ...(!correctionInput.trim() || correctionSubmitting ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                onClick={submitCorrection}
                disabled={!correctionInput.trim() || correctionSubmitting}
              >
                {correctionSubmitting ? 'Submitting...' : 'Submit & Re-analyse'}
              </button>
              <button
                style={{ ...styles.modalBtn, ...styles.modalBtnSecondary }}
                onClick={() => { setCorrectionOpen(false); setCorrectionError(null) }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.wrapper}>
        {/* Nav row */}
        <div style={styles.navRow}>
          <button onClick={onBack} style={styles.backBtn}>
            <span style={styles.backArrow}>←</span> My Garden
          </button>
          <button onClick={onReset} style={styles.newScanBtn}>+ New Scan</button>
        </div>

        {/* Re-run banner */}
        {rerunning && (
          <div style={styles.rerunBanner} role="status" aria-live="polite">
            <span style={styles.rerunSpinner}>⟳</span>
            Re-analysing with your correction — this takes about 20 seconds...
          </div>
        )}
        {rerunError && (
          <div style={styles.rerunError} role="alert">{rerunError}</div>
        )}

        {/* Weather alert */}
        {localResult?.WeatherAlert && (
          <div className="fade-up" style={styles.weatherCard}>
            <span style={styles.weatherIcon}>⚠️</span>
            <div>
              <p style={styles.weatherTitle}>Climate Alert</p>
              <p style={styles.weatherText}>{localResult.WeatherAlert}</p>
            </div>
          </div>
        )}

        {/* Hero card */}
        <div className="fade-up verdant-card" style={{
          ...styles.heroCard,
          ...(conf.border !== 'transparent' ? { border: `2px solid ${conf.border}` } : {}),
        }}>
          <div style={styles.imgWrap}>
            <img
              src={localResult?.image_url}
              alt={localResult?.PlantName ? `Photo of ${localResult.PlantName}` : 'Scanned plant photo'}
              style={styles.heroImg}
            />
            <div
              style={{ ...styles.healthPill, background: healthColor.bg, color: healthColor.text }}
              role="status"
              aria-label={`Health status: ${localResult?.HealthStatus || 'Analysing'}`}
            >
              <span style={{ ...styles.healthDot, background: healthColor.dot }} />
              {localResult?.HealthStatus || 'Analysing...'}
            </div>
          </div>

          <div style={styles.heroInfo}>
            <div style={styles.nameRow}>
              <h1 style={styles.plantName}>{getDynamicName()}</h1>
              {previousScan && (
                <span style={styles.trendChip}>
                  {localResult?.HealthStatus === previousScan?.HealthStatus ? 'Stable' : 'Changed'}
                </span>
              )}
            </div>
            <p style={styles.sciName}>{localResult?.ScientificName}</p>

            {localResult?.vernacular_metadata && (
              <div style={styles.vernRow}>
                {Object.entries(localResult.vernacular_metadata).map(([lang, name]) =>
                  lang !== 'english' && (
                    <span key={lang} style={styles.vernBadge}>
                      {lang.charAt(0).toUpperCase() + lang.slice(1)}: {name}
                    </span>
                  )
                )}
              </div>
            )}

            <button
              style={{ ...styles.confidenceTag, background: conf.bg, borderColor: conf.color, cursor: 'pointer' }}
              onClick={() => setShowConfTip(t => !t)}
            >
              <span style={{ ...styles.confidenceDot, background: conf.color }} />
              <span style={styles.confidenceLabel}>{conf.label || 'AI Confidence'}</span>
              <span style={{ ...styles.confidenceValue, color: conf.color }}>{localResult?.AccuracyScore}%</span>
              <span style={{ fontSize: '10px', color: conf.color, opacity: 0.7 }}>?</span>
            </button>
            {showConfTip && conf.tip && (
              <div style={{ ...styles.confTipBox, borderColor: conf.color, background: conf.bg }}>
                <p style={{ ...styles.confTipText, color: conf.color }}>{conf.tip}</p>
              </div>
            )}

            {tier === 'uncertain' && (
              <div style={styles.uncertainBanner}>
                <p style={styles.uncertainTitle}>We're not sure about this one</p>
                <p style={styles.uncertainSub}>The identification below is our best guess. A photo from a different angle will help significantly.</p>
              </div>
            )}

            {localResult?.AccuracyScore <= 80 &&
             Array.isArray(localResult?.plantnet_candidates) &&
             localResult.plantnet_candidates.length > 1 && (
              <div style={styles.altRow}>
                <span style={styles.altLabel}>Could also be:</span>
                {localResult.plantnet_candidates.slice(1).map((c, i) => (
                  <span key={i} style={styles.altChip}>{c.common || c.name}</span>
                ))}
              </div>
            )}
            {tier === 'medium' && (
              <p style={styles.evidenceNote}>Based on limited visual evidence — a side-angle photo would improve accuracy.</p>
            )}
            {(tier === 'low' || tier === 'uncertain') && (
              <button style={styles.rescanCta} onClick={onReset}>
                📷 Try a better angle for this plant
              </button>
            )}
          </div>
        </div>

        {/* Health journey */}
        {previousScan && (
          <div className="fade-up-delay-1 verdant-card" style={styles.section}>
            <h3 style={styles.sectionTitle}>Health Journey</h3>
            <div style={styles.journeyGrid}>
              <div style={styles.journeyItem}>
                <span style={styles.journeyLabel}>Previous scan</span>
                <span style={styles.journeyValue}>
                  {new Date(previousScan.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div style={styles.journeyItem}>
                <span style={styles.journeyLabel}>Previous status</span>
                <span style={{ ...styles.journeyValue, color: previousScan.HealthColor || 'var(--mid)' }}>
                  {previousScan.HealthStatus}
                </span>
              </div>
            </div>
            <div style={styles.divider} />
            <p style={styles.trendNote}>
              {localResult?.HealthStatus === previousScan?.HealthStatus
                ? 'Plant conditions remain consistent with the last observation.'
                : 'A change in health status has been detected since your last scan.'}
            </p>
          </div>
        )}

        {/* Visual analysis */}
        <div className="fade-up-delay-1 verdant-card" style={styles.section}>
          <h3 style={styles.sectionTitle}>Visual Analysis</h3>
          <p style={styles.bodyText}>{localResult?.VisualAnalysis}</p>
        </div>

        {/* Care plan */}
        <div className="fade-up-delay-2 verdant-card" style={styles.section}>
          <h3 style={styles.sectionTitle}>Care Recommendations</h3>
          <div style={styles.stepList}>
            {recommendations.map((step, i) => (
              <div key={i} style={styles.stepItem}>
                <div style={styles.stepNum}>{i + 1}</div>
                <p style={styles.stepText}>{step.replace(/[•*-]/g, '').trim()}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Care schedule */}
        {localResult?.care_schedule && (localResult.care_schedule.water_every_days || localResult.care_schedule.fertilise_every_days) && (
          <div className="fade-up-delay-2 verdant-card" style={styles.section}>
            <h3 style={styles.sectionTitle}>Care Schedule</h3>
            <div style={styles.scheduleGrid}>
              {localResult.care_schedule.water_every_days && (
                <div style={styles.scheduleItem}>
                  <span style={styles.scheduleIcon}>💧</span>
                  <span style={styles.scheduleLabel}>Water</span>
                  <span style={styles.scheduleFreq}>Every {localResult.care_schedule.water_every_days} days</span>
                </div>
              )}
              {localResult.care_schedule.fertilise_every_days && (
                <div style={styles.scheduleItem}>
                  <span style={styles.scheduleIcon}>🌱</span>
                  <span style={styles.scheduleLabel}>Fertilise</span>
                  <span style={styles.scheduleFreq}>Every {localResult.care_schedule.fertilise_every_days} days</span>
                </div>
              )}
              {localResult.care_schedule.check_pests_every_days && (
                <div style={styles.scheduleItem}>
                  <span style={styles.scheduleIcon}>🔍</span>
                  <span style={styles.scheduleLabel}>Check pests</span>
                  <span style={styles.scheduleFreq}>Every {localResult.care_schedule.check_pests_every_days} days</span>
                </div>
              )}
            </div>
            {localResult.care_schedule.notes && (
              <p style={{ ...styles.bodyText, marginTop: '14px', fontSize: '13px', color: 'var(--text-3)' }}>
                {localResult.care_schedule.notes}
              </p>
            )}
          </div>
        )}

        {/* Pest detection */}
        {localResult?.pest_detected && localResult?.pest_name && (
          <div className="fade-up-delay-2 verdant-card" style={{ ...styles.section, ...styles.pestSection }} role="alert" aria-label="Pest detected">
            <div style={styles.pestHeader}>
              <span style={{ fontSize: '22px', flexShrink: 0 }} aria-hidden="true">🐛</span>
              <div>
                <h3 style={{ ...styles.sectionTitle, color: '#C2410C', marginBottom: '2px' }}>Pest Detected</h3>
                <p style={styles.pestName}>{localResult.pest_name}</p>
              </div>
            </div>
            {Array.isArray(localResult.pest_treatment) && (
              <div style={styles.stepList}>
                {localResult.pest_treatment.map((step, i) => (
                  <div key={i} style={styles.stepItem}>
                    <div style={{ ...styles.stepNum, background: '#EA580C' }} aria-hidden="true">{i + 1}</div>
                    <p style={styles.stepText}>{String(step)}</p>
                  </div>
                ))}
              </div>
            )}
            <p style={styles.pestWarning}>Check nearby plants for early signs of the same pest.</p>
          </div>
        )}

        {/* Scan history timeline */}
        {allScans.length > 1 && (
          <div className="fade-up-delay-2 verdant-card" style={styles.section}>
            <h3 style={styles.sectionTitle}>Scan History ({allScans.length})</h3>
            <div style={styles.timelineList}>
              {allScans.map((scan, i) => {
                const isCurrent = scan.id === localResult?.id
                return (
                  <button
                    key={scan.id}
                    style={{ ...styles.timelineRow, ...(isCurrent ? styles.timelineRowActive : {}) }}
                    onClick={() => !isCurrent && onSelectScan?.(scan)}
                    disabled={isCurrent}
                  >
                    <span style={{ ...styles.timelineDot, background: scan.HealthColor || 'var(--leaf)' }} />
                    <span style={styles.timelineDate}>
                      {new Date(scan.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span style={{ ...styles.timelineStatus, color: scan.HealthColor || 'var(--mid)' }}>
                      {scan.HealthStatus || '—'}
                    </span>
                    {isCurrent
                      ? <span style={styles.timelineCurrent}>Viewing</span>
                      : <span style={styles.timelineChevron}>›</span>
                    }
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Expert tip */}
        {localResult?.ExpertTip && (
          <div className="fade-up-delay-2" style={styles.expertBox}>
            <span style={styles.expertLabel}>PRO TIP</span>
            <p style={styles.expertText}>{localResult.ExpertTip}</p>
          </div>
        )}

        {/* Photo tip */}
        {localResult?.error_details && (
          <div className="fade-up-delay-2" style={styles.photoTipBox}>
            <span style={styles.photoTipLabel}>📸 PHOTO TIP</span>
            <p style={styles.expertText}>Next time: {localResult.error_details}</p>
          </div>
        )}

        {/* Identification feedback */}
        <div className="fade-up-delay-3" style={styles.feedbackBox}>
          {feedbackStatus === 'correct' ? (
            <p style={styles.thankYou}>Thanks for confirming — helps BotanIQ improve! 🌱</p>
          ) : feedbackStatus === 'incorrect' ? (
            <p style={styles.thankYou}>
              {rerunning ? '⟳ Re-analysing with your correction...' : 'Correction saved — re-analysis complete. 🌱'}
            </p>
          ) : (
            <>
              <p style={styles.feedbackQ}>Was this identification correct?</p>
              <div style={styles.feedbackBtns}>
                <button style={styles.fbBtn} onClick={handleThumbsUp}>👍 Looks right</button>
                <button style={{ ...styles.fbBtn, ...styles.fbBtnWrong }} onClick={handleThumbsDown}>👎 Wrong plant</button>
              </div>
            </>
          )}
        </div>

        {/* Q&A section */}
        <div className="fade-up-delay-3 verdant-card" style={styles.qaSection}>
          <button
            style={styles.qaHeader}
            onClick={() => setQaOpen(o => !o)}
            aria-expanded={qaOpen}
            aria-controls="qa-body"
          >
            <span style={styles.qaHeaderIcon}>💬</span>
            <span style={styles.qaHeaderTitle}>Ask a follow-up question</span>
            {userTurns > 0 && !qaOpen && (
              <span style={styles.qaBadge}>{userTurns}/{MAX_QA_TURNS}</span>
            )}
            <span style={styles.qaHeaderChev}>{qaOpen ? '▲' : '▼'}</span>
          </button>

          {qaOpen && (
            <div id="qa-body" style={styles.qaBody}>
              {!qaLoaded && qaMessages.length === 0 && (
                <p style={styles.qaEmpty}>Loading...</p>
              )}
              {qaLoaded && qaMessages.length === 0 && (
                <p style={styles.qaEmpty}>
                  Ask anything about caring for your {localResult?.PlantName} — watering, pests, fertilising, or anything else.
                </p>
              )}

              <div style={styles.qaThread}>
                {qaMessages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.qaBubble,
                      ...(msg.role === 'user' ? styles.qaBubbleUser : styles.qaBubbleBot),
                    }}
                  >
                    {msg.content}
                  </div>
                ))}
                {qaLoading && (
                  <div style={{ ...styles.qaBubble, ...styles.qaBubbleBot, ...styles.qaTyping }}>
                    Thinking...
                  </div>
                )}
              </div>

              {qaError && <p style={styles.qaError}>{qaError}</p>}

              {userTurns < MAX_QA_TURNS ? (
                <div style={styles.qaInputRow}>
                  <input
                    type="text"
                    placeholder="Ask a care question..."
                    value={qaInput}
                    onChange={e => setQaInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendQuestion()}
                    style={styles.qaInput}
                    disabled={qaLoading}
                    aria-label="Follow-up question"
                  />
                  <button
                    style={{ ...styles.qaSubmit, ...(!qaInput.trim() || qaLoading ? styles.qaSubmitDisabled : {}) }}
                    onClick={sendQuestion}
                    disabled={!qaInput.trim() || qaLoading}
                  >
                    Ask →
                  </button>
                </div>
              ) : (
                <p style={styles.qaLimitNote}>Maximum {MAX_QA_TURNS} questions per scan reached.</p>
              )}

              {userTurns > 0 && userTurns < MAX_QA_TURNS && (
                <p style={styles.qaCount}>{userTurns} of {MAX_QA_TURNS} questions used</p>
              )}

              {isGuest && qaMessages.some(m => m.role === 'assistant') && (
                <div style={styles.qaGuestNudge}>
                  Sign up to save this conversation and get personalised advice on future scans.
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

const styles = {
  page: {
    flex: 1,
    background: 'var(--bg)',
    padding: '20px',
  },
  wrapper: {
    maxWidth: '520px',
    margin: '0 auto',
    paddingBottom: '48px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: 'none',
    color: 'var(--mid)',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 0',
  },
  backArrow: { fontSize: '16px' },
  newScanBtn: {
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    padding: '9px 18px',
    borderRadius: 'var(--r-full)',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    letterSpacing: '0.2px',
  },

  // Re-run banners
  rerunBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(82,183,136,0.1)',
    border: '1px solid rgba(82,183,136,0.35)',
    borderRadius: 'var(--r-sm)',
    padding: '12px 16px',
    fontSize: '13px',
    color: 'var(--primary)',
    fontWeight: '600',
  },
  rerunSpinner: {
    fontSize: '18px',
    animation: 'spin 1s linear infinite',
    display: 'inline-block',
  },
  rerunError: {
    background: '#FFF0F0',
    border: '1px solid #FFCDD2',
    borderRadius: 'var(--r-sm)',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#C62828',
  },

  // Correction modal
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10,31,20,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    padding: '20px',
  },
  modal: {
    background: 'var(--card)',
    borderRadius: 'var(--r-lg)',
    padding: '28px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
  },
  modalTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text-1)',
    marginBottom: '8px',
  },
  modalSub: {
    fontSize: '14px',
    color: 'var(--text-3)',
    marginBottom: '18px',
    lineHeight: '1.5',
  },
  modalInput: {
    width: '100%',
    padding: '12px 14px',
    border: '1.5px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    fontSize: '14px',
    color: 'var(--text-1)',
    background: 'var(--mist)',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    marginBottom: '14px',
  },
  modalError: {
    fontSize: '12px',
    color: '#C62828',
    marginBottom: '10px',
  },
  modalBtns: {
    display: 'flex',
    gap: '10px',
  },
  modalBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: 'var(--r-full)',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    border: 'none',
    transition: 'opacity 0.2s',
  },
  modalBtnPrimary: {
    background: 'var(--primary)',
    color: '#fff',
  },
  modalBtnSecondary: {
    background: 'var(--mist)',
    color: 'var(--text-2)',
    border: '1px solid var(--border)',
  },

  weatherCard: {
    display: 'flex',
    gap: '14px',
    alignItems: 'flex-start',
    background: '#FEF7E0',
    border: '1px solid #F0D080',
    padding: '16px',
    borderRadius: 'var(--r-md)',
  },
  weatherIcon: { fontSize: '22px', flexShrink: 0 },
  weatherTitle: { fontSize: '13px', fontWeight: '700', color: '#78580A', marginBottom: '2px' },
  weatherText: { fontSize: '13px', color: '#78580A', lineHeight: '1.4' },

  heroCard: { overflow: 'hidden' },
  imgWrap: { position: 'relative', height: '300px' },
  heroImg: { width: '100%', height: '100%', objectFit: 'cover' },
  healthPill: {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: 'var(--r-full)',
    fontSize: '13px',
    fontWeight: '700',
    backdropFilter: 'blur(12px)',
  },
  healthDot: { width: '8px', height: '8px', borderRadius: '50%' },

  heroInfo: { padding: '24px' },
  nameRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px',
    marginBottom: '4px',
  },
  plantName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '26px',
    fontWeight: '700',
    color: 'var(--text-1)',
    lineHeight: '1.2',
    flex: 1,
    margin: 0,
  },
  trendChip: {
    background: 'var(--mist)',
    color: 'var(--mid)',
    padding: '4px 12px',
    borderRadius: 'var(--r-full)',
    fontSize: '11px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    border: '1px solid var(--border)',
  },
  sciName: { fontSize: '15px', color: 'var(--text-3)', fontStyle: 'italic', marginBottom: '12px' },
  vernRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' },
  vernBadge: {
    fontSize: '11px',
    color: 'var(--mid)',
    background: 'var(--sage)',
    padding: '3px 10px',
    borderRadius: 'var(--r-sm)',
    fontWeight: '600',
  },
  confidenceTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--mist)',
    border: '1px solid',
    borderColor: 'var(--border)',
    padding: '4px 12px',
    borderRadius: 'var(--r-full)',
  },
  confidenceDot: { width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0 },
  confidenceLabel: { fontSize: '11px', color: 'var(--text-3)', fontWeight: '600' },
  confidenceValue: { fontSize: '12px', fontWeight: '800' },
  confTipBox: { marginTop: '10px', padding: '10px 14px', borderRadius: 'var(--r-sm)', border: '1px solid' },
  confTipText: { fontSize: '12px', lineHeight: '1.5', margin: 0, fontWeight: '500' },
  uncertainBanner: {
    marginTop: '12px', padding: '12px 14px',
    background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--r-sm)',
  },
  uncertainTitle: { fontSize: '13px', fontWeight: '700', color: '#EF4444', margin: 0, marginBottom: '4px' },
  uncertainSub: { fontSize: '12px', color: '#7F1D1D', margin: 0, lineHeight: '1.5' },
  evidenceNote: {
    marginTop: '10px', fontSize: '12px', color: '#92400e',
    background: '#FFFBEB', border: '1px solid #FDE68A',
    borderRadius: 'var(--r-sm)', padding: '8px 12px',
  },
  rescanCta: {
    marginTop: '14px', width: '100%', padding: '12px',
    background: 'none', border: '2px solid #F97316',
    borderRadius: 'var(--r-full)', color: '#F97316',
    fontSize: '13px', fontWeight: '700', cursor: 'pointer', letterSpacing: '0.2px',
  },
  altRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '10px' },
  altLabel: { fontSize: '11px', color: 'var(--text-4)', fontWeight: '600' },
  altChip: {
    fontSize: '11px', color: 'var(--text-3)',
    background: 'var(--mist)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-full)', padding: '2px 10px',
  },

  section: { padding: '24px' },
  sectionTitle: {
    fontSize: '11px', fontWeight: '800', letterSpacing: '1px',
    textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '14px',
  },
  bodyText: { fontSize: '15px', color: 'var(--text-2)', lineHeight: '1.65' },

  timelineList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  timelineRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 12px', borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)', background: 'var(--mist)',
    cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'background 0.15s',
  },
  timelineRowActive: { background: 'var(--sage)', border: '1px solid var(--leaf)', cursor: 'default' },
  timelineDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  timelineDate: { fontSize: '13px', fontWeight: '600', color: 'var(--text-2)', minWidth: '110px' },
  timelineStatus: { fontSize: '13px', fontWeight: '500', flex: 1 },
  timelineCurrent: {
    fontSize: '10px', fontWeight: '700', color: 'var(--mid)',
    background: 'var(--card)', border: '1px solid var(--leaf)',
    borderRadius: 'var(--r-full)', padding: '2px 8px', letterSpacing: '0.3px',
  },
  timelineChevron: { fontSize: '18px', color: 'var(--text-4)', fontWeight: '300' },

  journeyGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
  journeyItem: { display: 'flex', flexDirection: 'column', gap: '4px' },
  journeyLabel: { fontSize: '11px', color: 'var(--text-4)', fontWeight: '600', letterSpacing: '0.3px' },
  journeyValue: { fontSize: '14px', color: 'var(--text-1)', fontWeight: '600' },
  divider: { height: '1px', background: 'var(--border)', marginBottom: '12px' },
  trendNote: { fontSize: '13px', color: 'var(--text-3)', fontStyle: 'italic' },

  stepList: { display: 'flex', flexDirection: 'column', gap: '14px' },
  stepItem: { display: 'flex', gap: '14px', alignItems: 'flex-start' },
  stepNum: {
    width: '24px', height: '24px', background: 'var(--primary)', color: '#fff',
    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: '800', flexShrink: 0,
  },
  stepText: { margin: 0, fontSize: '14px', color: 'var(--text-2)', lineHeight: '1.6', paddingTop: '2px' },

  expertBox: { background: 'var(--primary)', padding: '24px', borderRadius: 'var(--r-lg)' },
  expertLabel: {
    background: 'var(--leaf)', color: '#fff', fontSize: '10px', fontWeight: '900',
    padding: '3px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '10px', letterSpacing: '0.5px',
  },
  expertText: { margin: 0, color: 'var(--sage)', fontSize: '14px', lineHeight: '1.65' },

  photoTipBox: { background: '#78350F', padding: '20px 24px', borderRadius: 'var(--r-lg)' },
  photoTipLabel: {
    background: '#F59E0B', color: '#fff', fontSize: '10px', fontWeight: '900',
    padding: '3px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '10px', letterSpacing: '0.5px',
  },

  feedbackBox: {
    textAlign: 'center', padding: '24px',
    background: 'var(--card)', borderRadius: 'var(--r-lg)',
    border: '1px solid var(--border)',
  },
  feedbackQ: { fontSize: '14px', color: 'var(--text-3)', marginBottom: '14px' },
  feedbackBtns: { display: 'flex', justifyContent: 'center', gap: '10px' },
  fbBtn: {
    padding: '10px 20px', background: 'var(--mist)',
    border: '1px solid var(--border)', borderRadius: 'var(--r-full)',
    cursor: 'pointer', fontSize: '13px', color: 'var(--primary)', fontWeight: '600',
  },
  fbBtnWrong: { color: '#C62828', borderColor: '#FFCDD2', background: '#FFF0F0' },
  thankYou: { color: 'var(--mid)', fontWeight: '600', fontSize: '14px' },

  pestSection: { background: '#FFF7ED', border: '1px solid #FED7AA' },
  pestHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  pestName: { fontSize: '16px', fontWeight: '700', color: '#9A3412', margin: 0 },
  pestWarning: {
    marginTop: '14px', fontSize: '12px', color: '#92400E',
    fontStyle: 'italic', padding: '8px 12px', background: '#FEF3C7',
    borderRadius: 'var(--r-sm)', border: '1px solid #FDE68A', margin: '14px 0 0',
  },

  scheduleGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' },
  scheduleItem: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
    background: 'var(--mist)', borderRadius: 'var(--r-md)', padding: '14px 8px', textAlign: 'center',
  },
  scheduleIcon:  { fontSize: '22px' },
  scheduleLabel: { fontSize: '11px', fontWeight: '700', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.4px' },
  scheduleFreq:  { fontSize: '12px', color: 'var(--primary)', fontWeight: '600' },

  // Q&A section
  qaSection: { overflow: 'hidden' },
  qaHeader: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
    padding: '16px 20px', background: 'none', border: 'none',
    cursor: 'pointer', textAlign: 'left',
  },
  qaHeaderIcon: { fontSize: '16px', flexShrink: 0 },
  qaHeaderTitle: { flex: 1, fontSize: '14px', fontWeight: '600', color: 'var(--text-1)' },
  qaBadge: {
    fontSize: '10px', fontWeight: '700', color: 'var(--mid)',
    background: 'var(--sage)', borderRadius: 'var(--r-full)',
    padding: '2px 8px', letterSpacing: '0.3px',
  },
  qaHeaderChev: { fontSize: '10px', color: 'var(--text-4)' },
  qaBody: {
    borderTop: '1px solid var(--border)',
    padding: '16px 20px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  qaEmpty: { fontSize: '13px', color: 'var(--text-3)', lineHeight: '1.5', margin: 0 },
  qaThread: { display: 'flex', flexDirection: 'column', gap: '10px' },
  qaBubble: {
    padding: '10px 14px',
    borderRadius: 'var(--r-md)',
    fontSize: '14px',
    lineHeight: '1.55',
    maxWidth: '90%',
  },
  qaBubbleUser: {
    background: 'var(--primary)',
    color: '#fff',
    alignSelf: 'flex-end',
    borderBottomRightRadius: '4px',
  },
  qaBubbleBot: {
    background: 'var(--mist)',
    color: 'var(--text-2)',
    alignSelf: 'flex-start',
    border: '1px solid var(--border)',
    borderBottomLeftRadius: '4px',
  },
  qaTyping: { color: 'var(--text-4)', fontStyle: 'italic' },
  qaError: { fontSize: '12px', color: '#C62828', margin: 0 },
  qaInputRow: { display: 'flex', gap: '8px' },
  qaInput: {
    flex: 1, padding: '11px 14px',
    border: '1.5px solid var(--border)', borderRadius: 'var(--r-sm)',
    fontSize: '14px', color: 'var(--text-1)', background: 'var(--mist)',
    outline: 'none', fontFamily: 'inherit',
  },
  qaSubmit: {
    padding: '11px 18px', background: 'var(--primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--r-sm)', fontSize: '13px',
    fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  qaSubmitDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  qaLimitNote: { fontSize: '13px', color: 'var(--text-4)', margin: 0, textAlign: 'center' },
  qaCount: { fontSize: '11px', color: 'var(--text-4)', margin: 0, textAlign: 'center' },
  qaGuestNudge: {
    padding: '12px 14px',
    background: 'rgba(82,183,136,0.08)',
    border: '1px solid rgba(82,183,136,0.3)',
    borderRadius: 'var(--r-sm)',
    fontSize: '12px',
    color: 'var(--primary)',
    fontWeight: '500',
    lineHeight: '1.5',
    textAlign: 'center',
  },
}
