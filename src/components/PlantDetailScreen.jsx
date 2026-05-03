import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'
import { logger } from '../logger.js'
import { track } from '../utils/analytics.js'
import {
  isPushSupported,
  getCurrentSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  isMutedForPlant,
  muteForPlant,
  unmuteForPlant,
} from '../utils/pushNotifications.js'

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
  const [qaCountMap, setQaCountMap] = useState({})

  // Care actions
  const [lastWateredAt, setLastWateredAt] = useState(null)
  const [justWatered, setJustWatered] = useState(false)

  // Push notifications
  const [pushSupported, setPushSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [reminderError, setReminderError] = useState(null)

  const sortedScans = [...localScans].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const latest = sortedScans[0]
  const userId = latest?.user_id
  const plantId = group.id  // plant identity key — same as group.nickname

  // Q&A counts
  useEffect(() => {
    const scanIds = group.scans.filter(s => s.status === 'done').map(s => s.id)
    if (scanIds.length === 0) return
    supabase
      .from('plant_conversations')
      .select('log_id, messages')
      .in('log_id', scanIds)
      .then(({ data }) => {
        if (!data) return
        const map = {}
        data.forEach(row => {
          const turns = (row.messages || []).filter(m => m.role === 'user').length
          if (turns > 0) map[row.log_id] = turns
        })
        setQaCountMap(map)
      })
  }, [group.scans])

  // Last-watered date + push state
  useEffect(() => {
    if (!userId) return

    // Fetch most recent watered action for this plant
    supabase
      .from('plant_care_actions')
      .select('actioned_at')
      .eq('user_id', userId)
      .eq('plant_name', plantId)
      .eq('action_type', 'watered')
      .order('actioned_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setLastWateredAt(new Date(data.actioned_at)) })

    if (!isPushSupported()) return
    setPushSupported(true)

    ;(async () => {
      try {
        const sub = await getCurrentSubscription()
        if (!sub) return
        setIsSubscribed(true)
        const muted = await isMutedForPlant(userId, plantId)
        setIsMuted(muted)
      } catch (err) {
        logger.error('PlantDetailScreen', `Push state check failed: ${err.message}`)
      }
    })()
  }, [userId, plantId])

  // Water badge — recalculates when lastWateredAt or justWatered changes
  const waterBadge = (() => {
    const sched = latest?.care_schedule
    if (!sched?.water_every_days) return null
    const baseDate = justWatered ? new Date() : (lastWateredAt ?? new Date(latest.created_at))
    const next = baseDate.getTime() + sched.water_every_days * 86400000
    const days = Math.ceil((next - Date.now()) / 86400000)
    const label = days <= 0 ? 'Water today' : days === 1 ? 'Water tomorrow' : `Water in ${days}d`
    return { label, urgent: days <= 0 }
  })()

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleMarkWatered = async () => {
    if (!userId || justWatered) return
    setJustWatered(true)
    setLastWateredAt(new Date())
    await supabase.from('plant_care_actions').insert({
      user_id: userId,
      plant_name: plantId,
      action_type: 'watered',
    })
    track('care_action_logged', { action_type: 'watered' })
  }

  const handleSubscribe = async () => {
    if (!userId || isSubscribing) return
    setIsSubscribing(true)
    setReminderError(null)
    try {
      await subscribeToPush(userId)
      setIsSubscribed(true)
      track('notification_opted_in')
    } catch (err) {
      if (err.message === 'Permission denied') {
        setReminderError('Notifications blocked — enable them in your browser settings.')
      } else {
        setReminderError('Could not set up reminders. Try again.')
        logger.error('PlantDetailScreen', `Subscribe failed: ${err.message}`)
      }
    } finally {
      setIsSubscribing(false)
    }
  }

  const handleUnsubscribe = async () => {
    if (!userId) return
    await unsubscribeFromPush(userId)
    setIsSubscribed(false)
    setIsMuted(false)
    track('notification_opted_out')
  }

  const handleToggleMute = async () => {
    if (!userId) return
    if (isMuted) {
      await unmuteForPlant(userId, plantId)
      setIsMuted(false)
    } else {
      await muteForPlant(userId, plantId)
      setIsMuted(true)
    }
  }

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
    if (!error) { track('plant_deleted', { scan_count: ids.length }); onGroupDeleted() }
    else logger.error('PlantDetailScreen', `Delete failed: ${error.message}`)
  }

  return (
    <div className="fade-up" style={styles.page}>
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

      {/* Body */}
      <div style={styles.body}>

        {/* ── Care + Reminders section ── */}
        {(waterBadge || pushSupported) && (
          <div style={styles.careSection}>

            {waterBadge && (
              <div style={styles.careRow}>
                <span style={{ ...styles.careBadge, ...(waterBadge.urgent ? styles.careBadgeUrgent : {}) }}>
                  💧 {waterBadge.label}
                </span>
                <button
                  style={{ ...styles.wateredBtn, ...(justWatered ? styles.wateredBtnDone : {}) }}
                  onClick={handleMarkWatered}
                  disabled={justWatered}
                  aria-label="Mark plant as watered today"
                >
                  {justWatered ? '✓ Logged' : 'Mark watered'}
                </button>
              </div>
            )}

            {pushSupported && (
              <div style={styles.reminderRow}>
                {!isSubscribed ? (
                  <>
                    <button
                      style={{ ...styles.remindBtn, opacity: isSubscribing ? 0.6 : 1 }}
                      onClick={handleSubscribe}
                      disabled={isSubscribing}
                    >
                      {isSubscribing ? 'Setting up...' : '🔔 Remind me to water'}
                    </button>
                    {reminderError && <p style={styles.reminderError}>{reminderError}</p>}
                  </>
                ) : (
                  <div style={styles.reminderActiveRow}>
                    <span style={styles.reminderOnLabel}>
                      {isMuted ? '🔕 Reminders muted' : '🔔 Reminders on'}
                    </span>
                    <button style={styles.muteToggleBtn} onClick={handleToggleMute}>
                      {isMuted ? 'Unmute' : 'Mute'}
                    </button>
                    <button style={styles.unsubLink} onClick={handleUnsubscribe}>
                      Turn off all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Scan history ── */}
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
                  ...(isClickable ? styles.scanRowClickable : {}),
                  ...(isError     ? styles.scanRowError    : {}),
                  ...(isQuality   ? styles.scanRowQuality  : {}),
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
                    {qaCountMap[scan.id] && (
                      <span style={styles.qaBadge} title={`${qaCountMap[scan.id]} follow-up question${qaCountMap[scan.id] > 1 ? 's' : ''}`}>
                        💬 {qaCountMap[scan.id]}
                      </span>
                    )}
                  </div>

                  {isPending && <span style={styles.scanPending}>Analysing...</span>}
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

        {/* ── Delete plant ── */}
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

  body: {
    flex: 1,
    padding: '20px 20px 60px',
    maxWidth: '600px',
    width: '100%',
    margin: '0 auto',
  },

  // ── Care + Reminders ──
  careSection: {
    marginBottom: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  careRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
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
  wateredBtn: {
    padding: '6px 14px',
    background: 'var(--mist)',
    border: '1px solid var(--border)',
    color: 'var(--text-2)',
    fontSize: '12px',
    fontWeight: '600',
    borderRadius: 'var(--r-full)',
    cursor: 'pointer',
  },
  wateredBtnDone: {
    background: '#d1fae5',
    borderColor: '#6ee7b7',
    color: '#065f46',
    cursor: 'default',
  },
  reminderRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  remindBtn: {
    alignSelf: 'flex-start',
    padding: '8px 18px',
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-full)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  reminderError: {
    fontSize: '12px',
    color: 'var(--critical)',
    margin: 0,
  },
  reminderActiveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  reminderOnLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--mid)',
  },
  muteToggleBtn: {
    padding: '4px 12px',
    background: 'var(--mist)',
    border: '1px solid var(--border)',
    color: 'var(--text-2)',
    fontSize: '12px',
    fontWeight: '600',
    borderRadius: 'var(--r-full)',
    cursor: 'pointer',
  },
  unsubLink: {
    background: 'none',
    border: 'none',
    color: 'var(--text-4)',
    fontSize: '12px',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },

  // ── Scan list ──
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
  qaBadge: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--mid)',
    background: 'var(--sage)',
    borderRadius: 'var(--r-full)',
    padding: '2px 7px',
    letterSpacing: '0.2px',
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

  // ── Delete ──
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
