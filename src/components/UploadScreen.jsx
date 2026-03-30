import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient.js' // Ensure this path is correct

const BUCKET = 'plant_images'

export default function UploadScreen({ onUploadComplete }) {
  const [previews, setPreviews] = useState([])
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef()

  const handleFiles = (fileList) => {
    const selectedFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (selectedFiles.length === 0) return
    
    setFiles(selectedFiles)
    setPreviews(selectedFiles.map(f => URL.createObjectURL(f)))
    setError(null)
  }

  const handleSubmit = async () => {
    if (files.length === 0) return
    setUploading(true)
    setError(null)

    const guestId = localStorage.getItem('plant_care_guest_id')

    try {
      // Loop through all selected files and process them
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        
        // 1. Upload
        const ext = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(fileName, file, { contentType: file.type })
        if (uploadError) throw uploadError

        // 2. Get Public URL
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
        const imageUrl = urlData.publicUrl

        // 3. Insert Log to trigger n8n
        const { data: logData, error: insertError } = await supabase
          .from('plant_logs')
          .insert({
            user_id: guestId, // Using the Guest ID
            image_url: imageUrl,
            status: 'pending',
          })
          .select('id')
          .single()
        if (insertError) throw insertError
        
        // Handling navigation after upload
        // (This assumes you will implement the corresponding History screen)
        if (files.length === 1) {
          // If just one plant, show the single status screen
          onUploadComplete(logData.id)
        } else if (i === files.length - 1) {
          // If multiple, go to History to see all progress (reload or custom function)
          // onGoToHistory(); // or window.location.reload() depending on your App.js
        }
      }
    } catch (err) {
      console.error(err)
      setError('Upload failed. Check your connection or policies.')
      setUploading(false)
    }
  }

  // --- HTML RENDER ---
  return (
    <div style={styles.page}>
      {/* Header (Original Look) */}
      <div style={styles.header} className="fade-up">
        <div style={styles.logo}>
          <LeafIcon />
          <span style={styles.logoText}>PlantCare</span>
        </div>
        <p style={styles.tagline}>AI-powered plant health diagnosis</p>
      </div>

      {/* Main Upload Card (Original Look) */}
      <div style={styles.card} className="fade-up-delay-1">
        <h2 style={styles.cardTitle}>Scan your plants</h2>
        <p style={styles.cardSubtitle}>
          Take photos or upload images of your plants. Our AI will analyze them individually.
        </p>

        {/* Drop zone / Action Area */}
        <div
          style={{ ...styles.dropZone, ...(previews.length > 0 ? styles.dropZoneWithImage : {}) }}
          onClick={() => previews.length === 0 && inputRef.current.click()}
        >
          {previews.length > 0 ? (
            // NEW Grid Preview for Multiple Images
            <div style={styles.previewGrid}>
              {previews.map((src, i) => (
                <img key={i} src={src} alt="Preview" style={styles.miniPreview} />
              ))}
              {/* If user clicks changeBtn, allow re-selecting or adding */}
              <button style={styles.changeBtn} onClick={() => inputRef.current.click()}>
                {previews.length === 1 ? 'Change photo' : 'Edit selection'}
              </button>
            </div>
          ) : (
            // Original Default Content
            <div style={styles.dropContent}>
              <div style={styles.uploadIcon}>
                <CameraIcon />
              </div>
              <p style={styles.dropText}>Tap to take photos or upload</p>
              <p style={styles.dropSubtext}>Supports JPG, PNG, HEIC (Multiple okay)</p>
            </div>
          )}
        </div>

        {/* Hidden Input (Original, now with 'multiple') */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment" // Still allows camera on mobile
          multiple={true} // VITAL FIX
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />

        {error && <p style={styles.error}>{error}</p>}

        {/* Updated Button Text to show file count */}
        <button
          style={{
            ...styles.submitBtn,
            ...((files.length === 0 || uploading) ? styles.submitBtnDisabled : {}),
          }}
          onClick={handleSubmit}
          disabled={files.length === 0 || uploading}
        >
          {uploading 
            ? 'Processing uploads...' 
            : files.length > 1 
              ? `Analyse ${files.length} Plants`
              : 'Analyse plant'}
        </button>
      </div>

      {/* Bottom decoration (Original) */}
      <div style={styles.bottomDecor}>
        <SmallLeaf delay="0s" />
        <SmallLeaf delay="0.3s" />
        <SmallLeaf delay="0.6s" />
      </div>
    </div>
  )
}

// --- ORIGINAL ICONS ---
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

// --- STYLES OBJECT (Original + Multi-image Tweak) ---
const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #f0faf4 0%, #faf8f3 60%, #e8f5e9 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 20px 20px',
    fontFamily: "'DM Sans', sans-serif",
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
    cursor: 'default', // Prevents double clicking the background when photos are there
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
  // TWEAKED: grid for multi-previews
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
    gap: '8px',
    justifyItems: 'center',
    width: '100%',
  },
  // TWEAKED: Mini-preview look for grid
  miniPreview: {
    width: '100%',
    height: '80px',
    objectFit: 'cover',
    borderRadius: '8px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
  },
  // Original
  changeBtn: {
    gridColumn: '1 / -1', // Always spans the full grid width
    marginTop: '8px',
    fontSize: '13px',
    color: '#2d6a4f',
    background: '#fff',
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