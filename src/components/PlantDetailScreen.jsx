import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { logger } from '../logger.js'

function friendlyError(errorDetails) {
  if (!errorDetails) return 'Analysis failed. Tap Retry to try again.'
  if (errorDetails.includes('heic') || errorDetails.includes('HEIC') || errorDetails.includes('Unsupported image format'))
    return 'HEIC format not supported. Please re-upload as JPEG or PNG.'
  if (errorDetails.includes('Quality check'))
    return 'Could not reach the AI service. Tap Retry.'
  if (errorDetails.includes('timeout') || errorDetails.includes('aborted'))
    return 'Request timed out. Check your connection and tap Retry.'
  return 'Analysis failed. Tap Retry to try again.'
}

export default function PlantDetailScreen({ group, onBack, onSelectScan, onRetakePhoto, onGroupDeleted }) {
  const [localScans, setLocalScans] = useState(group.scans)
  const [retrying, setRetrying] = useState({})
  const [confirming, setConfirming] = useState(false)

  const sortedScans = [...localScans].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const latest = sortedScans[0]

  const waterBadge = (() => {
    const sched = latest?.care_schedule
    if (!sched?.water_every_days) return null
    const next = new Date(latest.created_at).getTime() + sched.water_every_days * 86400000
    const days = Math.ceil((next - Date.now()) / 86400000)
    const label = days <= 0 ? 'Water today' : days === 1 ? 'Water tomorrow' : `Water in ${days}d`
    return { label, urgent: days <= 0 }
  })()

  const handleRetry = async (e, scan) => {
    e.stopPropagation()
    setRetrying(prev => ({ ...prev, [scan.id]: true }))
    setLocalScans(prev => prev.map(s => s.id === scan.id ? { ...s, status: 'pending', error_details: null } : s))
    try {
      await supabase.from('plant_logs').update({ status: 'pending', error_details: null }).eq('id', scan.id)
      supabase.functions.invoke('plant-processor', {
        body: { record: { id: scan.id, image_url: scan.image_url, plant_nickname: scan.plant_nickname, user_id: scan.user_id } },
      }).catch(err => logger.error('PlantDetailScreen', `Retry invocation failed: ${err.message}`))
    } catch (err) {
      logger.error('PlantDetailScreen', `Retry setup failed: ${err.message}`)
    } finally {
      setRetrying(prev => ({ ...prev, [scan.id]: false }))
    }
  }

  const handleDeleteAll = async () => {
    const ids = localScans.map(s => s.id)
    const { error } = await supabase.from('plant_logs').delete().in('id', ids)
    if (!error) onGroupDeleted()
    else logger.error('PlantDetailScreen', `Delete failed: ${error.message}`)
  }

  return (
    <div className="fade-up" style={styles.page}>
      {/* Back button floats over the top of the hero */}
      <button style={styles.backBtn} onClick={onBack} aria-label="Back to garden">
        ← Garden
      </button>

      {/* Hero image */}
      <div style={styles.hero}>
        <img src={group.latestImage} alt={group.nickname} style={styles.heroImg} />
        <div style={styles.heroGradient}>
          <h1 style={styles.heroName}>{group.nickname}</h1>
          <p style={styles.heroSci}>{group.plantName}</p>
          <div style={styles.heroStatusRow}>
            <span style={{ ...styles.dot, background: group.latestHealthColor || 'var(--leaf)' }} />
            <span style={styles.heroStatus}>{group.latestStatus || 'Processing...'}</span>
          </div>
        </div>
      </div>

      {/* Body content */}
      <div style={styles.body}>
        {waterBadge && (
          <div style={styles.careRow}>
            <span style={{ ...styles.careBadge, ...(waterBadge.urgent ? styles.careBadgeUrgent : {}) }}>
              💧 {waterBadge.label}
            </span>
          </div>
        )}

        {/* Scan history */}
        <div style={styles.sectionHeaderRow}>
          <h2 style={styles.sectionTitle}>Scan History</h2>
          <span style={styles.sectionCount}>{sortedScans.length} {sortedScans.length === 1 ? 'scan' : 'scans'}</span>
        </div>

        <div style={styles.scanList}>
          {sortedScans.map((scan, i) => {
            const isPending  = scan.status === 'pending'
            const isError    = scan.status === 'error'
            const isQuality  = scan.status === 'quality_issue'
            const isDone     = scan.status === 'done'
            const isRetrying = retrying[scan.id]
            const isClickable = isDone

            return (
              <div
                key={scan.id}
                style={{
                  ...styles.scanRow,
                  ...(isClickable  ? styles.scanRowClickable : {}),
                  ...(isError      ? styles.scanRowError     : {}),
                  ...(isQuality    ? styles.scanRowQuality   : {}),
                }}
                onClick={() => isClickable && onSelectScan(scan, sortedScans)}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
              >
                <img src={scan.image_url} alt="" style={styles.scanThumb} />

                <div style={styles.scanMeta}>
                  <div style={styles.scanTopRow}>
                    <span style={styles.scanDate}>
                      {new Date(scan.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {i === 0 && <span style={styles.latestBadge}>Latest</span>}
                  </div>

                  {isPending && (
                    <span style={styles.scanPending}>Analysing...</span>
                  )}
                  {isDone && (
                    <div style={styles.scanStatusRow}>
                      <span style={{ ...styles.dot, background: scan.HealthColor || 'var(--leaf)' }} />
                      <span style={styles.scanStatusLabel}>{scan.HealthStatus || '—'}</span>
                    </div>
                  )}
                  {(isError || isQuality) && (
                    <p style={styles.scanErrorMsg}>{friendlyError(scan.error_details)}</p>
                  )}
                  {isError && (
                    <button
                      style={{ ...styles.smallBtn, ...styles.retryBtn, opacity: isRetrying ? 0.6 : 1 }}
                      disabled={isRetrying}
                      onClick={(e) => handleRetry(e, scan)}
                    >
                      {isRetrying ? 'Retrying...' : '↺ Retry'}
                    </button>
                  )}
                  {isQuality && (
                    <button
                      style={{ ...styles.smallBtn, ...styles.retakeBtn }}
                      onClick={(e) => { e.stopPropagation(); onRetakePhoto?.() }}
                    >
                      📸 Retake
                    </button>
                  )}
                </div>

                {isClickable && <span style={styles.chevron}>›</span>}
              </div>
            )
          })}
        </div>

        {/* Delete plant */}
        <div style={styles.deleteWrap}>
          {!confirming ? (
            <button style={styles.deleteBtn} onClick={() => setConfirming(true)}>
              Remove plant from garden
            </button>
          ) : (
            <div style={styles.confirmBox}>
              <p style={styles.confirmText}>
                Remove {group.nickname} and all {localScans.length} scan{localScans.length !== 1 ? 's' : ''} from your garden?
              </p>
              <div style={styles.confirmBtns}>
                <button style={styles.confirmYes} onClick={handleDeleteAll}>Yes, remove</button>
                <button style={styles.confirmNo} onClick={() => setConfirming(false)}>Keep</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg)',
    minHeight: 0,
    position: 'relative',
  },

  backBtn: {
    position: 'absolute',
    top: '12px',
    left: '16px',
    zIndex: 10,
    background: 'rgba(10,31,20,0.55)',
    backdropFilter: 'blur(8px)',
    border: 'none',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '700',
    padding: '7px 14px',
    borderRadius: 'var(--r-full)',
    cursor: 'pointer',
    letterSpacing: '0.2px',
  },

  // Hero
  hero: {
    position: 'relative',
    width: '100%',
    height: '260px',
    flexShrink: 0,
    overflow: 'hidden',
    background: 'var(--mist)',
  },
  heroImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '48px 20px 20px',
    background: 'linear-gradient(to top, rgba(10,31,20,0.88) 0%, rgba(10,31,20,0) 100%)',
  },
  heroName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '26px',
    fontWeight: '700',
    color: '#fff',
    letterSpacing: '-0.3px',
    marginBottom: '3px',
  },
  heroSci: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
    marginBottom: '8px',
  },
  heroStatusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  heroStatus: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },

  // Body
  body: {
    flex: 1,
    padding: '20px 20px 60px',
    maxWidth: '600px',
    width: '100%',
    margin: '0 auto',
  },

  careRow: {
    marginBottom: '20px',
  },
  careBadge: {
    display: 'inline-block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#0369a1',
    background: '#e0f2fe',
    borderRadius: 'var(--r-full)',
    padding: '6px 14px',
  },
  careBadgeUrgent: {
    color: '#92400e',
    background: '#fef3c7',
  },

  sectionHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '17px',
    fontWeight: '700',
    color: 'var(--text-1)',
    letterSpacing: '-0.2px',
  },
  sectionCount: {
    fontSize: '13px',
    color: 'var(--text-3)',
    fontWeight: '500',
  },

  // Scan list
  scanList: {
    display: 'grid',
    gap: '10px',
    marginBottom: '32px',
  },
  scanRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    padding: '12px',
    boxShadow: 'var(--shadow-xs)',
  },
  scanRowClickable: {
    cursor: 'pointer',
    transition: 'box-shadow 0.15s',
  },
  scanRowError: {
    border: '1px solid #FFCDD2',
    background: '#FFF8F8',
  },
  scanRowQuality: {
    border: '1px solid #FFE082',
    background: '#FFFDE7',
  },
  scanThumb: {
    width: '60px',
    height: '60px',
    borderRadius: 'var(--r-sm)',
    objectFit: 'cover',
    flexShrink: 0,
    background: 'var(--mist)',
  },
  scanMeta: {
    flex: 1,
    minWidth: 0,
  },
  scanTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '5px',
  },
  scanDate: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-2)',
  },
  latestBadge: {
    fontSize: '10px',
    fontWeight: '800',
    color: 'var(--mid)',
    background: 'var(--sage)',
    borderRadius: 'var(--r-full)',
    padding: '2px 8px',
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
  },
  scanPending: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--fair)',
  },
  scanStatusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  scanStatusLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-2)',
  },
  scanErrorMsg: {
    fontSize: '12px',
    color: 'var(--critical)',
    lineHeight: '1.4',
    marginBottom: '6px',
  },

  smallBtn: {
    padding: '5px 12px',
    border: 'none',
    borderRadius: 'var(--r-sm)',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  retryBtn:  { background: 'var(--primary)', color: '#fff' },
  retakeBtn: { background: '#F59E0B', color: '#fff' },

  chevron: {
    fontSize: '22px',
    color: 'var(--border)',
    fontWeight: '300',
    flexShrink: 0,
  },

  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },

  // Delete section
  deleteWrap: {
    marginTop: '8px',
  },
  deleteBtn: {
    background: 'none',
    border: '1px solid #FECACA',
    color: '#DC2626',
    fontSize: '14px',
    fontWeight: '600',
    padding: '12px 20px',
    borderRadius: 'var(--r-full)',
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.15s',
  },
  confirmBox: {
    padding: '16px',
    background: '#FFF0F0',
    border: '1px solid #FECACA',
    borderRadius: 'var(--r-md)',
  },
  confirmText: {
    fontSize: '14px',
    color: '#C62828',
    fontWeight: '600',
    margin: '0 0 12px',
    lineHeight: '1.4',
  },
  confirmBtns: {
    display: 'flex',
    gap: '8px',
  },
  confirmYes: {
    padding: '9px 20px',
    background: '#DC2626',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-full)',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  confirmNo: {
    padding: '9px 20px',
    background: 'var(--mist)',
    color: 'var(--text-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-full)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
}
