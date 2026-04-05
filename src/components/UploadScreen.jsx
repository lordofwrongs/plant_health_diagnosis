import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient.js'

const BUCKET = 'plant_images'

export default function UploadScreen({ onUploadComplete, userLanguage }) {
  const [previews, setPreviews] = useState([])
  const [files, setFiles] = useState([])
  const [nickname, setNickname] = useState('') 
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const inputRef = useRef()
  const isProcessing = useRef(false)

  const handleFiles = (fileList) => {
    const selectedFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (selectedFiles.length === 0) return
    
    // Append new files to existing ones to support multiple "taps" of the camera
    setFiles(prev => [...prev, ...selectedFiles])
    setPreviews(prev => [...prev, ...selectedFiles.map(f => URL.createObjectURL(f))])
    setError(null)
  }

  const getLocationContext = async () => {
    setStatusMessage('Syncing with satellites...')
    
    const ipFallback = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/')
        const data = await res.json()
        return {
          lat: data.latitude,
          lng: data.longitude,
          name: `${data.city}, ${data.region}`
        }
      } catch {
        return { lat: null, lng: null, name: 'Unknown Location' }
      }
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0
        })
      })
      
      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        name: null 
      }
    } catch (err) {
      console.warn("GPS timeout or denied, using IP fallback context")
      setStatusMessage('Using approximate location...')
      return await ipFallback()
    }
  }

  const handleSubmit = async () => {
    if (files.length === 0 || uploading || isProcessing.current) return
    
    isProcessing.current = true
    setUploading(true)
    setError(null)

    const context = await getLocationContext()
    setStatusMessage(`Uploading ${files.length} images...`)
    const guestId = localStorage.getItem('plant_care_guest_id')
    const createdIds = []

    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(fileName, file, { contentType: file.type })
        
        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
        const imageUrl = urlData.publicUrl

        const { data: logData, error: insertError } = await supabase
          .from('plant_logs')
          .insert({ 
            user_id: guestId, 
            image_url: imageUrl, 
            status: 'pending', 
            latitude: context.lat,
            longitude: context.lng,
            location_name: context.name,
            plant_nickname: nickname || null,
            preferred_language: userLanguage || 'English'
          })
          .select('id').single()

        if (insertError) throw insertError
        createdIds.push(logData.id)
      }
      
      onUploadComplete(createdIds)
    } catch (err) {
      console.error("System Failure:", err)
      setError('Connection interrupted. Please try again.')
      setUploading(false)
      isProcessing.current = false
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.logo}><LeafIcon /><span style={styles.logoText}>PlantCare</span></div>
        <p style={styles.tagline}>AI-Powered Botanical Intelligence</p>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Analyze Health</h2>
        <p style={styles.cardSubtitle}>
          Upload multiple photos for a better diagnosis. We'll use local weather and <strong>{userLanguage}</strong> for the report.
        </p>

        <div style={styles.inputWrapper}>
          <label style={styles.label}>Identify this plant (optional)</label>
          <input 
            type="text" 
            placeholder="e.g. Backyard Tomato" 
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            style={styles.input}
            disabled={uploading}
          />
        </div>

        <div 
          style={{ ...styles.dropZone, ...(previews.length > 0 ? styles.dropZoneWithImage : {}) }}
          onClick={() => !uploading && inputRef.current.click()}
        >
          {previews.length > 0 ? (
            <div style={styles.previewGrid}>
              {previews.map((src, i) => (
                <div key={i} style={styles.previewContainer}>
                  <img src={src} style={styles.miniPreview} alt="Preview" />
                </div>
              ))}
              <div style={styles.addMoreCircle}>
                <span style={{ fontSize: '24px', color: '#2d6a4f' }}>+</span>
              </div>
            </div>
          ) : (
            <div style={styles.dropContent}>
              <div style={styles.uploadIcon}><CameraIcon /></div>
              <p style={styles.dropText}>Tap to take photo or browse</p>
              <p style={styles.dropSubtext}>Supports multiple images</p>
            </div>
          )}
        </div>

        {/* PM FIX: Restored 'multiple' and removed 'capture' to allow Gallery access and Multi-selection */}
        <input 
          ref={inputRef} 
          type="file" 
          accept="image/*" 
          multiple 
          style={{ display: 'none' }} 
          onChange={(e) => handleFiles(e.target.files)} 
        />
        
        {error && <div style={styles.errorContainer}>{error}</div>}

        <button 
          style={{ ...styles.submitBtn, ...((files.length === 0 || uploading) ? styles.submitBtnDisabled : {}) }}
          onClick={handleSubmit} 
          disabled={files.length === 0 || uploading}
        >
          {uploading ? (
            <span style={styles.loaderText}>{statusMessage}</span>
          ) : (
            `Analyze ${files.length > 0 ? files.length : ''} Plant${files.length > 1 ? 's' : ''}`
          )}
        </button>
        
        {files.length > 0 && !uploading && (
          <button 
            style={styles.clearBtn} 
            onClick={() => { setFiles([]); setPreviews([]); }}
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: 'calc(100vh - 60px)', background: 'linear-gradient(160deg, #f0faf4 0%, #faf8f3 60%, #e8f5e9 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' },
  header: { textAlign: 'center', marginBottom: '32px' },
  logo: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' },
  logoText: { fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: '600', color: '#1a3a2a' },
  tagline: { fontSize: '14px', color: '#4a6358', letterSpacing: '0.5px' },
  card: { background: '#fff', borderRadius: '24px', padding: '32px 28px', width: '100%', maxWidth: '440px', boxShadow: '0 12px 48px rgba(26,58,42,0.08)' },
  cardTitle: { fontFamily: "'Playfair Display', serif", fontSize: '24px', color: '#1a3a2a', marginBottom: '8px' },
  cardSubtitle: { fontSize: '13px', color: '#4a6358', marginBottom: '24px', lineHeight: '1.5' },
  inputWrapper: { marginBottom: '20px', textAlign: 'left' },
  label: { fontSize: '12px', fontWeight: '600', color: '#2d6a4f', marginBottom: '6px', display: 'block' },
  input: { width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e0e6e3', fontSize: '14px', outline: 'none', background: '#fcfdfc' },
  dropZone: { border: '2px dashed #cbdad2', borderRadius: '16px', padding: '30px 20px', textAlign: 'center', cursor: 'pointer', background: '#fcfdfc', transition: 'all 0.2s ease', minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dropZoneWithImage: { padding: '16px', border: '2px solid #52b788', background: '#fff' },
  previewGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', width: '100%' },
  previewContainer: { position: 'relative' },
  miniPreview: { width: '100%', height: '80px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #e0e6e3' },
  addMoreCircle: { height: '80px', borderRadius: '10px', border: '2px dashed #cbdad2', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fbf9' },
  submitBtn: { width: '100%', padding: '18px', background: 'linear-gradient(135deg, #2d6a4f, #52b788)', color: '#fff', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: '600', fontSize: '16px', marginTop: '16px', boxShadow: '0 4px 15px rgba(45,106,79,0.2)' },
  submitBtnDisabled: { opacity: 0.6, cursor: 'not-allowed', background: '#9eb8ad' },
  clearBtn: { width: '100%', background: 'none', border: 'none', color: '#8aaa96', fontSize: '12px', marginTop: '12px', cursor: 'pointer', textDecoration: 'underline' },
  errorContainer: { color: '#d32f2f', fontSize: '13px', margin: '15px 0', textAlign: 'center', background: '#ffebee', padding: '10px', borderRadius: '8px' },
  loaderText: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }
}

function LeafIcon() { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="#52b788" stroke="#2d6a4f" strokeWidth="1.5"/></svg> }
function CameraIcon() { return <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="#52b788" strokeWidth="1.5"/></svg> }