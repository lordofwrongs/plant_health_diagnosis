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
  const [feedbackStatus, setFeedbackStatus] = useState(null)
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

  // Voice Q&A state
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)
  const speechSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  // Active results tab
  const [activeTab, setActiveTab] = useState('diagnosis')

  // Sync localResult when parent passes a new scan (timeline navigation)
  useEffect(() => {
    setLocalResult(result)
    setFeedbackStatus(null)
    setRerunning(false)
    setRerunError(null)
    setQaMessages([])
    setQaLoaded(false)
    setQaOpen(false)
    setActiveTab('diagnosis')
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
      // FIX-10: Clear stale Q&A so old conversation doesn't show after re-identification
      setQaMessages([])
      setQaLoaded(false)
      setQaOpen(false)

      // Poll every 3s for up to 90s (FIX-11: active flag prevents overlapping in-flight queries)
      const start = Date.now()
      let active = true
      pollRef.current = setInterval(async () => {
        if (!active) return
        if (Date.now() - start > 90000) {
          active = false
          clearInterval(pollRef.current)
          setRerunning(false)
          setRerunError('Re-analysis timed out. Your correction has been saved.')
          return
        }
        active = false
        try {
          const { data } = await supabase
            .from('plant_logs')
            .select('status, PlantName, ScientificName, AccuracyScore, HealthStatus, HealthColor, VisualAnalysis, CarePlan, ExpertTip, WeatherAlert, care_schedule, pest_detected, pest_name, pest_treatment, plantnet_candidates, vernacular_metadata, image_url, error_details, toxicity, light_intensity_analysis, seasonal_context, vital_signs, growth_milestones, plant_classification, nutrient_recommendations, harvest_guide, plantnet_reference_image')
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
        } finally {
          active = true
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

  // ── Voice Q&A ────────────────────────────────────────────────────────────────
  const LANG_CODES = { English: 'en-US', Hindi: 'hi-IN', Tamil: 'ta-IN', Telugu: 'te-IN' }

  const startVoiceInput = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    recognitionRef.current = rec
    rec.lang = LANG_CODES[userLanguage] || 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onstart  = () => setIsListening(true)
    rec.onresult = (e) => { setQaInput(e.results[0][0].transcript); setIsListening(false) }
    rec.onerror  = () => setIsListening(false)
    rec.onend    = () => setIsListening(false)
    rec.start()
  }

  const stopVoiceInput = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  // ── Toxicity helper ──────────────────────────────────────────────────────────
  const getToxicityLevel = (text) => {
    if (!text) return 'unknown'
    const t = text.toLowerCase()
    if (t.includes('safe') || t.includes('non-toxic') || t.includes('edible') || t.includes('no risk')) return 'safe'
    if (t.includes('mild') || t.includes('slight') || t.includes('caution') || t.includes('low risk') || t.includes('monitor')) return 'caution'
    return 'toxic'
  }

  const TOXICITY_COLOR = { safe: '#0D9488', caution: '#D97706', toxic: '#DC2626', unknown: 'var(--text-4)' }

  const TABS = [
    { id: 'diagnosis', label: 'Diagnosis' },
    { id: 'care',      label: 'Care'      },
    { id: 'about',     label: 'About'     },
  ]

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

        {/* Re-run banner + skeleton */}
        {rerunning && (
          <>
            <div style={styles.rerunBanner} role="status" aria-live="polite">
              <span style={styles.rerunSpinner}>⟳</span>
              Re-analysing with your correction — this takes about 20 seconds...
            </div>
            <div className="skeleton-shimmer verdant-card" style={{ height: '340px', borderRadius: 'var(--r-lg)' }} />
            <div className="skeleton-shimmer verdant-card" style={{ height: '110px', borderRadius: 'var(--r-lg)' }} />
            <div className="skeleton-shimmer verdant-card" style={{ height: '180px', borderRadius: 'var(--r-lg)' }} />
            <div className="skeleton-shimmer verdant-card" style={{ height: '120px', borderRadius: 'var(--r-lg)' }} />
          </>
        )}
        {rerunError && (
          <div style={styles.rerunError} role="alert">{rerunError}</div>
        )}

        {!rerunning && (<>

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

        {/* PlantNet reference image panel — only shown for < 90% confidence */}
        {localResult?.plantnet_reference_image && (localResult?.AccuracyScore ?? 100) < 90 && (
          <ReferenceImagePanel
            imageUrl={localResult.plantnet_reference_image}
            scientificName={localResult.ScientificName}
          />
        )}

        {/* Tab bar */}
        <div style={styles.tabBar} role="tablist" aria-label="Results sections">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              style={{ ...styles.tabBtn, ...(activeTab === tab.id ? styles.tabBtnActive : {}) }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Diagnosis Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'diagnosis' && (<>

          {/* Visual Analysis — first, so the user sees the narrative before any numbers */}
          <div className="fade-up verdant-card" style={styles.section}>
            <h3 style={styles.sectionTitle}>Visual Analysis</h3>
            <p style={styles.bodyText}>{localResult?.VisualAnalysis}</p>
          </div>

          {/* Vital Signs meters */}
          {localResult?.vital_signs && (
            <div className="fade-up verdant-card" style={styles.section}>
              <h3 style={styles.sectionTitle}>Vital Signs</h3>
              <div style={styles.vitalList}>
                {[
                  { key: 'hydration', label: 'Hydration', icon: '💧', invert: false },
                  { key: 'light',     label: 'Light',     icon: '☀️', invert: false },
                  { key: 'nutrients', label: 'Nutrients', icon: '🌱', invert: false },
                  { key: 'pest_risk', label: 'Pest Risk', icon: '🐛', invert: true },
                ].map(({ key, label, icon, invert }) => {
                  const raw = localResult.vital_signs[key] ?? 50
                  const score = Math.min(100, Math.max(0, Math.round(raw)))
                  const effective = invert ? 100 - score : score
                  const barColor = effective >= 70 ? '#0D9488' : effective >= 40 ? '#D97706' : '#DC2626'
                  return (
                    <div key={key} style={styles.vitalRow}>
                      <span style={styles.vitalIcon} aria-hidden="true">{icon}</span>
                      <span style={styles.vitalLabel}>{label}</span>
                      <div style={styles.vitalBarTrack} role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                        <div style={{ ...styles.vitalBarFill, width: `${score}%`, background: barColor }} />
                      </div>
                      <span style={{ ...styles.vitalScore, color: barColor }}>{score}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Health Journey */}
          {previousScan && (
            <div className="fade-up verdant-card" style={styles.section}>
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
                {localResult?.growth_milestones?.narrative
                  ? localResult.growth_milestones.narrative
                  : localResult?.HealthStatus === previousScan?.HealthStatus
                    ? 'Plant conditions remain consistent with the last observation.'
                    : 'A change in health status has been detected since your last scan.'}
              </p>
            </div>
          )}

          {/* Weather Alert */}
          {localResult?.WeatherAlert && (
            <div className="fade-up" style={styles.weatherCard}>
              <span style={styles.weatherIcon}>⚠️</span>
              <div>
                <p style={styles.weatherTitle}>Climate Alert</p>
                <p style={styles.weatherText}>{localResult.WeatherAlert}</p>
              </div>
            </div>
          )}

          {/* Pest detection */}
          {localResult?.pest_detected && localResult?.pest_name && (
            <div className="fade-up verdant-card" style={{ ...styles.section, ...styles.pestSection }} role="alert" aria-label="Pest detected">
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

        </>)}

        {/* ── Care Tab ──────────────────────────────────────────────────────── */}
        {activeTab === 'care' && (<>

          {/* Care Schedule */}
          {localResult?.care_schedule && (localResult.care_schedule.water_every_days || localResult.care_schedule.fertilise_every_days) && (
            <div className="fade-up verdant-card" style={styles.section}>
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
              <button style={styles.reminderNudge} onClick={onBack}>
                🔔 Set watering reminders in My Garden →
              </button>
            </div>
          )}

          {/* Care Recommendations */}
          <div className="fade-up verdant-card" style={styles.section}>
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

          {/* Nutrient Recommendations */}
          {localResult?.nutrient_recommendations && (
            <NutrientCard recommendations={localResult.nutrient_recommendations} />
          )}

          {/* Harvest Guide */}
          {localResult?.harvest_guide && localResult?.plant_classification?.is_edible && (
            <HarvestGuideCard guide={localResult.harvest_guide} />
          )}

          {/* Environment — light + seasonal context */}
          {(localResult?.light_intensity_analysis || localResult?.seasonal_context) && (
            <div className="fade-up verdant-card" style={styles.section}>
              <h3 style={styles.sectionTitle}>Environment</h3>
              {localResult.light_intensity_analysis && (
                <div style={styles.envRow}>
                  <span style={styles.envIcon} aria-hidden="true">☀️</span>
                  <p style={styles.envText}>{localResult.light_intensity_analysis}</p>
                </div>
              )}
              {localResult.light_intensity_analysis && localResult.seasonal_context && (
                <div style={styles.divider} />
              )}
              {localResult.seasonal_context && (
                <div style={styles.envRow}>
                  <span style={styles.envIcon} aria-hidden="true">📅</span>
                  <p style={styles.envText}>{localResult.seasonal_context}</p>
                </div>
              )}
            </div>
          )}

          {/* Expert Tip */}
          {localResult?.ExpertTip && (
            <div className="fade-up" style={styles.expertBox}>
              <span style={styles.expertLabel}>PRO TIP</span>
              <p style={styles.expertText}>{localResult.ExpertTip}</p>
            </div>
          )}

        </>)}

        {/* ── About Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'about' && (<>

          {/* Plant Classification */}
          {localResult?.plant_classification && (
            <ClassificationCard classification={localResult.plant_classification} />
          )}

          {/* Toxicity / Safety */}
          {localResult?.toxicity && (localResult.toxicity.risk_cats || localResult.toxicity.risk_dogs || localResult.toxicity.risk_humans) && (
            <div className="fade-up verdant-card" style={styles.section}>
              <h3 style={styles.sectionTitle}>Safety</h3>
              <div style={styles.toxGrid}>
                {[
                  { label: 'Cats',   icon: '🐱', value: localResult.toxicity.risk_cats },
                  { label: 'Dogs',   icon: '🐶', value: localResult.toxicity.risk_dogs },
                  { label: 'Humans', icon: '👤', value: localResult.toxicity.risk_humans },
                ].filter(r => r.value).map(({ label, icon, value }) => {
                  const level = getToxicityLevel(value)
                  return (
                    <div key={label} style={styles.toxRow}>
                      <span style={styles.toxIcon} aria-hidden="true">{icon}</span>
                      <span style={styles.toxLabel}>{label}</span>
                      <span style={{ ...styles.toxValue, color: TOXICITY_COLOR[level], borderColor: TOXICITY_COLOR[level], background: `${TOXICITY_COLOR[level]}12` }}>
                        {value}
                      </span>
                    </div>
                  )
                })}
              </div>
              {localResult.toxicity.notes && (
                <p style={{ ...styles.bodyText, marginTop: '14px', fontSize: '13px', color: 'var(--text-3)' }}>
                  {localResult.toxicity.notes}
                </p>
              )}
            </div>
          )}

          {/* Scan History Timeline */}
          {allScans.length > 1 && (
            <div className="fade-up verdant-card" style={styles.section}>
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

          {/* Photo Tip */}
          {localResult?.error_details && (
            <div className="fade-up" style={styles.photoTipBox}>
              <span style={styles.photoTipLabel}>📸 PHOTO TIP</span>
              <p style={styles.expertText}>Next time: {localResult.error_details}</p>
            </div>
          )}

        </>)}

        {/* ── Always below tabs ─────────────────────────────────────────────── */}

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
                  {speechSupported && (
                    <button
                      style={{
                        ...styles.micBtn,
                        ...(isListening ? styles.micBtnActive : {}),
                      }}
                      onClick={isListening ? stopVoiceInput : startVoiceInput}
                      disabled={qaLoading}
                      aria-label={isListening ? 'Stop recording' : 'Start voice input'}
                      title={isListening ? 'Tap to stop' : 'Ask by voice'}
                    >
                      🎤
                    </button>
                  )}
                  <input
                    type="text"
                    placeholder={isListening ? 'Listening...' : 'Ask a care question...'}
                    value={qaInput}
                    onChange={e => setQaInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendQuestion()}
                    style={{ ...styles.qaInput, ...(isListening ? styles.qaInputListening : {}) }}
                    disabled={qaLoading || isListening}
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

        </>)}
      </div>
    </div>
  )
}

// ── ClassificationCard ───────────────────────────────────────────────────────

const PRIMARY_USE_CONFIG = {
  vegetable:      { color: '#0D9488', bg: '#F0FDFA', label: 'Vegetable' },
  fruit:          { color: '#F97316', bg: '#FFF7ED', label: 'Fruit' },
  herb_culinary:  { color: '#D97706', bg: '#FFFBEB', label: 'Culinary Herb' },
  herb_medicinal: { color: '#7C3AED', bg: '#F5F3FF', label: 'Medicinal Herb' },
  ornamental:     { color: '#EC4899', bg: '#FDF2F8', label: 'Ornamental' },
  weed:           { color: '#D97706', bg: '#FFFBEB', label: 'Weed' },
  tree:           { color: '#1B4332', bg: '#F0FDF4', label: 'Tree' },
  succulent:      { color: '#52B788', bg: '#F0FDF4', label: 'Succulent' },
  invasive:       { color: '#DC2626', bg: '#FEF2F2', label: 'Invasive Plant' },
  unknown:        { color: 'var(--text-3)', bg: 'var(--mist)', label: 'Unclassified' },
}

function ClassificationCard({ classification }) {
  const cfg = PRIMARY_USE_CONFIG[classification.primary_use] || PRIMARY_USE_CONFIG.unknown
  return (
    <div className="fade-up verdant-card" style={{ padding: '24px' }}>
      <h3 style={classifStyles.title}>Plant Classification</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <span style={{ ...classifStyles.badge, color: cfg.color, background: cfg.bg, borderColor: cfg.color }}>
          {cfg.label}
        </span>
        {classification.cultivation_status && classification.cultivation_status !== 'unknown' && (
          <span style={classifStyles.statusChip}>{classification.cultivation_status}</span>
        )}
      </div>
      {classification.is_edible && classification.edible_parts && (
        <div style={classifStyles.edibleBox}>
          <span style={classifStyles.boxIcon} aria-hidden="true">✅</span>
          <div>
            <p style={classifStyles.edibleTitle}>Edible parts</p>
            <p style={classifStyles.edibleText}>{classification.edible_parts}</p>
            {classification.edibility_notes && (
              <p style={classifStyles.edibleNotes}>{classification.edibility_notes}</p>
            )}
          </div>
        </div>
      )}
      {classification.is_weed && classification.weed_action && (
        <div style={{ ...classifStyles.edibleBox, ...classifStyles.weedBox }}>
          <span style={classifStyles.boxIcon} aria-hidden="true">⚠️</span>
          <div>
            <p style={{ ...classifStyles.edibleTitle, color: '#92400E' }}>Weed — removal recommended</p>
            <p style={{ ...classifStyles.edibleText, color: '#78350F' }}>{classification.weed_action}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ReferenceImagePanel ──────────────────────────────────────────────────────

function ReferenceImagePanel({ imageUrl, scientificName }) {
  return (
    <div className="fade-up verdant-card" style={refStyles.panel}>
      <img
        src={imageUrl}
        alt={`Reference leaf — ${scientificName}`}
        style={refStyles.img}
        onError={e => { e.currentTarget.style.display = 'none' }}
      />
      <div style={refStyles.body}>
        <p style={refStyles.label}>REFERENCE LEAF</p>
        <p style={refStyles.sci}>{scientificName}</p>
        <p style={refStyles.prompt}>
          Does your plant's leaf shape match this? If not, tap <strong>Wrong plant</strong> below to correct it.
        </p>
      </div>
    </div>
  )
}

// ── NutrientCard ─────────────────────────────────────────────────────────────

function NutrientCard({ recommendations: rec }) {
  return (
    <div className="fade-up verdant-card" style={{ padding: '24px' }}>
      <h3 style={nutrientStyles.title}>Nutrients</h3>

      {rec.deficiency_detected && (
        <div style={nutrientStyles.defAlert}>
          <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
          <div>
            <p style={nutrientStyles.defTitle}>{rec.deficiency_detected.charAt(0).toUpperCase() + rec.deficiency_detected.slice(1)} deficiency detected</p>
            {rec.deficiency_signs && <p style={nutrientStyles.defText}>{rec.deficiency_signs}</p>}
          </div>
        </div>
      )}

      {rec.primary_fix && (
        <div style={nutrientStyles.block}>
          <p style={nutrientStyles.blockLabel}>Primary fix</p>
          <p style={nutrientStyles.blockTitle}>{rec.primary_fix.product}</p>
          <p style={nutrientStyles.blockText}>{rec.primary_fix.recipe}</p>
          {rec.primary_fix.application && (
            <p style={{ ...nutrientStyles.blockText, marginTop: '4px', color: 'var(--text-3)', fontStyle: 'italic' }}>
              {rec.primary_fix.application}
            </p>
          )}
        </div>
      )}

      {rec.organic_option && (
        <div style={nutrientStyles.block}>
          <p style={nutrientStyles.blockLabel}>🌿 Organic option</p>
          <p style={nutrientStyles.blockTitle}>{rec.organic_option.name}</p>
          <p style={nutrientStyles.blockText}>{rec.organic_option.recipe}</p>
        </div>
      )}

      {rec.diy_option && (
        <div style={nutrientStyles.block}>
          <p style={nutrientStyles.blockLabel}>🏠 DIY option</p>
          <p style={nutrientStyles.blockTitle}>{rec.diy_option.name}</p>
          <p style={nutrientStyles.blockText}>{rec.diy_option.recipe}</p>
        </div>
      )}

      {rec.stage_note && (
        <div style={nutrientStyles.stageNote}>
          <span style={{ fontSize: '14px', flexShrink: 0 }}>💡</span>
          <p style={nutrientStyles.stageText}>{rec.stage_note}</p>
        </div>
      )}

      {rec.caution && (
        <div style={nutrientStyles.caution}>
          <span style={{ fontSize: '14px', flexShrink: 0 }}>⚠️</span>
          <p style={nutrientStyles.cautionText}>{rec.caution}</p>
        </div>
      )}
    </div>
  )
}

// ── HarvestGuideCard ─────────────────────────────────────────────────────────

function HarvestGuideCard({ guide }) {
  return (
    <div className="fade-up verdant-card" style={{ padding: '24px' }}>
      <h3 style={harvestStyles.title}>🌽 Harvest Guide</h3>

      <div style={harvestStyles.metaGrid}>
        {guide.current_stage_estimate && (
          <div style={harvestStyles.metaItem}>
            <span style={harvestStyles.metaLabel}>Time to harvest</span>
            <span style={harvestStyles.metaValue}>{guide.current_stage_estimate}</span>
          </div>
        )}
        {guide.days_to_first_harvest && (
          <div style={harvestStyles.metaItem}>
            <span style={harvestStyles.metaLabel}>Typical range</span>
            <span style={harvestStyles.metaValue}>{guide.days_to_first_harvest}</span>
          </div>
        )}
      </div>

      {Array.isArray(guide.visual_readiness_cues) && guide.visual_readiness_cues.length > 0 && (
        <>
          <p style={harvestStyles.subLabel}>When it's ready</p>
          <div style={harvestStyles.cueList}>
            {guide.visual_readiness_cues.map((cue, i) => (
              <div key={i} style={harvestStyles.cueItem}>
                <span style={harvestStyles.cueCheck}>✓</span>
                <span>{cue}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {guide.check_frequency && (
        <div style={harvestStyles.infoRow}>
          <span style={harvestStyles.infoIcon}>🔍</span>
          <p style={harvestStyles.infoText}>{guide.check_frequency}</p>
        </div>
      )}

      {guide.how_to_harvest && (
        <div style={harvestStyles.infoRow}>
          <span style={harvestStyles.infoIcon}>✂️</span>
          <p style={harvestStyles.infoText}>{guide.how_to_harvest}</p>
        </div>
      )}

      {guide.post_harvest_tip && (
        <div style={harvestStyles.infoRow}>
          <span style={harvestStyles.infoIcon}>🧺</span>
          <p style={harvestStyles.infoText}>{guide.post_harvest_tip}</p>
        </div>
      )}

      {guide.important_warning && (
        <div style={harvestStyles.warning}>
          <span style={{ fontSize: '14px', flexShrink: 0 }}>⚠️</span>
          <p style={harvestStyles.warningText}>{guide.important_warning}</p>
        </div>
      )}
    </div>
  )
}

// ── Component-level styles ───────────────────────────────────────────────────

const classifStyles = {
  title: {
    fontSize: '11px', fontWeight: '800', letterSpacing: '1px',
    textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '14px',
  },
  badge: {
    fontSize: '12px', fontWeight: '700', padding: '5px 14px',
    borderRadius: 'var(--r-full)', border: '1px solid',
  },
  statusChip: {
    fontSize: '11px', color: 'var(--text-3)', background: 'var(--mist)',
    border: '1px solid var(--border)', borderRadius: 'var(--r-full)',
    padding: '3px 10px', fontWeight: '600',
  },
  edibleBox: {
    display: 'flex', gap: '10px', alignItems: 'flex-start',
    background: '#F0FDF4', border: '1px solid #A7F3D0',
    borderRadius: 'var(--r-sm)', padding: '12px 14px', marginTop: '10px',
  },
  weedBox: { background: '#FFFBEB', border: '1px solid #FDE68A' },
  boxIcon: { fontSize: '16px', flexShrink: 0 },
  edibleTitle: { fontSize: '11px', fontWeight: '700', color: '#065F46', margin: '0 0 3px' },
  edibleText: { fontSize: '13px', color: '#064E3B', margin: 0, lineHeight: '1.4' },
  edibleNotes: {
    fontSize: '12px', color: '#047857', margin: '4px 0 0',
    lineHeight: '1.4', fontStyle: 'italic',
  },
}

const refStyles = {
  panel: {
    display: 'flex', gap: '14px', alignItems: 'flex-start', padding: '16px',
  },
  img: {
    width: '80px', height: '80px', borderRadius: 'var(--r-sm)',
    objectFit: 'cover', flexShrink: 0, background: 'var(--border)',
  },
  body: { flex: 1 },
  label: {
    fontSize: '10px', fontWeight: '800', letterSpacing: '1px',
    textTransform: 'uppercase', color: 'var(--text-4)', margin: '0 0 2px',
  },
  sci: {
    fontSize: '12px', color: 'var(--text-3)', fontStyle: 'italic', margin: '0 0 6px',
  },
  prompt: {
    fontSize: '12px', color: 'var(--text-3)', lineHeight: '1.5', margin: 0,
  },
}

const nutrientStyles = {
  title: {
    fontSize: '11px', fontWeight: '800', letterSpacing: '1px',
    textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '14px',
  },
  defAlert: {
    display: 'flex', gap: '10px', alignItems: 'flex-start',
    background: '#FFFBEB', border: '1px solid #FDE68A',
    borderRadius: 'var(--r-sm)', padding: '10px 12px', marginBottom: '16px',
  },
  defTitle: { fontSize: '12px', fontWeight: '700', color: '#92400E', margin: '0 0 2px' },
  defText:  { fontSize: '12px', color: '#78350F', margin: 0, lineHeight: '1.4' },
  block: { marginBottom: '14px' },
  blockLabel: {
    fontSize: '10px', fontWeight: '800', letterSpacing: '0.8px',
    textTransform: 'uppercase', color: 'var(--text-4)', margin: '0 0 4px',
  },
  blockTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--text-1)', margin: '0 0 3px' },
  blockText:  { fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.5', margin: 0 },
  stageNote: {
    display: 'flex', gap: '8px', alignItems: 'flex-start',
    background: 'rgba(82,183,136,0.08)', border: '1px solid rgba(82,183,136,0.3)',
    borderRadius: 'var(--r-sm)', padding: '10px 12px', marginTop: '10px',
  },
  stageText: { fontSize: '12px', color: 'var(--primary)', margin: 0, lineHeight: '1.5', fontWeight: '500' },
  caution: {
    display: 'flex', gap: '8px', alignItems: 'flex-start',
    background: '#FFF0F0', border: '1px solid #FECACA',
    borderRadius: 'var(--r-sm)', padding: '10px 12px', marginTop: '10px',
  },
  cautionText: { fontSize: '12px', color: '#C62828', margin: 0, lineHeight: '1.4' },
}

const harvestStyles = {
  title: {
    fontSize: '11px', fontWeight: '800', letterSpacing: '1px',
    textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '14px',
  },
  metaGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' },
  metaItem: { display: 'flex', flexDirection: 'column', gap: '3px' },
  metaLabel: {
    fontSize: '10px', fontWeight: '700', color: 'var(--text-4)',
    letterSpacing: '0.3px', textTransform: 'uppercase',
  },
  metaValue: { fontSize: '13px', color: 'var(--text-1)', fontWeight: '600', lineHeight: '1.4' },
  subLabel: {
    fontSize: '10px', fontWeight: '800', letterSpacing: '0.8px',
    textTransform: 'uppercase', color: 'var(--text-4)', margin: '0 0 8px',
  },
  cueList: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' },
  cueItem: { display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', color: 'var(--text-2)' },
  cueCheck: { color: '#0D9488', fontWeight: '700', flexShrink: 0 },
  infoRow: { display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px' },
  infoIcon: { fontSize: '15px', flexShrink: 0, marginTop: '1px' },
  infoText: { fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.5', margin: 0 },
  warning: {
    display: 'flex', gap: '8px', alignItems: 'flex-start',
    background: '#FFF0F0', border: '1px solid #FECACA',
    borderRadius: 'var(--r-sm)', padding: '10px 12px', marginTop: '14px',
  },
  warningText: { fontSize: '12px', color: '#C62828', margin: 0, lineHeight: '1.5' },
}

// ── Main styles ──────────────────────────────────────────────────────────────

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

  // Tab bar
  tabBar: {
    display: 'flex',
    background: 'var(--card)',
    borderRadius: 'var(--r-lg)',
    border: '1px solid var(--border)',
    padding: '4px',
    gap: '4px',
  },
  tabBtn: {
    flex: 1,
    padding: '10px 8px',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--r-md)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-3)',
    transition: 'color 0.2s, background 0.2s',
    letterSpacing: '0.2px',
  },
  tabBtnActive: {
    color: 'var(--primary)',
    background: 'var(--mist)',
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

  reminderNudge: {
    display: 'block',
    width: '100%',
    marginTop: '16px',
    padding: '11px 0',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-full)',
    color: 'var(--mid)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    textAlign: 'center',
    letterSpacing: '0.1px',
  },

  scheduleGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' },
  scheduleItem: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
    background: 'var(--mist)', borderRadius: 'var(--r-md)', padding: '14px 8px', textAlign: 'center',
  },
  scheduleIcon:  { fontSize: '22px' },
  scheduleLabel: { fontSize: '11px', fontWeight: '700', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.4px' },
  scheduleFreq:  { fontSize: '12px', color: 'var(--primary)', fontWeight: '600' },

  // Vital Signs
  vitalList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  vitalRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  vitalIcon: { fontSize: '16px', width: '20px', textAlign: 'center', flexShrink: 0 },
  vitalLabel: { fontSize: '13px', fontWeight: '600', color: 'var(--text-2)', width: '76px', flexShrink: 0 },
  vitalBarTrack: {
    flex: 1, height: '8px', background: 'var(--mist)',
    borderRadius: 'var(--r-full)', overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  vitalBarFill: { height: '100%', borderRadius: 'var(--r-full)', transition: 'width 0.6s ease' },
  vitalScore: { fontSize: '12px', fontWeight: '800', width: '28px', textAlign: 'right', flexShrink: 0 },

  // Environment
  envRow: { display: 'flex', gap: '12px', alignItems: 'flex-start' },
  envIcon: { fontSize: '18px', flexShrink: 0, marginTop: '1px' },
  envText: { fontSize: '14px', color: 'var(--text-2)', lineHeight: '1.6', margin: 0 },

  // Toxicity
  toxGrid: { display: 'flex', flexDirection: 'column', gap: '10px' },
  toxRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  toxIcon: { fontSize: '18px', width: '24px', textAlign: 'center', flexShrink: 0 },
  toxLabel: { fontSize: '13px', fontWeight: '600', color: 'var(--text-2)', width: '60px', flexShrink: 0 },
  toxValue: {
    flex: 1, fontSize: '12px', fontWeight: '600', lineHeight: '1.4',
    padding: '4px 10px', borderRadius: 'var(--r-sm)',
    border: '1px solid',
  },

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
  micBtn: {
    width: '40px', height: '40px', borderRadius: '50%',
    border: '1.5px solid var(--border)', background: 'var(--mist)',
    fontSize: '16px', cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'border-color 0.2s, background 0.2s',
  },
  micBtnActive: {
    borderColor: '#0D9488', background: 'rgba(13,148,136,0.1)',
    animation: 'voicePulse 1s ease-in-out infinite',
  },
  qaInputListening: { borderColor: '#0D9488', background: 'rgba(13,148,136,0.05)' },
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
