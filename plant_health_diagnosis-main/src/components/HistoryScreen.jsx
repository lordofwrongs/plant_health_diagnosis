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

export default function HistoryScreen({ onSelectResult }) {
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
      // Reset to pending so realtime subscription shows it as in-progress
      await supabase.from('plant_logs')
        .update({ status: 'pending', error_details: null })
        .eq('id', scanId)

      // Invoke the edge function — fire and forget; realtime picks up the result
      supabase.functions.invoke('plant-processor', {
        body: { record: { id: scanId, image_url: scan.image_url, plant_nickname: scan.plant_nickname, user_id: scan.user_id } },
      }).catch(err => logger.error('HistoryScreen', `Retry invocation failed: ${err.message}`, { record_id: scanId }))

    } catch (err) {
      logger.error('HistoryScreen', `Retry setup failed: ${err.message}`, { record_id: scanId })
    } finally {
      setRetrying(prev => ({ ...prev, [scanId]: false }))
    }
  }

  if (loading) return <div style={styles.loading}>Accessing your garden archives...</div>

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>Your Garden</h2>
        <p style={styles.subtitle}>{groups.length} species under observation</p>
      </header>

      {groups.length === 0 ? (
        <div style={styles.emptyContainer}>
          <p style={styles.emptyText}>Your garden is empty. Start your first analysis to track health trends.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {groups.map((group) => {
            const isPending = group.latestScanStatus === 'pending'
            const isError   = group.latestScanStatus === 'error'
            const isRetrying = retrying[group.latestScanId]

            return (
              <div
                key={group.id}
                style={{ ...styles.card, ...(isError ? styles.cardError : {}) }}
                onClick={() => !isError && !isPending && onSelectResult(group.scans[0], group.scans)}
              >
                <div style={styles.imageWrapper}>
                  <img src={group.latestImage} style={styles.thumbnail} alt="Latest" />
                  {group.scans.length > 1 && (
                    <div style={styles.badge}>{group.scans.length} scans</div>
                  )}
                </div>

                <div style={styles.content}>
                  <div style={styles.row}>
                    <h3 style={styles.plantTitle}>{group.nickname}</h3>
                    <span style={styles.timestamp}>
                      {new Date(group.latestTimestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p style={styles.scientificName}>{group.plantName}</p>

                  {isPending && (
                    <div style={styles.statusRow}>
                      <div style={{ ...styles.statusDot, background: '#FFA726', animation: 'pulse 1.5s infinite' }} />
                      <span style={{ ...styles.statusText, color: '#FFA726' }}>Processing...</span>
                    </div>
                  )}

                  {isError && (
                    <>
                      <p style={styles.errorMsg}>{friendlyError(group.latestErrorDetails)}</p>
                      <button
                        style={{ ...styles.retryBtn, opacity: isRetrying ? 0.6 : 1 }}
                        disabled={isRetrying}
                        onClick={(e) => handleRetry(e, group)}
                      >
                        {isRetrying ? 'Retrying...' : '↺ Retry Analysis'}
                      </button>
                    </>
                  )}

                  {!isPending && !isError && (
                    <div style={styles.statusRow}>
                      <div style={{
                        ...styles.statusDot,
                        background: group.latestHealthColor || (group.latestStatus?.toLowerCase().includes('healthy') ? '#4CAF50' : '#FF9800'),
                      }} />
                      <span style={styles.statusText}>{group.latestStatus || 'Processing...'}</span>
                    </div>
                  )}
                </div>

                {!isError && !isPending && <div style={styles.chevron}>›</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  container:     { padding: '24px 20px', maxWidth: '600px', margin: '0 auto', minHeight: '100vh' },
  header:        { marginBottom: '28px' },
  title:         { fontFamily: "'Playfair Display', serif", color: '#1a3a2a', fontSize: '32px', margin: '0 0 6px 0', letterSpacing: '-0.5px' },
  subtitle:      { fontSize: '14px', color: '#6a8378', fontWeight: '400' },
  loading:       { textAlign: 'center', padding: '100px 20px', color: '#8aaa96', fontSize: '15px' },
  list:          { display: 'grid', gap: '18px' },
  card: {
    display: 'flex', alignItems: 'center', gap: '18px', background: '#fff',
    padding: '18px', borderRadius: '24px', boxShadow: '0 8px 24px rgba(26,58,42,0.04)',
    cursor: 'pointer', transition: 'all 0.2s ease', border: '1px solid #f0f4f2',
  },
  cardError:     { border: '1px solid #ffcdd2', background: '#fff8f8', cursor: 'default' },
  imageWrapper:  { position: 'relative', flexShrink: 0 },
  thumbnail:     { width: '85px', height: '85px', borderRadius: '18px', objectFit: 'cover', background: '#f0f4f2' },
  badge: {
    position: 'absolute', top: '-6px', left: '-6px', background: '#2d6a4f',
    color: '#fff', fontSize: '10px', padding: '4px 10px', borderRadius: '12px',
    fontWeight: '800', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  content:       { flex: 1, minWidth: 0 },
  row:           { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  plantTitle:    { margin: 0, color: '#1a3a2a', fontSize: '18px', fontWeight: '700', letterSpacing: '-0.3px' },
  timestamp:     { fontSize: '11px', color: '#9aaa96', fontWeight: '600', textTransform: 'uppercase' },
  scientificName:{ fontSize: '14px', color: '#6a8378', marginBottom: '8px', fontStyle: 'italic', display: 'block' },
  statusRow:     { display: 'flex', alignItems: 'center', gap: '8px' },
  statusDot:     { width: '8px', height: '8px', borderRadius: '50%' },
  statusText:    { fontSize: '13px', fontWeight: '600', color: '#4a6358' },
  errorMsg:      { fontSize: '12px', color: '#c62828', marginBottom: '8px', lineHeight: '1.4' },
  retryBtn: {
    padding: '7px 16px', background: '#2d6a4f', color: '#fff', border: 'none',
    borderRadius: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer',
  },
  chevron:       { fontSize: '24px', color: '#cbdad2', marginLeft: '4px', fontWeight: '300' },
  emptyContainer:{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '24px', border: '1px dashed #cbdad2' },
  emptyText:     { color: '#6a8378', fontSize: '15px', lineHeight: '1.6' },
}
