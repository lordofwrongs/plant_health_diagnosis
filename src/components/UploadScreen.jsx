import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'
import { logger } from '../logger.js'
import { track } from '../utils/analytics.js'

const BUCKET = 'plant_images'

const SLOTS = [
  { key: 'whole', label: 'Whole plant',    hint: 'Side angle, full plant visible', icon: '🌿' },
  { key: 'leaf',  label: 'Leaf close-up',  hint: 'Fill frame with leaf detail',    icon: '🍃' },
  { key: 'stem',  label: 'Stem & soil',    hint: 'Base and growth habit',          icon: '🌱' },
]

export default function UploadScreen({ onUploadComplete, userLanguage }) {
  const [slotImages, setSlotImages] = useState({ whole: null, leaf: null, stem: null })
  const [nickname, setNickname] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const isProcessing = useRef(false)
  const [totalScans, setTotalScans] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('botaniq_onboarding_done'))

  const wholeRef = useRef()
  const leafRef  = useRef()
  const stemRef  = useRef()
  const slotRefs = { whole: wholeRef, leaf: leafRef, stem: stemRef }

  useEffect(() => {
    supabase.rpc('get_total_scans').then(({ data }) => {
      if (data != null) setTotalScans(Number(data))
    })
  }, [])

  const dismissOnboarding = () => {
    localStorage.setItem('botaniq_onboarding_done', '1')
    setShowOnboarding(false)
  }

  const handleSlotFile = (key, fileList) => {
    const file = Array.from(fileList).find(f => f.type.startsWith('image/'))
    if (!file) return
    if (file.type === 'image/heic' || file.type === 'image/heif' || /\.heic$/i.test(file.name)) {
      setError('HEIC photos are not supported. Please export as JPEG from your Photos app first.')
      return
    }
    setSlotImages(prev => {
      if (prev[key]?.preview) URL.revokeObjectURL(prev[key].preview)
      return { ...prev, [key]: { file, preview: URL.createObjectURL(file) } }
    })
    setError(null)
    track('photo_added', { slot: key })
    if (showOnboarding) dismissOnboarding()
  }

  const removeSlot = (key) => {
    setSlotImages(prev => {
      if (prev[key]?.preview) URL.revokeObjectURL(prev[key].preview)
      return { ...prev, [key]: null }
    })
  }

  const getLocationContext = async () => {
    setStatusMessage('Getting location...')

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
    const activeSlots = SLOTS.map(s => slotImages[s.key]).filter(Boolean)
    if (activeSlots.length === 0 || uploading || isProcessing.current) return
    isProcessing.current = true
    setUploading(true)
    setError(null)
    track('scan_submitted', { photo_count: activeSlots.length, has_nickname: !!nickname })

    const guestId = localStorage.getItem('plant_care_guest_id')
    logger.info('UploadScreen', `Submit: ${activeSlots.length} photo(s), lang=${userLanguage}`, { guest_id: guestId })

    try {
      const [context, compressedFiles] = await Promise.all([
        getLocationContext(),
        Promise.all(activeSlots.map(slot => compressImage(slot.file))),
      ])

      setStatusMessage(`Uploading ${activeSlots.length} photo${activeSlots.length > 1 ? 's' : ''}...`)

      const imageUrls = await Promise.all(compressedFiles.map(async (file) => {
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(fileName, file)
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
        return supabase.storage.from(BUCKET).getPublicUrl(fileName).data.publicUrl
      }))

      // Always create a single record — multiple angles belong to one diagnosis
      const { data: record, error: dbErr } = await supabase
        .from('plant_logs')
        .insert({
          user_id:           guestId,
          image_url:         imageUrls[0],
          additional_images: imageUrls.slice(1),
          status:            'pending',
          latitude:          context?.lat,
          longitude:         context?.lng,
          location_name:     context?.name || 'Your Location',
          plant_nickname:    nickname || null,
          preferred_language: userLanguage || 'English',
        })
        .select('id')
        .single()

      if (dbErr) throw new Error(`Database error: ${dbErr.message}`)
      onUploadComplete([record.id])
    } catch (err) {
      logger.error('UploadScreen', `Submit failed: ${err.message}`, { guest_id: guestId })
      const isNetwork = err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch')
      setError(isNetwork ? 'Network error — please check your connection and try again.' : err.message)
      setUploading(false)
      isProcessing.current = false
    }
  }

  const activeCount = Object.values(slotImages).filter(Boolean).length
  const hasPhotos   = activeCount > 0

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

        {/* 3-slot guided capture */}
        <p style={styles.slotsLabel}>
          Add up to 3 photos for the most accurate diagnosis
          <span style={styles.slotsOptional}> — 1 minimum</span>
        </p>

        {showOnboarding && (
          <div style={styles.onboardingBanner} role="status" aria-live="polite">
            <span style={styles.onboardingIcon}>📸</span>
            <div style={styles.onboardingText}>
              <strong style={styles.onboardingTitle}>3 angles = much better results</strong>
              <span style={styles.onboardingBody}> Tap each slot to add a whole-plant shot, a leaf close-up, and the stem base. One photo works too — just tap the first slot to start.</span>
            </div>
            <button
              style={styles.onboardingDismiss}
              onClick={dismissOnboarding}
              aria-label="Dismiss tip"
            >
              Got it
            </button>
          </div>
        )}

        <div style={styles.slotsRow} role="group" aria-label="Plant photo slots">
          {SLOTS.map(({ key, label, hint, icon }) => {
            const slot = slotImages[key]
            return (
              <div key={key} style={styles.slotWrap}>
                <div
                  className={showOnboarding && !slot ? 'slot-pulse' : ''}
                  style={{ ...styles.slot, ...(slot ? styles.slotFilled : {}) }}
                  onClick={() => !uploading && slotRefs[key].current.click()}
                  role="button"
                  tabIndex={0}
                  aria-label={slot ? `Replace ${label} photo` : `Add ${label} photo`}
                  onKeyDown={e => e.key === 'Enter' && !uploading && slotRefs[key].current.click()}
                >
                  {slot ? (
                    <>
                      <img src={slot.preview} style={styles.slotImg} alt={`${label} preview`} />
                      {!uploading && (
                        <button
                          style={styles.slotRemove}
                          onClick={e => { e.stopPropagation(); removeSlot(key) }}
                          aria-label={`Remove ${label} photo`}
                        >✕</button>
                      )}
                    </>
                  ) : (
                    <div style={styles.slotEmpty} aria-hidden="true">
                      <span style={styles.slotIcon}>{icon}</span>
                      <span style={styles.slotPlus}>+</span>
                    </div>
                  )}
                </div>
                <p style={styles.slotLabel} aria-hidden="true">{label}</p>
                <p style={styles.slotHint}  aria-hidden="true">{hint}</p>
                <input
                  ref={slotRefs[key]}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => handleSlotFile(key, e.target.files)}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
            )
          })}
        </div>

        {/* Photo guide */}
        <div style={styles.photoGuide}>
          <button
            style={styles.photoGuideHeader}
            onClick={() => setGuideOpen(o => !o)}
            aria-expanded={guideOpen}
            aria-controls="photo-guide-body"
          >
            <span style={styles.tipIcon} aria-hidden="true">📷</span>
            <span style={styles.photoGuideTitle}>How to get the best result</span>
            <span style={styles.photoGuideChev} aria-hidden="true">{guideOpen ? '▲' : '▼'}</span>
          </button>
          {guideOpen && (
            <div id="photo-guide-body" style={styles.photoGuideBody}>
              {[
                { n: 1, title: 'Side angle at leaf level', hint: 'Shows how leaves attach to the stem — the key to accurate identification' },
                { n: 2, title: 'Close-up of one leaf', hint: 'Fill the frame with texture, colour, and edge detail' },
                { n: 3, title: 'Stem and soil base', hint: 'Reveals growth habit — especially useful for seedlings' },
              ].map(({ n, title, hint }) => (
                <div key={n} style={styles.photoStep}>
                  <div style={styles.photoStepNum} aria-hidden="true">{n}</div>
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
          <label htmlFor="plant-nickname" style={styles.fieldLabel}>
            Nickname <span style={styles.optional}>(optional)</span>
          </label>
          <input
            id="plant-nickname"
            type="text"
            placeholder="e.g. Backyard Tomato"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            style={styles.input}
            disabled={uploading}
          />
        </div>

        {error && <div style={styles.errorBox} role="alert">{error}</div>}

        {/* CTA */}
        <button
          style={{ ...styles.cta, ...(!hasPhotos || uploading ? styles.ctaDisabled : {}) }}
          onClick={handleSubmit}
          disabled={!hasPhotos || uploading}
          aria-busy={uploading}
          aria-disabled={!hasPhotos || uploading}
        >
          {uploading ? (
            <span aria-live="polite">{statusMessage || 'Preparing...'}</span>
          ) : (
            <span>
              {!hasPhotos
                ? 'Analyse Plant'
                : `Analyse ${activeCount} Photo${activeCount > 1 ? 's' : ''}`}
            </span>
          )}
        </button>

        {hasPhotos && !uploading && (
          <button
            style={styles.clearLink}
            onClick={() => setSlotImages({ whole: null, leaf: null, stem: null })}
          >
            Clear all photos
          </button>
        )}
      </div>

      {/* Trust bar */}
      <div className="fade-up-delay-2" style={styles.trustBar} aria-label="Trust indicators">
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

  slotsLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-2)',
    marginBottom: '14px',
    lineHeight: '1.4',
  },
  slotsOptional: {
    fontWeight: '400',
    color: 'var(--text-4)',
  },

  onboardingBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    background: 'rgba(82,183,136,0.1)',
    border: '1px solid rgba(82,183,136,0.4)',
    borderRadius: 'var(--r-sm)',
    padding: '12px 14px',
    marginBottom: '14px',
  },
  onboardingIcon: { fontSize: '18px', flexShrink: 0, marginTop: '1px' },
  onboardingText: { flex: 1, fontSize: '12px', color: 'var(--text-2)', lineHeight: '1.5' },
  onboardingTitle: { color: 'var(--primary)', fontWeight: '700' },
  onboardingBody: { fontWeight: '400' },
  onboardingDismiss: {
    flexShrink: 0,
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-full)',
    padding: '5px 12px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    alignSelf: 'center',
  },

  slotsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '18px',
  },
  slotWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  slot: {
    width: '100%',
    aspectRatio: '1',
    borderRadius: 'var(--r-md)',
    border: '2px dashed var(--border)',
    background: 'var(--mist)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    position: 'relative',
    overflow: 'hidden',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    outline: 'none',
  },
  slotFilled: {
    border: '2px solid var(--leaf)',
    boxShadow: '0 0 0 3px rgba(82,183,136,0.15)',
  },
  slotEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    pointerEvents: 'none',
  },
  slotIcon: { fontSize: '24px', lineHeight: 1 },
  slotPlus: {
    fontSize: '18px',
    color: 'var(--text-4)',
    fontWeight: '300',
    lineHeight: 1,
  },
  slotImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  slotRemove: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '22px',
    height: '22px',
    fontSize: '9px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  slotLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-2)',
    textAlign: 'center',
    margin: 0,
    letterSpacing: '0.2px',
  },
  slotHint: {
    fontSize: '10px',
    color: 'var(--text-4)',
    textAlign: 'center',
    margin: 0,
    lineHeight: '1.3',
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
  tipIcon: { fontSize: '15px', flexShrink: 0 },
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
}
