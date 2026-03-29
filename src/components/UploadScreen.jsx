import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient.js'

const BUCKET = 'plant_images'

export default function UploadScreen({ onUploadComplete }) {
  const [preview, setPreview] = useState(null)
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef()

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setError(null)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files[0])
  }

  const handleSubmit = async () => {
    if (!file) return
    setUploading(true)
    setError(null)

    try {
      // 1. Upload image to Supabase storage
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, file, { contentType: file.type })

      if (uploadError) throw uploadError

      // 2. Get public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(fileName)

      const imageUrl = urlData.publicUrl

      // 3. Insert a row in plant_logs to trigger n8n
      const { data: logData, error: insertError } = await supabase
        .from('plant_logs')
        .insert({
          user_id: 'web-user',
          image_url: imageUrl,
          status: 'pending',
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      onUploadComplete(logData.id)
    } catch (err) {
      console.error(err)
      setError('Something went wrong. Please try again.')
      setUploading(false)
    }
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header} className="fade-up">
        <div style={styles.logo}>
          <LeafIcon />
          <span style={styles.logoText}>PlantCare</span>
        </div>
        <p style={styles.tagline}>AI-powered plant health diagnosis</p>
      </div>

      {/* Upload card */}
      <div style={styles.card} className="fade-up-delay-1">
        <h2 style={styles.cardTitle}>Scan your plant</h2>
        <p style={styles.cardSubtitle}>
          Take a photo or upload an image — our AI will diagnose your plant's health and suggest remedies.
        </p>

        {/* Drop zone */}
        <div
          style={{ ...styles.dropZone, ...(preview ? styles.dropZoneWithImage : {}) }}
          onClick={() => !preview && inputRef.current.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {preview ? (
            <div style={styles.previewWrapper}>
              <img src={preview} alt="Plant preview" style={styles.previewImage} />
              <button
                style={styles.changeBtn}
                onClick={(e) => { e.stopPropagation(); inputRef.current.click() }}
              >
                Change photo
              </button>
            </div>
          ) : (
            <div style={styles.dropContent}>
              <div style={styles.uploadIcon}>
                <CameraIcon />
              </div>
              <p style={styles.dropText}>Tap to take photo or upload</p>
              <p style={styles.dropSubtext}>Supports JPG, PNG, HEIC</p>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{
            ...styles.submitBtn,
            ...((!file || uploading) ? styles.submitBtnDisabled : {}),
          }}
          onClick={handleSubmit}
          disabled={!file || uploading}
        >
          {uploading ? 'Uploading...' : 'Analyse plant'}
        </button>
      </div>

      {/* Bottom decoration */}
      <div style={styles.bottomDecor}>
        <SmallLeaf delay="0s" />
        <SmallLeaf delay="0.3s" />
        <SmallLeaf delay="0.6s" />
      </div>
    </div>
  )
}

function LeafIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="#52b788" stroke="#2d6a4f" strokeWidth="1.5"/>
      <path d="M12 22C12 22 9 16 11 10" stroke="#2d6a4f" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="#52b788" strokeWidth="1.5" fill="none"/>
      <circle cx="12" cy="13" r="4" stroke="#52b788" strokeWidth="1.5" fill="none"/>
    </svg>
  )
}

function SmallLeaf({ delay }) {
  return (
    <svg
      width="32" height="32" viewBox="0 0 24 24" fill="none"
      style={{ animation: `leafSway 3s ease-in-out ${delay} infinite`, opacity: 0.3 }}
    >
      <path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="#52b788"/>
    </svg>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #f0faf4 0%, #faf8f3 60%, #e8f5e9 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 20px 20px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  logoText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '26px',
    fontWeight: '600',
    color: '#1a3a2a',
    letterSpacing: '-0.5px',
  },
  tagline: {
    fontSize: '14px',
    color: '#4a6358',
    fontWeight: '300',
    letterSpacing: '0.3px',
  },
  card: {
    background: '#ffffff',
    borderRadius: '20px',
    padding: '32px 28px',
    width: '100%',
    maxWidth: '440px',
    boxShadow: '0 8px 40px rgba(26,58,42,0.10)',
    border: '1px solid rgba(82,183,136,0.15)',
  },
  cardTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '22px',
    fontWeight: '500',
    color: '#1a3a2a',
    marginBottom: '8px',
  },
  cardSubtitle: {
    fontSize: '14px',
    color: '#4a6358',
    lineHeight: '1.6',
    marginBottom: '24px',
    fontWeight: '300',
  },
  dropZone: {
    border: '2px dashed rgba(82,183,136,0.4)',
    borderRadius: '14px',
    padding: '40px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    background: '#f8fdfb',
    marginBottom: '20px',
  },
  dropZoneWithImage: {
    padding: '12px',
    border: '2px solid rgba(82,183,136,0.3)',
  },
  dropContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  uploadIcon: {
    width: '64px',
    height: '64px',
    background: '#f0faf4',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropText: {
    fontSize: '15px',
    fontWeight: '500',
    color: '#2d6a4f',
  },
  dropSubtext: {
    fontSize: '12px',
    color: '#8aaa96',
  },
  previewWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  previewImage: {
    width: '100%',
    maxHeight: '260px',
    objectFit: 'cover',
    borderRadius: '10px',
  },
  changeBtn: {
    fontSize: '13px',
    color: '#2d6a4f',
    background: 'none',
    border: '1px solid rgba(82,183,136,0.4)',
    borderRadius: '20px',
    padding: '6px 16px',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  submitBtn: {
    width: '100%',
    padding: '16px',
    background: 'linear-gradient(135deg, #2d6a4f, #52b788)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.3px',
    transition: 'opacity 0.2s',
  },
  submitBtnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  error: {
    color: '#c0392b',
    fontSize: '13px',
    marginBottom: '12px',
    textAlign: 'center',
  },
  bottomDecor: {
    display: 'flex',
    gap: '16px',
    marginTop: '32px',
  },
}
