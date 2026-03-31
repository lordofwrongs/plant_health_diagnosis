import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient.js'

const BUCKET = 'plant_images'

export default function UploadScreen({ onUploadComplete }) {
  const [previews, setPreviews] = useState([])
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef()
  // Prevents double-taps on the button
  const isProcessing = useRef(false)

  const handleFiles = (fileList) => {
    const selectedFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (selectedFiles.length === 0) return
    setFiles(selectedFiles)
    setPreviews(selectedFiles.map(f => URL.createObjectURL(f)))
    setError(null)
  }

  const handleSubmit = async () => {
    if (files.length === 0 || uploading || isProcessing.current) return
    
    isProcessing.current = true
    setUploading(true)
    setError(null)

    let lat = null
    let lng = null
    let locName = null

    try {
      // 1. Wrap Geolocation in a Promise to ensure sequential execution
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { 
          timeout: 6000, 
          enableHighAccuracy: false 
        })
      })
      lat = position.coords.latitude
      lng = position.coords.longitude
    } catch (geoErr) {
      // 2. Fallback: IP-based location if GPS fails or is denied
      try {
        const response = await fetch('https://ipapi.co/json/')
        const data = await response.json()
        locName = data.city && data.region ? `${data.city}, ${data.region}` : null
      } catch (ipErr) {
        console.warn("Location services unavailable")
      }
    }

    // 3. Trigger the upload exactly once with the gathered context
    await proceedWithUpload(lat, lng, locName)
  }

  const proceedWithUpload = async (lat, lng, locName) => {
    const guestId = localStorage.getItem('plant_care_guest_id')
    const createdIds = []

    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        // Upload to Storage
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(fileName, file, { contentType: file.type })
        
        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
        const imageUrl = urlData.publicUrl

        // Create Database Record
        const { data: logData, error: insertError } = await supabase
          .from('plant_logs')
          .insert({ 
            user_id: guestId, 
            image_url: imageUrl, 
            status: 'pending',
            latitude: lat,
            longitude: lng,
            location_name: locName
          })
          .select('id').single()

        if (insertError) throw insertError
        createdIds.push(logData.id)
      }
      onUploadComplete(createdIds)
    } catch (err) {
      console.error(err)
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      isProcessing.current = false
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.logo}><LeafIcon /><span style={styles.logoText}>PlantCare</span></div>
        <p style={styles.tagline}>Local expert plant health diagnosis</p>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Scan your plants</h2>
        <p style={styles.cardSubtitle}>Photos will be analyzed based on your local climate.</p>

        <div style={{ ...styles.dropZone, ...(previews.length > 0 ? styles.dropZoneWithImage : {}) }}
             onClick={() => previews.length === 0 && !uploading && inputRef.current.click()}>
          {previews.length > 0 ? (
            <div style={styles.previewGrid}>
              {previews.map((src, i) => <img key={i} src={src} style={styles.miniPreview} alt="Preview" />)}
              {!uploading && (
                <button style={styles.changeBtn} onClick={(e) => { e.stopPropagation(); inputRef.current.click() }}>
                  Add/Change
                </button>
              )}
            </div>
          ) : (
            <div style={styles.dropContent}>
              <div style={styles.uploadIcon}><CameraIcon /></div>
              <p style={styles.dropText}>Tap to take photos or upload</p>
              <p style={styles.dropSubtext}>Location context will be added automatically</p>
            </div>
          )}
        </div>

        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
        {error && <p style={styles.error}>{error}</p>}

        <button style={{ ...styles.submitBtn, ...((files.length === 0 || uploading) ? styles.submitBtnDisabled : {}) }}
                onClick={handleSubmit} disabled={files.length === 0 || uploading}>
          {uploading ? 'Gathering Context...' : files.length > 1 ? `Analyse ${files.length} Plants` : 'Analyse Plant'}
        </button>
      </div>
      <div style={styles.bottomDecor}><SmallLeaf delay="0s" /><SmallLeaf delay="0.3s" /><SmallLeaf delay="0.6s" /></div>
    </div>
  )
}

const styles = {
  page: { minHeight: 'calc(100vh - 60px)', background: 'linear-gradient(160deg, #f0faf4 0%, #faf8f3 60%, #e8f5e9 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' },
  header: { textAlign: 'center', marginBottom: '32px' },
  logo: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' },
  logoText: { fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: '600', color: '#1a3a2a' },
  tagline: { fontSize: '14px', color: '#4a6358' },
  card: { background: '#fff', borderRadius: '20px', padding: '32px 28px', width: '100%', maxWidth: '440px', boxShadow: '0 8px 40px rgba(26,58,42,0.1)' },
  cardTitle: { fontFamily: "'Playfair Display', serif", fontSize: '22px', color: '#1a3a2a', marginBottom: '8px' },
  cardSubtitle: { fontSize: '14px', color: '#4a6358', marginBottom: '24px' },
  dropZone: { border: '2px dashed rgba(82,183,136,0.4)', borderRadius: '14px', padding: '40px 20px', textAlign: 'center', cursor: 'pointer', background: '#f8fdfb', marginBottom: '20px' },
  dropZoneWithImage: { padding: '12px', border: '2px solid rgba(82,183,136,0.3)' },
  previewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '10px' },
  miniPreview: { width: '100%', height: '80px', objectFit: 'cover', borderRadius: '8px' },
  changeBtn: { gridColumn: '1/-1', marginTop: '10px', background: 'none', border: '1px solid #ddd', borderRadius: '20px', padding: '5px 15px', fontSize: '12px', cursor: 'pointer' },
  submitBtn: { width: '100%', padding: '16px', background: 'linear-gradient(135deg, #2d6a4f, #52b788)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '600' },
  submitBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  error: { color: '#c62828', fontSize: '12px', marginTop: '10px', textAlign: 'center' },
  bottomDecor: { display: 'flex', gap: '16px', marginTop: '32px' }
}

function LeafIcon() { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="#52b788" stroke="#2d6a4f" strokeWidth="1.5"/></svg> }
function CameraIcon() { return <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="#52b788" strokeWidth="1.5"/></svg> }
function SmallLeaf({ delay }) { return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}><path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="#52b788"/></svg> }