import { useState, useEffect, useCallback, useRef } from 'react'
import UploadScreen from './components/UploadScreen.jsx'
import AnalysingScreen from './components/AnalysingScreen.jsx'
import ResultsScreen from './components/ResultsScreen.jsx'
import HistoryScreen from './components/HistoryScreen.jsx'
import PlantDetailScreen from './components/PlantDetailScreen.jsx'
import RegisterModal from './components/RegisterModal.jsx'
import { supabase } from './supabaseClient.js'
import { track, identify } from './utils/analytics.js'

// ── BotanIQ logo mark + wordmark ─────────────────────────────────────────────
function BotanIQMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#1B4332" />
      <path d="M20 33C13 33 8 26.5 8 20C8 20 15 12 25 14.5C27.5 19.5 25 27 20 33Z" fill="#52B788" />
      <path d="M20 33C20 33 17 27 19 20.5" stroke="#95D5B2" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="27" cy="13" r="2.5" fill="#95D5B2" opacity="0.6" />
    </svg>
  )
}

export default function App() {
  const [screen, setScreen] = useState('upload')
  const [activeLogId, setActiveLogId] = useState(null)
  const [result, setResult] = useState(null)
  const [historyContext, setHistoryContext] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null)

  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const celebrationTimerRef = useRef(null)

  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem('plant_care_prefs')
    return saved ? JSON.parse(saved) : { language: 'English' }
  })
  const [showSettings, setShowSettings] = useState(false)

  // Ensure guest_id exists for anonymous users
  useEffect(() => {
    if (!localStorage.getItem('plant_care_guest_id')) {
      localStorage.setItem('plant_care_guest_id', `guest_${Math.random().toString(36).slice(2, 11)}`)
    }
  }, [])

  useEffect(() => {
    track('app_opened', { is_returning: !!localStorage.getItem('botaniq_first_scan') })
  }, [])

  // Handle Supabase Auth session — fires on magic link callback and on returning visits
  const handleAuthSession = useCallback(async (session) => {
    const user    = session.user
    const authId  = user.id
    const guestId = localStorage.getItem('plant_care_guest_id')

    // Skip if this auth user is already the active identity (e.g. token refresh)
    if (guestId === authId) return

    // Migrate guest plant_logs to the authenticated user id
    if (guestId && guestId !== authId) {
      await supabase.rpc('migrate_guest_to_user', {
        p_guest_id: guestId,
        p_user_id:  authId,
      })
    }

    // From now on all scans are recorded under the auth user id
    localStorage.setItem('plant_care_guest_id', authId)

    // Persist user profile (name/phone come from magic link metadata)
    const meta = user.user_metadata ?? {}
    await supabase.from('user_profiles').upsert({
      id:         authId,
      email:      user.email,
      first_name: meta.first_name ?? null,
      last_name:  meta.last_name  ?? null,
      phone:      meta.phone      ?? null,
      guest_id:   guestId !== authId ? guestId : null,
    }, { onConflict: 'id' })

    identify(authId, { email: user.email })
    if (!localStorage.getItem('botaniq_registered')) track('register_completed')
    localStorage.setItem('botaniq_registered', 'true')
    setShowRegisterModal(false)
  }, [])

  useEffect(() => {
    // Restore session on load (handles magic link redirect and returning users)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleAuthSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        handleAuthSession(session)
      }
    })

    return () => subscription.unsubscribe()
  }, [handleAuthSession])

  useEffect(() => {
    localStorage.setItem('plant_care_prefs', JSON.stringify(preferences))
  }, [preferences])

  const handleUploadComplete = (ids) => {
    if (ids.length === 1) {
      setActiveLogId(ids[0])
      setScreen('analysing')
    } else {
      setScreen('history')
    }
  }

  const handleResultReady = (data) => {
    setResult(data)
    setHistoryContext([])
    setScreen('results')
    track('analysis_complete', {
      plant_name: data.PlantName,
      accuracy_score: data.AccuracyScore,
      health_status: data.HealthStatus,
      is_first_scan: !localStorage.getItem('botaniq_first_scan'),
    })

    const isFirst = !localStorage.getItem('botaniq_first_scan')
    if (isFirst) {
      localStorage.setItem('botaniq_first_scan', 'done')
      setShowCelebration(true)
      celebrationTimerRef.current = setTimeout(() => {
        setShowCelebration(false)
        if (!localStorage.getItem('botaniq_registered')) {
          track('register_modal_shown', { trigger: 'first_scan' })
          setShowRegisterModal(true)
        }
      }, 3500)
    } else if (!localStorage.getItem('botaniq_registered')) {
      track('register_modal_shown', { trigger: 'repeat' })
      setShowRegisterModal(true)
    }
  }

  const handleReset = () => {
    setActiveLogId(null)
    setResult(null)
    setHistoryContext([])
    setSelectedGroup(null)
    setScreen('upload')
  }

  const handleAnalysisError = () => {
    track('analysis_failed')
    setActiveLogId(null)
    setResult(null)
    setScreen('upload')
  }

  const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu']

  return (
    <div style={styles.appContainer}>
      {/* ── Navigation ──────────────────────────────────────── */}
      <nav style={styles.nav}>
        {/* Logo */}
        <button onClick={handleReset} style={styles.logoBtn} aria-label="BotanIQ home">
          <BotanIQMark size={34} />
          <span style={styles.wordmark}>Botan<span style={styles.wordmarkIQ}>IQ</span></span>
        </button>

        {/* Centre tabs */}
        <div style={styles.navTabs}>
          <button
            onClick={handleReset}
            style={{ ...styles.navTab, ...(screen === 'upload' || screen === 'analysing' ? styles.navTabActive : {}) }}
          >
            Scan
            {(screen === 'upload' || screen === 'analysing') && <span style={styles.tabDot} />}
          </button>
          <button
            onClick={() => setScreen('history')}
            style={{ ...styles.navTab, ...(screen === 'history' || screen === 'results' || screen === 'plant_detail' ? styles.navTabActive : {}) }}
          >
            Garden
            {(screen === 'history' || screen === 'results' || screen === 'plant_detail') && <span style={styles.tabDot} />}
          </button>
        </div>

        {/* Language selector */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowSettings(!showSettings)} style={styles.langToggle}>
            <span style={styles.globeIcon}>🌐</span>
            <span style={styles.langCode}>
              {preferences.language === 'English' ? 'EN' : preferences.language.slice(0, 2).toUpperCase()}
            </span>
          </button>

          {showSettings && (
            <div style={styles.langDropdown}>
              <p style={styles.langDropdownLabel}>Display language</p>
              {LANGUAGES.map(lang => (
                <button
                  key={lang}
                  onClick={() => { setPreferences({ ...preferences, language: lang }); setShowSettings(false) }}
                  style={{
                    ...styles.langOption,
                    ...(preferences.language === lang ? styles.langOptionActive : {}),
                  }}
                >
                  {lang}
                  {preferences.language === lang && <span style={styles.langCheck}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* ── First-scan celebration ──────────────────────────── */}
      {showCelebration && (
        <div
          onClick={() => {
            clearTimeout(celebrationTimerRef.current)
            setShowCelebration(false)
            if (!localStorage.getItem('botaniq_registered')) {
              track('register_modal_shown', { trigger: 'first_scan' })
              setShowRegisterModal(true)
            }
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 600,
            background: 'rgba(10,31,20,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          {/* Floating leaf particles */}
          {[
            { top: '78%', left: '8%',  size: 30, delay: 0,    dur: 2.8 },
            { top: '82%', left: '22%', size: 22, delay: 0.25, dur: 3.2 },
            { top: '74%', left: '48%', size: 38, delay: 0.1,  dur: 2.6 },
            { top: '86%', left: '63%', size: 26, delay: 0.45, dur: 3.0 },
            { top: '80%', left: '78%', size: 20, delay: 0.15, dur: 2.9 },
            { top: '88%', left: '38%', size: 24, delay: 0.35, dur: 3.1 },
          ].map(({ top, left, size, delay, dur }, i) => (
            <span key={i} aria-hidden="true" style={{
              position: 'absolute', top, left, fontSize: size,
              animation: `floatUp ${dur}s ease-out ${delay}s both`,
              pointerEvents: 'none', userSelect: 'none',
            }}>🌿</span>
          ))}

          {/* Main card */}
          <div style={{
            background: 'var(--card)',
            borderRadius: 'var(--r-xl)',
            padding: '40px 32px 32px',
            textAlign: 'center',
            maxWidth: '320px',
            width: '90%',
            animation: 'celebPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
            boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
            position: 'relative',
          }}>
            <div style={{ fontSize: '56px', marginBottom: '6px', animation: 'leafSway 1.4s ease-in-out infinite' }}>🌿</div>
            <p style={{
              fontSize: '10px', fontWeight: '800', letterSpacing: '1.5px',
              textTransform: 'uppercase', color: 'var(--leaf)', marginBottom: '10px',
            }}>First scan complete</p>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '26px', fontWeight: '700', color: 'var(--text-1)',
              lineHeight: '1.25', marginBottom: '12px',
            }}>
              {result?.PlantName ? `Meet your ${result.PlantName}!` : 'Welcome to your garden!'}
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-3)', lineHeight: '1.65', marginBottom: '28px' }}>
              Species identified, health assessed, and a personalised care plan is ready for you.
            </p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'var(--primary)', color: '#fff',
              borderRadius: 'var(--r-full)', padding: '13px 28px',
              fontSize: '14px', fontWeight: '700',
              boxShadow: '0 4px 16px rgba(27,67,50,0.25)',
            }}>
              See your results →
            </div>
          </div>
        </div>
      )}

      {/* ── Registration modal ──────────────────────────────── */}
      {showRegisterModal && (
        <RegisterModal
          onComplete={() => setShowRegisterModal(false)}
          onSkip={() => { track('register_skipped'); setShowRegisterModal(false) }}
        />
      )}

      {/* ── Screens ─────────────────────────────────────────── */}
      <main style={styles.mainContent}>
        {screen === 'upload' && (
          <UploadScreen onUploadComplete={handleUploadComplete} userLanguage={preferences.language} />
        )}

        {screen === 'analysing' && (
          <AnalysingScreen logId={activeLogId} onResultReady={handleResultReady} onError={handleAnalysisError} />
        )}

        {screen === 'results' && (
          <ResultsScreen
            result={result}
            userLanguage={preferences.language}
            onReset={handleReset}
            onBack={() => setScreen(selectedGroup ? 'plant_detail' : 'history')}
            allScans={historyContext}
            onSelectScan={(scan) => setResult(scan)}
          />
        )}

        {screen === 'history' && (
          <HistoryScreen
            onSelectPlant={(group) => {
              setSelectedGroup(group)
              setScreen('plant_detail')
            }}
            onRetakePhoto={handleReset}
          />
        )}

        {screen === 'plant_detail' && selectedGroup && (
          <PlantDetailScreen
            group={selectedGroup}
            onBack={() => setScreen('history')}
            onSelectScan={(scan, allScans) => {
              setResult(scan)
              setHistoryContext(allScans)
              setScreen('results')
            }}
            onRetakePhoto={handleReset}
            onGroupDeleted={() => {
              setSelectedGroup(null)
              setScreen('history')
            }}
          />
        )}
      </main>
    </div>
  )
}

const styles = {
  appContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg)',
    fontFamily: "'DM Sans', -apple-system, sans-serif",
  },

  // ── Nav ──────────────────────────────────────────────────
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: '62px',
    background: '#fff',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    zIndex: 200,
    boxShadow: 'var(--shadow-xs)',
  },

  logoBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },
  wordmark: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--primary)',
    letterSpacing: '-0.3px',
  },
  wordmarkIQ: {
    color: 'var(--leaf)',
    fontStyle: 'italic',
  },

  navTabs: {
    display: 'flex',
    gap: '4px',
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  navTab: {
    position: 'relative',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-3)',
    padding: '8px 16px',
    borderRadius: 'var(--r-full)',
    letterSpacing: '0.3px',
    transition: 'color 0.2s, background 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
  },
  navTabActive: {
    color: 'var(--primary)',
    background: 'var(--mist)',
  },
  tabDot: {
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    background: 'var(--leaf)',
    display: 'block',
  },

  langToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    background: 'var(--mist)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-full)',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    color: 'var(--primary)',
  },
  globeIcon: { fontSize: '14px' },
  langCode: { fontWeight: '700', letterSpacing: '0.5px' },

  langDropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    background: '#fff',
    borderRadius: 'var(--r-md)',
    boxShadow: 'var(--shadow-lg)',
    padding: '12px 8px',
    minWidth: '160px',
    zIndex: 300,
    border: '1px solid var(--border)',
  },
  langDropdownLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-4)',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    padding: '0 8px 8px',
    borderBottom: '1px solid var(--border)',
    marginBottom: '6px',
  },
  langOption: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '9px 12px',
    borderRadius: 'var(--r-sm)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    color: 'var(--text-2)',
    fontWeight: '500',
    textAlign: 'left',
    transition: 'background 0.15s',
  },
  langOptionActive: {
    background: 'var(--mist)',
    color: 'var(--primary)',
    fontWeight: '700',
  },
  langCheck: { color: 'var(--leaf)', fontWeight: '900', fontSize: '13px' },

  mainContent: { flex: 1, display: 'flex', flexDirection: 'column' },
}
