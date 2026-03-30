import { useState, useEffect } from 'react'
import UploadScreen from './components/UploadScreen.jsx'
import AnalysingScreen from './components/AnalysingScreen.jsx'
import ResultsScreen from './components/ResultsScreen.jsx'
import HistoryScreen from './components/HistoryScreen.jsx'

export default function App() {
  const [screen, setScreen] = useState('upload') // 'upload' | 'analysing' | 'results' | 'history'
  const [activeLogId, setActiveLogId] = useState(null)
  const [result, setResult] = useState(null)

  // Initialize a Guest ID for history tracking
  useEffect(() => {
    if (!localStorage.getItem('plant_care_guest_id')) {
      localStorage.setItem('plant_care_guest_id', `guest_${Math.random().toString(36).slice(2, 11)}`)
    }
  }, [])

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
    setScreen('results')
  }

  const handleReset = () => {
    setActiveLogId(null)
    setResult(null)
    setScreen('upload')
  }

  return (
    <div style={styles.appContainer}>
      <nav style={styles.nav}>
        <button onClick={handleReset} style={styles.navLink}>Scan</button>
        <button onClick={() => setScreen('history')} style={styles.navLink}>History</button>
      </nav>

      {screen === 'upload' && (
        <UploadScreen onUploadComplete={handleUploadComplete} />
      )}
      {screen === 'analysing' && (
        <AnalysingScreen logId={activeLogId} onResultReady={handleResultReady} />
      )}
      {screen === 'results' && (
        <ResultsScreen result={result} onReset={handleReset} />
      )}
      {screen === 'history' && (
        <HistoryScreen onSelectResult={(data) => {
          setResult(data)
          setScreen('results')
        }} />
      )}
    </div>
  )
}

const styles = {
  appContainer: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f0faf4' },
  nav: { 
    display: 'flex', 
    justifyContent: 'center', 
    gap: '30px', 
    padding: '15px', 
    background: '#fff', 
    borderBottom: '1px solid #e8f5e9',
    position: 'sticky',
    top: 0,
    zIndex: 10
  },
  navLink: { background: 'none', border: 'none', color: '#2d6a4f', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }
}