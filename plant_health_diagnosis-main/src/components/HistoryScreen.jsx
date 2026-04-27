import { useEffect, useState, useCallback } from 'react'
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

export default function HistoryScreen({ onSelectResult, onRetakePhoto }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState({})

  const fetchHistory = useCallback(async () => {
    const guestId = localStorage.getItem('plant_care_guest_id')
    const { data, error } = await supabase
      .from('plant_logs')
      .select('*')
      .eq('user_id', guestId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      const grouped = data.reduce((acc, log) => {
        const identity = log.plant_nickname || log.PlantName || 'Identifying...'
        if (!acc[identity]) {
          acc[identity] = {
            id: identity,
            nickname: log.plant_nickname || log.PlantName || 'New Discovery',
            plantName: log.PlantName || 'Identifying...',
            latestTimestamp: log.created_at,
            latestImage: log.image_url,
            latestStatus: log.HealthStatus,
            latestHealthColor: log.HealthColor,
            latestScanStatus: log.status,
            latestErrorDetails: log.error_details,
            latestScanId: log.id,
            latestScanData: log,
            scans: [],
          }
        }
        acc[identity].scans.push(log)
        if (new Date(log.created_at) > new Date(acc[identity].latestTimestamp)) {
          acc[identity].latestTimestamp    = log.created_at
          acc[identity].latestImage        = log.image_url
          acc[identity].latestStatus       = log.HealthStatus
          acc[identity].latestHealthColor  = log.HealthColor
          acc[identity].latestScanStatus   = log.status
          acc[identity].latestErrorDetails = log.error_details
          acc[identity].latestScanId       = log.id
          acc[identity].latestScanData     = log
        }
        return acc
      }, {})
      setGroups(Object.values(grouped))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchHistory()
    const channel = supabase
      .channel('history_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plant_logs' }, () => fetchHistory())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchHistory])

  const handleRetry = async (e, group) => {
    e.stopPropagation()
    const scanId = group.latestScanId
    const scan   = group.latestScanData
    logger.info('HistoryScreen', `Retrying record ${scanId}`)
    setRetrying(prev => ({ ...prev, [scanId]: true }))
    try {
      await supabase.from('plant_logs')
        .update({ status: 'pending', error_details: null })
        .eq('id', scanId)
      supabase.functions.invoke('plant-processor', {
        body: { record: { id: scanId, image_url: scan.image_url, plant_nickname: scan.plant_nickname, user_id: scan.user_id } },
      }).catch(err => logger.error('HistoryScreen', `Retry invocation failed: ${err.message}`, { record_id: scanId }))
    } catch (err) {
      logger.error('HistoryScreen', `Retry setup failed: ${err.message}`, { record_id: scanId })
    } finally {
      setRetrying(prev => ({ ...prev, [scanId]: false }))
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.loadingDot} />
        <p style={styles.loadingText}>Loading your garden...</p>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header className="fade-up" style={styles.header}>
        <h2 style={styles.title}>My Garden</h2>
        <p style={styles.subtitle}>
          {groups.length === 0 ? 'No plants yet' : `${groups.length} species tracked`}
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="fade-up-delay-1" style={styles.emptyState}>
          <div style={styles.emptyIcon}>🌱</div>
          <h3 style={styles.emptyTitle}>Your garden awaits</h3>
          <p style={styles.emptyText}>Scan your first plant to start tracking its health over time.</p>
        </div>
      ) : (
        <div className="fade-up-delay-1" style={styles.list}>
          {groups.map((group) => {
            const isPending  = group.latestScanStatus === 'pending'
            const isError    = group.latestScanStatus === 'error'
            const isQuality  = group.latestScanStatus === 'quality_issue'
            const isRetrying = retrying[group.latestScanId]
            const isClickable = !isError && !isPending && !isQuality

            return (
              <div
                key={group.id}
                style={{
                  ...styles.card,
                  ...(isError   ? styles.cardError   : {}),
                  ...(isQuality ? styles.cardQuality : {}),
                  ...(isClickable ? styles.cardClickable : {}),
                }}
                onClick={() => isClickable && onSelectResult(group.scans[0], group.scans)}
              >
                {/* Thumbnail */}
                <div style={styles.thumbWrap}>
                  <img src={group.latestImage} style={styles.thumb} alt="Plant" />
                  {group.scans.length > 1 && (
                    <div style={styles.scanBadge}>{group.scans.length}</div>
                  )}
                </div>

                {/* Content */}
                <div style={styles.content}>
                  <div style={styles.topRow}>
                    <h3 style={styles.plantName}>{group.nickname}</h3>
                    <span style={styles.date}>
                      {new Date(group.latestTimestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p style={styles.sciName}>{group.plantName}</p>

                  {isPending && (
                    <div style={styles.statusRow}>
                      <span style={{ ...styles.dot, background: 'var(--fair)', animation: 'pulse 1.5s infinite' }} />
                      <span style={{ ...styles.statusLabel, color: 'var(--fair)' }}>Analysing...</span>
                    </div>
                  )}

                  {isError && (
                    <div>
                      <p style={styles.errorMsg}>{friendlyError(group.latestErrorDetails)}</p>
                      <button
                        style={{ ...styles.actionBtn, ...styles.retryBtn, opacity: isRetrying ? 0.6 : 1 }}
                        disabled={isRetrying}
                        onClick={(e) => handleRetry(e, group)}
                      >
                        {isRetrying ? 'Retrying...' : '↺ Retry Analysis'}
                      </button>
                    </div>
                  )}

                  {isQuality && (
                    <div>
                      <p style={styles.qualityMsg}>
                        {group.latestErrorDetails || 'A clearer photo will give a more accurate result.'}
                      </p>
                      <button
                        style={{ ...styles.actionBtn, ...styles.retakeBtn }}
                        onClick={(e) => { e.stopPropagation(); onRetakePhoto?.() }}
                      >
                        📸 Retake Photo
                      </button>
                    </div>
                  )}

                  {!isPending && !isError && !isQuality && (
                    <div style={styles.statusRow}>
                      <span style={{ ...styles.dot, background: group.latestHealthColor || 'var(--leaf)' }} />
                      <span style={styles.statusLabel}>{group.latestStatus || 'Processing...'}</span>
                    </div>
                  )}
                </div>

                {isClickable && <span style={styles.chevron}>›</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    flex: 1,
    padding: '32px 20px 60px',
    maxWidth: '600px',
    margin: '0 auto',
    width: '100%',
  },

  loadingPage: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    color: 'var(--text-4)',
  },
  loadingDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: 'var(--leaf)',
    animation: 'pulse 1.4s infinite',
  },
  loadingText: { fontSize: '14px', color: 'var(--text-4)' },

  header: { marginBottom: '28px' },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--text-1)',
    letterSpacing: '-0.5px',
    marginBottom: '4px',
  },
  subtitle: { fontSize: '14px', color: 'var(--text-3)' },

  emptyState: {
    textAlign: 'center',
    padding: '60px 24px',
    background: 'var(--card)',
    borderRadius: 'var(--r-xl)',
    border: '1px dashed var(--border)',
  },
  emptyIcon: { fontSize: '48px', marginBottom: '16px' },
  emptyTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '22px',
    color: 'var(--text-1)',
    marginBottom: '10px',
  },
  emptyText: { fontSize: '14px', color: 'var(--text-3)', lineHeight: '1.6' },

  list: { display: 'grid', gap: '14px' },

  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    background: 'var(--card)',
    padding: '16px',
    borderRadius: 'var(--r-lg)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-xs)',
    transition: 'box-shadow 0.2s, transform 0.15s',
  },
  cardClickable: {
    cursor: 'pointer',
  },
  cardError: {
    border: '1px solid #FFCDD2',
    background: '#FFF8F8',
  },
  cardQuality: {
    border: '1px solid #FFE082',
    background: '#FFFDE7',
  },

  thumbWrap: { position: 'relative', flexShrink: 0 },
  thumb: {
    width: '80px',
    height: '80px',
    borderRadius: 'var(--r-md)',
    objectFit: 'cover',
    background: 'var(--mist)',
  },
  scanBadge: {
    position: 'absolute',
    top: '-6px',
    left: '-6px',
    background: 'var(--primary)',
    color: '#fff',
    fontSize: '10px',
    fontWeight: '800',
    padding: '3px 8px',
    borderRadius: 'var(--r-full)',
    border: '2px solid var(--card)',
    boxShadow: 'var(--shadow-sm)',
  },

  content: { flex: 1, minWidth: 0 },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '2px',
  },
  plantName: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-1)',
    letterSpacing: '-0.2px',
  },
  date: {
    fontSize: '11px',
    color: 'var(--text-4)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    flexShrink: 0,
    marginLeft: '8px',
  },
  sciName: {
    fontSize: '13px',
    color: 'var(--text-3)',
    fontStyle: 'italic',
    marginBottom: '8px',
  },

  statusRow: { display: 'flex', alignItems: 'center', gap: '7px' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  statusLabel: { fontSize: '13px', fontWeight: '600', color: 'var(--text-2)' },

  errorMsg: {
    fontSize: '12px',
    color: 'var(--critical)',
    marginBottom: '8px',
    lineHeight: '1.4',
  },
  qualityMsg: {
    fontSize: '12px',
    color: '#78350f',
    marginBottom: '8px',
    lineHeight: '1.4',
  },

  actionBtn: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: 'var(--r-sm)',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  retryBtn: { background: 'var(--primary)', color: '#fff' },
  retakeBtn: { background: '#F59E0B', color: '#fff' },

  chevron: {
    fontSize: '22px',
    color: 'var(--border)',
    fontWeight: '300',
    marginLeft: '4px',
    flexShrink: 0,
  },
}
