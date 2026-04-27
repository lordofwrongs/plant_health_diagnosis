import { useState, useEffect } from 'react'
import UploadScreen from './components/UploadScreen.jsx'
import AnalysingScreen from './components/AnalysingScreen.jsx'
import ResultsScreen from './components/ResultsScreen.jsx'
import HistoryScreen from './components/HistoryScreen.jsx'

export default function App() {
  const [screen, setScreen] = useState('upload') 
  const [activeLogId, setActiveLogId] = useState(null)
  const [result, setResult] = useState(null)
  const [historyContext, setHistoryContext] = useState([])
  
  // Initialize Preferences from LocalStorage
  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem('plant_care_prefs')
    return saved ? JSON.parse(saved) : { language: 'English' }
  })
  const [showSettings, setShowSettings] = useState(false)

  // Set Guest ID for tracking
  useEffect(() => {
    if (!localStorage.getItem('plant_care_guest_id')) {
      localStorage.setItem('plant_care_guest_id', `guest_${Math.random().toString(36).slice(2, 11)}`)
    }
  }, [])

  // Sync Preferences to LocalStorage
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

  // Called by AnalysingScreen when backend returns an error or times out
  const handleAnalysisError = () => {
    setActiveLogId(null)
    setResult(null)
    setScreen('upload')
  }

  return (
    <div style={styles.appContainer}>
      <nav style={styles.nav}>
        <div style={styles.navLinks}>
          <button 
            onClick={handleReset} 
            style={{...styles.navLink, borderBottom: screen === 'upload' ? '3px solid #2d6a4f' : 'none'}}
          >
            Scan
          </button>
          <button 
            onClick={() => setScreen('history')} 
            style={{...styles.navLink, borderBottom: screen === 'history' ? '3px solid #2d6a4f' : 'none'}}
          >
            History
          </button>
        </div>
        
        {/* Language Toggle */}
        <button onClick={() => setShowSettings(!showSettings)} style={styles.settingsToggle}>
          🌐 {preferences.language === 'English' ? 'EN' : preferences.language.substring(0, 2).toUpperCase()}
        </button>
      </nav>

      {/* Language Selection Bar */}
      {showSettings && (
        <div style={styles.settingsBar}>
          <span style={styles.settingsLabel}>Preferred Language:</span>
          {['English', 'Hindi', 'Tamil', 'Telugu'].map(lang => (
            <button 
              key={lang}
              onClick={() => { 
                setPreferences({ ...preferences, language: lang }); 
                setShowSettings(false); 
              }}
              style={{
                ...styles.langBtn,
                background: preferences.language === lang ? '#2d6a4f' : '#f0f4f2',
                color: preferences.language === lang ? '#fff' : '#2d6a4f',
                border: preferences.language === lang ? '1px solid #2d6a4f' : '1px solid #cbdad2'
              }}
            >
              {lang}
            </button>
          ))}
        </div>
      )}

      <main style={styles.mainContent}>
        {screen === 'upload' && (
          <UploadScreen 
            onUploadComplete={handleUploadComplete} 
            userLanguage={preferences.language} // <--- PASSING TO SUPABASE INSERT
          />
        )}
        
        {screen === 'analysing' && (
          <AnalysingScreen
            logId={activeLogId}
            onResultReady={handleResultReady}
            onError={handleAnalysisError}
          />
        )}
        
        {screen === 'results' && (
          <ResultsScreen 
            result={result} 
            userLanguage={preferences.language} // <--- PASSING FOR DISPLAY
            onReset={handleReset} 
            onBack={() => setScreen('history')} 
            allScans={historyContext} 
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
    background: '#f8faf9',
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  nav: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    padding: '0 24px', 
    background: '#fff', 
    borderBottom: '1px solid #e8f5e9',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    height: '64px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
  },
  navLinks: { 
    display: 'flex', 
    gap: '24px', 
    height: '100%' 
  },
  navLink: { 
    background: 'none', 
    border: 'none', 
    color: '#2d6a4f', 
    fontWeight: '700', 
    cursor: 'pointer', 
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    padding: '0 4px',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center'
  },
  settingsToggle: {
    background: '#2d6a4f',
    color: '#ffffff',
    border: 'none',
    borderRadius: '20px',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(45, 106, 79, 0.2)',
    transition: 'transform 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  settingsBar: {
    background: '#fff',
    padding: '16px 24px',
    borderBottom: '1px solid #e8f5e9',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap'
  },
  settingsLabel: { 
    fontSize: '12px', 
    fontWeight: '700', 
    color: '#4a6358', 
    marginRight: '8px' 
  },
  langBtn: {
    padding: '6px 16px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  mainContent: { flex: 1, display: 'flex', flexDirection: 'column' }
}