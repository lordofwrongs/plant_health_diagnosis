import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'
import { logger } from '../logger.js'

const BUCKET = 'plant_images'

export default function UploadScreen({ onUploadComplete, userLanguage }) {
  const [previews, setPreviews] = useState([])
  const [files, setFiles] = useState([])
  const [nickname, setNickname] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()
  const isProcessing = useRef(false)
  const [totalScans, setTotalScans] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    supabase.rpc('get_total_scans').then(({ data }) => {
      if (data != null) setTotalScans(Number(data))
    })
  }, [])

  const handleFiles = (fileList) => {
    const all = Array.from(fileList)
    const heicFiles = all.filter(f =>
      f.type === 'image/heic' || f.type === 'image/heif' || /\.heic$/i.test(f.name)
    )
    if (heicFiles.length > 0) {
      setError('HEIC photos are not supported. Please export as JPEG from your Photos app first.')
      logger.warn('UploadScreen', `Rejected ${heicFiles.length} HEIC file(s)`)
      return
    }
    const selectedFiles = all.filter(f => f.type.startsWith('image/'))
    if (selectedFiles.length === 0) return
    setFiles(prev => [...prev, ...selectedFiles])
    setPreviews(prev => [...prev, ...selectedFiles.map(f => URL.createObjectURL(f))])
    setError(null)
  }

  const removeImage = (e, index) => {
    e.stopPropagation()
    setFiles(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => {
      URL.revokeObjectURL(prev[index])
      return prev.filter((_, i) => i !== index)
    })
  }

  const getLocationContext = async () => {
    setStatusMessage('Getting location...')

    // Resolve a human-readable city name from the IP API.
    // Used both as a standalone fallback and to name GPS coordinates.
    const getCityFromIP = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/')
        const data = await res.json()
        const city = data.city
        const country = data.country_name
        return (city && country) ? `${city}, ${country}` : (city || null)
      } catch {
        return null
      }
    }

    try {
      // GPS path — accurate coordinates but no human-readable name
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 12000, maximumAge: 0,
        })
      })
      const lat = position.coords.latitude
      const lng = position.coords.longitude
      const name = await getCityFromIP()
      return { lat, lng, name: name || 'Your Location' }
    } catch {
      // GPS denied or timed out — fall back to IP for both coords and name
      setStatusMessage('Using approximate location...')
      try {
        const res = await fetch('https://ipapi.co/json/')
        const data = await res.json()
        const city = data.city
        const country = data.country_name
        const name = (city && country) ? `${city}, ${country}` : (city || 'Your Location')
        return { lat: data.latitude || null, lng: data.longitude || null, name }
      } catch {
        return { lat: null, lng: null, name: 'Your Location' }
      }
    }
  }

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
      reader.readAsDataURL(file)
      reader.onload = (e) => {
        const img = new Image()
        img.onerror = () => reject(new Error(`Failed to decode image: ${file.name}`))
        img.src = e.target.result
        img.onload = () => {
          const MAX_WIDTH = 1200
          const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1
          const canvas = document.createElement('canvas')
          canvas.width  = Math.round(img.width  * scale)
          canvas.height = Math.round(img.height * scale)
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error(`Compression failed: ${file.name}`)); return }
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg' }))
          }, 'image/jpeg', 0.8)
        }
      }
    })
  }

  const handleSubmit = async () => {
    if (files.length === 0 || uploading || isProcessing.current) return
    isProcessing.current = true
    setUploading(true)
    setError(null)

    const guestId = localStorage.getItem('plant_care_guest_id')
    logger.info('UploadScreen', `Submit started: ${files.length} file(s), lang=${userLanguage}`, { guest_id: guestId })

    try {
      const [context, compressedFiles] = await Promise.all([
        getLocationContext(),
        Promise.all(files.map(f => compressImage(f))),
      ])

      setStatusMessage(`Uploading ${files.length} image${files.length > 1 ? 's' : ''}...`)

      const imageUrls = await Promise.all(compressedFiles.map(async (file) => {
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(fileName, file)
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
        return supabase.storage.from(BUCKET).getPublicUrl(fileName).data.publicUrl
      }))

      const dbResults = await Promise.all(imageUrls.map(url =>
        supabase.from('plant_logs').insert({
          user_id: guestId,
          image_url: url,
          status: 'pending',
          latitude: context?.lat,
          longitude: context?.lng,
          location_name: context?.name || 'Your Location',
          plant_nickname: nickname || null,
          preferred_language: userLanguage || 'English',
        }).select('id').single()
      ))

      const createdIds = dbResults.map(res => {
        if (res.error) throw new Error(`Database error: ${res.error.message}`)
        return res.data.id
      })

      onUploadComplete(createdIds)
    } catch (err) {
      logger.error('UploadScreen', `Submit failed: ${err.message}`, { guest_id: guestId })
      const isNetwork = err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch')
      setError(isNetwork ? 'Network error — please check your connection and try again.' : err.message)
      setUploading(false)
      isProcessing.current = false
    }
  }

  const hasPhotos = previews.length > 0

  return (
    <div style={styles.page}>
      {/* Hero */}
      <div className="fade-up" style={styles.hero}>
        <p style={styles.heroEyebrow}>AI Plant Intelligence</p>
        <h1 style={styles.heroHeading}>Know your plant,<br />grow with confidence.</h1>
        <p style={styles.heroSub}>
          Upload a photo and BotanIQ identifies species, diagnoses health, and delivers a personalised care plan — in seconds.
        </p>
      </div>

      {/* Card */}
      <div className="fade-up-delay-1 verdant-card" style={styles.card}>

        {/* Drop zone */}
        <div
          style={{
            ...styles.dropZone,
            ...(hasPhotos ? styles.dropZoneActive : {}),
            ...(dragOver ? styles.dropZoneDrag : {}),
          }}
          onClick={() => !uploading && inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        >
          {hasPhotos ? (
            <div style={styles.previewGrid}>
              {previews.map((src, i) => (
                <div key={i} style={styles.previewItem}>
                  <img src={src} style={styles.previewImg} alt="Preview" />
                  {!uploading && (
                    <button style={styles.removeBtn} onClick={(e) => removeImage(e, i)} aria-label="Remove">✕</button>
                  )}
                </div>
              ))}
              <div style={styles.addMoreTile}>
                <span style={styles.addMorePlus}>+</span>
                <span style={styles.addMoreLabel}>Add more</span>
              </div>
            </div>
          ) : (
            <div style={styles.dropContent}>
              <div style={styles.cameraRing}>
                <CameraIcon />
              </div>
              <p style={styles.dropTitle}>Take or upload a photo</p>
              <p style={styles.dropHint}>Supports JPEG, PNG, WEBP · Multiple photos for better accuracy</p>
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

        {/* Photo guide */}
        <div style={styles.photoGuide}>
          <button style={styles.photoGuideHeader} onClick={() => setGuideOpen(o => !o)}>
            <span style={styles.tipIcon}>📷</span>
            <span style={styles.photoGuideTitle}>How to get the best result</span>
            <span style={styles.photoGuideChev}>{guideOpen ? '▲' : '▼'}</span>
          </button>
          {guideOpen && (
            <div style={styles.photoGuideBody}>
              {[
                { n: 1, title: 'Side angle at leaf level', hint: 'Shows how leaves attach to the stem — the key to accurate identification' },
                { n: 2, title: 'Close-up of one leaf', hint: 'Fill the frame with texture, colour, and edge detail' },
                { n: 3, title: 'Stem and soil base', hint: 'Reveals growth habit — especially useful for seedlings' },
              ].map(({ n, title, hint }) => (
                <div key={n} style={styles.photoStep}>
                  <div style={styles.photoStepNum}>{n}</div>
                  <div>
                    <p style={styles.photoStepTitle}>{title}</p>
                    <p style={styles.photoStepHint}>{hint}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Nickname */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Nickname <span style={styles.optional}>(optional)</span></label>
          <input
            type="text"
            placeholder="e.g. Backyard Tomato"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            style={styles.input}
            disabled={uploading}
          />
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {/* CTA */}
        <button
          style={{ ...styles.cta, ...((files.length === 0 || uploading) ? styles.ctaDisabled : {}) }}
          onClick={handleSubmit}
          disabled={files.length === 0 || uploading}
        >
          {uploading ? (
            <span>{statusMessage || 'Preparing...'}</span>
          ) : (
            <span>
              {files.length === 0
                ? 'Analyse Plant'
                : `Analyse ${files.length} Photo${files.length > 1 ? 's' : ''}`}
            </span>
          )}
        </button>

        {hasPhotos && !uploading && (
          <button style={styles.clearLink} onClick={() => { setFiles([]); setPreviews([]) }}>
            Clear all
          </button>
        )}
      </div>

      {/* Trust bar */}
      <div className="fade-up-delay-2" style={styles.trustBar}>
        {totalScans != null && (
          <span style={{ ...styles.trustItem, ...styles.trustItemCount }}>
            🌿 {totalScans.toLocaleString()} plants analysed
          </span>
        )}
        {['🤖 Gemini AI analysis', '🔬 PlantNet botanical ID', '📍 Local weather context'].map(item => (
          <span key={item} style={styles.trustItem}>{item}</span>
        ))}
      </div>
    </div>
  )
}

const styles = {
  page: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 20px 60px',
    background: 'var(--bg)',
  },

  hero: {
    textAlign: 'center',
    maxWidth: '480px',
    marginBottom: '32px',
  },
  heroEyebrow: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
    color: 'var(--leaf)',
    marginBottom: '12px',
  },
  heroHeading: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '34px',
    fontWeight: '700',
    color: 'var(--text-1)',
    lineHeight: '1.2',
    letterSpacing: '-0.5px',
    marginBottom: '14px',
  },
  heroSub: {
    fontSize: '15px',
    color: 'var(--text-3)',
    lineHeight: '1.65',
  },

  card: {
    width: '100%',
    maxWidth: '460px',
    padding: '28px',
    marginBottom: '24px',
  },

  dropZone: {
    border: '2px dashed var(--border)',
    borderRadius: 'var(--r-md)',
    minHeight: '180px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
    background: 'var(--mist)',
    marginBottom: '18px',
  },
  dropZoneActive: {
    border: '2px solid var(--leaf)',
    background: 'var(--sage)',
  },
  dropZoneDrag: {
    border: '2px solid var(--mid)',
    background: 'var(--sage)',
    transform: 'scale(1.01)',
  },

  dropContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '20px',
  },
  cameraRing: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'var(--shadow-sm)',
  },
  dropTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-2)',
    margin: 0,
  },
  dropHint: {
    fontSize: '12px',
    color: 'var(--text-4)',
    margin: 0,
    textAlign: 'center',
  },

  previewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    padding: '16px',
    width: '100%',
  },
  previewItem: {
    position: 'relative',
    height: '90px',
  },
  previewImg: {
    width: '100%',
    height: '90px',
    objectFit: 'cover',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
  },
  removeBtn: {
    position: 'absolute',
    top: '-7px',
    right: '-7px',
    background: '#DC2626',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    fontSize: '9px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'var(--shadow-sm)',
    zIndex: 10,
  },
  addMoreTile: {
    height: '90px',
    borderRadius: 'var(--r-sm)',
    border: '2px dashed var(--border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    background: 'var(--mist)',
    cursor: 'pointer',
  },
  addMorePlus: {
    fontSize: '22px',
    color: 'var(--leaf)',
    lineHeight: 1,
  },
  addMoreLabel: {
    fontSize: '10px',
    fontWeight: '600',
    color: 'var(--text-3)',
    letterSpacing: '0.3px',
  },

  tipRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
    background: 'var(--mist)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    padding: '10px 12px',
    marginBottom: '20px',
    fontSize: '12px',
    color: 'var(--text-2)',
    lineHeight: '1.5',
  },
  tipIcon: { fontSize: '15px', flexShrink: 0 },
  tipText: { margin: 0 },

  field: { marginBottom: '20px' },
  fieldLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-2)',
    marginBottom: '6px',
    letterSpacing: '0.2px',
  },
  optional: { fontWeight: '400', color: 'var(--text-4)' },
  input: {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    fontSize: '14px',
    color: 'var(--text-1)',
    background: 'var(--mist)',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },

  errorBox: {
    background: '#FFF0F0',
    border: '1px solid #FFCDD2',
    borderRadius: 'var(--r-sm)',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#C62828',
    marginBottom: '16px',
    lineHeight: '1.4',
  },

  cta: {
    width: '100%',
    padding: '17px',
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-full)',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    letterSpacing: '0.3px',
    boxShadow: '0 4px 16px rgba(27,67,50,0.25)',
    transition: 'opacity 0.2s, transform 0.15s',
  },
  ctaDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  clearLink: {
    display: 'block',
    margin: '14px auto 0',
    background: 'none',
    border: 'none',
    color: 'var(--text-4)',
    fontSize: '12px',
    cursor: 'pointer',
    textDecoration: 'underline',
  },

  trustBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    justifyContent: 'center',
    maxWidth: '460px',
  },
  trustItem: {
    fontSize: '11px',
    color: 'var(--text-3)',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-full)',
    padding: '5px 12px',
  },
  trustItemCount: {
    fontWeight: '700',
    color: 'var(--leaf)',
    borderColor: 'rgba(82,183,136,0.4)',
    background: 'rgba(82,183,136,0.08)',
  },

  photoGuide: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    marginBottom: '20px',
    overflow: 'hidden',
    background: 'var(--mist)',
  },
  photoGuideHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  photoGuideTitle: {
    flex: 1,
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-2)',
  },
  photoGuideChev: { fontSize: '10px', color: 'var(--text-4)' },
  photoGuideBody: {
    borderTop: '1px solid var(--border)',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  photoStep: { display: 'flex', gap: '12px', alignItems: 'flex-start' },
  photoStepNum: {
    width: '20px', height: '20px', borderRadius: '50%',
    background: 'var(--primary)', color: '#fff',
    fontSize: '10px', fontWeight: '800',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: '1px',
  },
  photoStepTitle: { fontSize: '12px', fontWeight: '600', color: 'var(--text-1)', margin: 0, marginBottom: '2px' },
  photoStepHint:  { fontSize: '11px', color: 'var(--text-3)', margin: 0, lineHeight: '1.4' },
}

function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--leaf)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}
