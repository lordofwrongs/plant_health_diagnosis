import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient.js'

const BUCKET = 'plant_images'

export default function UploadScreen({ onUploadComplete }) {
  const [previews, setPreviews] = useState([])
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const inputRef = useRef()
  const isProcessing = useRef(false)

  const handleFiles = (fileList) => {
    const selectedFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (selectedFiles.length === 0) return
    setFiles(selectedFiles)
    setPreviews(selectedFiles.map(f => URL.createObjectURL(f)))
    setError(null)
  }

  const getLocationContext = async () => {
    setStatusMessage('Syncing with satellites...')
    
    // Create a promise for the IP fallback (faster, but less accurate)
    const ipFallback = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/')
        const data = await res.json()
        return {
          lat: data.latitude, // IP providers usually give approximate lat/lng
          lng: data.longitude,
          name: `${data.city}, ${data.region}`
        }
      } catch {
        return { lat: null, lng: null, name: 'Unknown Location' }
      }
    }

    try {
      // Race the GPS against a 12-second timeout
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
        name: null // Lat/Lng is preferred for weather logic
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

    // 1. Innovative Context Gathering
    const context = await getLocationContext()

    // 2. Multi-File Processing
    setStatusMessage(`Uploading ${files.length} images...`)
    const guestId = localStorage.getItem('plant_care_guest_id')
    const createdIds = []

    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        // Storage Upload
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(fileName, file, { contentType: file.type })
        
        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
        const imageUrl = urlData.publicUrl

        // DB Logging - Strict use of 'status' per your setup
        const { data: logData, error: insertError } = await supabase
          .from('plant_logs')
          .insert({ 
            user_id: guestId, 
            image_url: imageUrl, 
            status: 'pending', 
            latitude: context.lat,
            longitude: context.lng,
            location_name: context.name
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
          Our AI uses local environmental data to diagnose your plant.
        </p>

        <div 
          style={{ ...styles.dropZone, ...(previews.length > 0 ? styles.dropZoneWithImage : {}) }}
          onClick={() => previews.length === 0 && !uploading && inputRef.current.click()}
        >
          {previews.length > 0 ? (
            <div style={styles.previewGrid}>
              {previews.map((src, i) => <img key={i} src={src} style={styles.miniPreview} alt="Preview" />)}
              {!uploading && (
                <button style={styles.changeBtn} onClick={(e) => { e.stopPropagation(); inputRef.current.click() }}>
                  Replace Images
                </button>
              )}
            </div>
          ) : (
            <div style={styles.dropContent}>
              <div style={styles.uploadIcon}><CameraIcon /></div>
              <p style={styles.dropText}>Tap to capture or upload</p>
              <p style={styles.dropSubtext}>We'll automatically sync local weather</p>
            </div>
          )}
        </div>

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
            files.length > 1 ? `Analyze ${files.length} Plants` : 'Analyze Plant'
          )}
        </button>
      </div>
      <div style={styles.bottomDecor}>
        <SmallLeaf delay="0s" /><SmallLeaf delay="0.3s" /><SmallLeaf delay="0.6s" />
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
  cardSubtitle: { fontSize: '14px', color: '#4a6358', marginBottom: '24px', lineHeight: '1.5' },
  dropZone: { border: '2px dashed #cbdad2', borderRadius: '16px', padding: '40px 20px', textAlign: 'center', cursor: 'pointer', background: '#fcfdfc', transition: 'all 0.2s ease' },
  dropZoneWithImage: { padding: '12px', border: '2px solid #52b788', background: '#fff' },
  previewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '12px' },
  miniPreview: { width: '100%', height: '80px', objectFit: 'cover', borderRadius: '10px' },
  changeBtn: { gridColumn: '1/-1', marginTop: '12px', background: '#f0f2f1', border: 'none', borderRadius: '20px', padding: '8px 16px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', color: '#2d6a4f' },
  submitBtn: { width: '100%', padding: '18px', background: 'linear-gradient(135deg, #2d6a4f, #52b788)', color: '#fff', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: '600', fontSize: '16px', marginTop: '10px', boxShadow: '0 4px 15px rgba(45,106,79,0.2)' },
  submitBtnDisabled: { opacity: 0.6, cursor: 'not-allowed', background: '#9eb8ad' },
  errorContainer: { color: '#d32f2f', fontSize: '13px', marginBottom: '15px', textAlign: 'center', background: '#ffebee', padding: '10px', borderRadius: '8px' },
  loaderText: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', animation: 'pulse 1.5s infinite' },
  bottomDecor: { display: 'flex', gap: '16px', marginTop: '32px' }
}

function LeafIcon() { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="#52b788" stroke="#2d6a4f" strokeWidth="1.5"/></svg> }
function CameraIcon() { return <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="#52b788" strokeWidth="1.5"/></svg> }
function SmallLeaf({ delay }) { return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2, animation: `bounce 2s infinite ${delay}` }}><path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="#52b788"/></svg> }