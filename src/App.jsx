import { useState, useEffect } from 'react'
import UploadScreen from './components/UploadScreen.jsx'
import AnalysingScreen from './components/AnalysingScreen.jsx'
import ResultsScreen from './components/ResultsScreen.jsx'
import HistoryScreen from './components/HistoryScreen.jsx'

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

  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem('plant_care_prefs')
    return saved ? JSON.parse(saved) : { language: 'English' }
  })
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('plant_care_guest_id')) {
      localStorage.setItem('plant_care_guest_id', `guest_${Math.random().toString(36).slice(2, 11)}`)
    }
  }, [])

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
  }

  const handleReset = () => {
    setActiveLogId(null)
    setResult(null)
    setHistoryContext([])
    setScreen('upload')
  }

  const handleAnalysisError = () => {
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
            style={{ ...styles.navTab, ...(screen === 'history' || screen === 'results' ? styles.navTabActive : {}) }}
          >
            Garden
            {(screen === 'history' || screen === 'results') && <span style={styles.tabDot} />}
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
            onBack={() => setScreen('history')}
            allScans={historyContext}
            onSelectScan={(scan) => setResult(scan)}
          />
        )}

        {screen === 'history' && (
          <HistoryScreen
            onSelectResult={(data, fullHistory) => {
              setResult(data)
              setHistoryContext(fullHistory)
              setScreen('results')
            }}
            onRetakePhoto={handleReset}
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
