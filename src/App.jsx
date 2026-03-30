import { useState, useEffect } from 'react'
import UploadScreen from './components/UploadScreen.jsx'
import AnalysingScreen from './components/AnalysingScreen.jsx'
import ResultsScreen from './components/ResultsScreen.jsx'
import HistoryScreen from './components/HistoryScreen.jsx'

export default function App() {
  const [screen, setScreen] = useState('upload') // 'upload' | 'analysing' | 'results' | 'history'
  const [logId, setLogId] = useState(null)
  const [result, setResult] = useState(null)

  // Initialize a Guest ID for history tracking if it doesn't exist
  useEffect(() => {
    if (!localStorage.getItem('plant_care_guest_id')) {
      localStorage.setItem('plant_care_guest_id', `guest_${Math.random().toString(36).slice(2, 11)}`)
    }
  }, [])

  const handleUploadComplete = (id) => {
    setLogId(id)
    setScreen('analysing')
  }

  const handleResultReady = (data) => {
    setResult(data)
    setScreen('results')
  }

  const handleReset = () => {
    setLogId(null)
    setResult(null)
    setScreen('upload')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={navStyles}>
        <button onClick={handleReset} style={navBtn}>Home</button>
        <button onClick={() => setScreen('history')} style={navBtn}>History</button>
      </nav>

      {screen === 'upload' && (
        <UploadScreen onUploadComplete={handleUploadComplete} />
      )}
      {screen === 'analysing' && (
        <AnalysingScreen logId={logId} onResultReady={handleResultReady} />
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

const navStyles = {
  display: 'flex',
  justifyContent: 'center',
  gap: '20px',
  padding: '15px',
  background: '#fff',
  borderBottom: '1px solid #eee'
}

const navBtn = {
  background: 'none',
  border: 'none',
  color: '#2d6a4f',
  cursor: 'pointer',
  fontWeight: '500'
}