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
  
  // NEW: User Preferences State
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

  return (
    <div style={styles.appContainer}>
      <nav style={styles.nav}>
        <div style={styles.navLinks}>
          <button 
            onClick={handleReset} 
            style={{...styles.navLink, borderBottom: screen === 'upload' ? '2px solid #2d6a4f' : 'none'}}
          >
            Scan
          </button>
          <button 
            onClick={() => setScreen('history')} 
            style={{...styles.navLink, borderBottom: screen === 'history' ? '2px solid #2d6a4f' : 'none'}}
          >
            History
          </button>
        </div>
        
        {/* Settings Toggle */}
        <button onClick={() => setShowSettings(!showSettings)} style={styles.settingsToggle}>
          {preferences.language === 'English' ? '🌐 EN' : `🌐 ${preferences.language.substring(0,2).toUpperCase()}`}
        </button>
      </nav>

      {showSettings && (
        <div style={styles.settingsBar}>
          <span style={styles.settingsLabel}>Preferred Language:</span>
          {['English', 'Hindi', 'Tamil', 'Telugu'].map(lang => (
            <button 
              key={lang}
              onClick={() => { setPreferences({ ...preferences, language: lang }); setShowSettings(false); }}
              style={{
                ...styles.langBtn,
                background: preferences.language === lang ? '#2d6a4f' : 'transparent',
                color: preferences.language === lang ? '#fff' : '#2d6a4f'
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
            userLanguage={preferences.language} // Pass language to the upload flow
          />
        )}
        
        {screen === 'analysing' && (
          <AnalysingScreen logId={activeLogId} onResultReady={handleResultReady} />
        )}
        
        {screen === 'results' && (
          <ResultsScreen 
            result={result} 
            onReset={handleReset} 
            onBack={() => setScreen('history')} 
            allScans={historyContext} 
          />
        )}
        
        {screen === 'history' && (
          <HistoryScreen onSelectResult={(data, fullHistory) => {
            setResult(data)
            setHistoryContext(fullHistory)
            setScreen('results')
          }} />
        )}
      </main>
    </div>
  )
}

const styles = {
  appContainer: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8faf9' },
  nav: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    padding: '0 20px', 
    background: '#fff', 
    borderBottom: '1px solid #e8f5e9',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    height: '60px'
  },
  navLinks: { display: 'flex', gap: '30px', height: '100%' },
  navLink: { 
    background: 'none', 
    border: 'none', 
    color: '#2d6a4f', 
    fontWeight: '700', 
    cursor: 'pointer', 
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    padding: '0 5px',
    transition: 'all 0.2s'
  },
  settingsToggle: {
    background: '#f0f4f2',
    border: '1px solid #cbdad2',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: '800',
    color: '#2d6a4f',
    cursor: 'pointer'
  },
  settingsBar: {
    background: '#fff',
    padding: '12px 20px',
    borderBottom: '1px solid #e8f5e9',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  settingsLabel: { fontSize: '12px', fontWeight: '600', color: '#6a8378', marginRight: '10px' },
  langBtn: {
    padding: '4px 12px',
    borderRadius: '6px',
    border: '1px solid #2d6a4f',
    fontSize: '12px',
    cursor: 'pointer',
    transition: '0.2s'
  },
  mainContent: { flex: 1, display: 'flex', flexDirection: 'column' }
}