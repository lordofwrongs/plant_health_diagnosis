import { useState } from 'react'
import UploadScreen from './components/UploadScreen.jsx'
import AnalysingScreen from './components/AnalysingScreen.jsx'
import ResultsScreen from './components/ResultsScreen.jsx'

export default function App() {
  const [screen, setScreen] = useState('upload') // 'upload' | 'analysing' | 'results'
  const [logId, setLogId] = useState(null)
  const [result, setResult] = useState(null)

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
      {screen === 'upload' && (
        <UploadScreen onUploadComplete={handleUploadComplete} />
      )}
      {screen === 'analysing' && (
        <AnalysingScreen logId={logId} onResultReady={handleResultReady} />
      )}
      {screen === 'results' && (
        <ResultsScreen result={result} onReset={handleReset} />
      )}
    </div>
  )
}
