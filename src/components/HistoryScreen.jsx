import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'

export default function HistoryScreen({ onSelectPlant, onRetakePhoto }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

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
          {groups.length === 0
            ? 'No plants yet'
            : `${groups.length} ${groups.length === 1 ? 'plant' : 'plants'}`}
        </p>
      </header>

      {groups.length === 0 ? (
        <EmptyState onRetakePhoto={onRetakePhoto} />
      ) : (
        <div className="fade-up-delay-1" style={styles.grid}>
          {groups.map(group => (
            <PlantCard key={group.id} group={group} onClick={() => onSelectPlant(group)} />
          ))}
        </div>
      )}
    </div>
  )
}

function PlantCard({ group, onClick }) {
  const isPending = group.latestScanStatus === 'pending'
  const isError   = group.latestScanStatus === 'error' || group.latestScanStatus === 'quality_issue'
  const isDone    = group.latestScanStatus === 'done'

  return (
    <div
      style={styles.card}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View ${group.nickname}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <img src={group.latestImage} alt={group.nickname} style={styles.cardImg} />

      {/* Scan count badge */}
      {group.scans.length > 1 && (
        <div style={styles.scanBadge}>{group.scans.length}</div>
      )}

      {/* Pending overlay */}
      {isPending && (
        <div style={styles.pendingOverlay}>
          <span style={styles.pendingDot} />
          <span style={styles.pendingText}>Analysing</span>
        </div>
      )}

      {/* Error badge */}
      {isError && (
        <div style={styles.errorBadge} aria-label="Needs attention">!</div>
      )}

      {/* Bottom gradient with name + health */}
      <div style={styles.cardOverlay}>
        <p style={styles.cardName}>{group.nickname}</p>
        {isDone && group.latestStatus && (
          <div style={styles.cardStatusRow}>
            <span style={{ ...styles.cardDot, background: group.latestHealthColor || 'var(--leaf)' }} />
            <span style={styles.cardStatus}>{group.latestStatus}</span>
          </div>
        )}
        {(isPending || isError) && (
          <span style={styles.cardStatusMuted}>
            {isPending ? 'Analysing...' : 'Needs attention'}
          </span>
        )}
      </div>
    </div>
  )
}

function EmptyState({ onRetakePhoto }) {
  return (
    <div className="fade-up-delay-1" style={styles.emptyState}>
      <div style={styles.sampleCard}>
        <div style={styles.sampleThumb}>🌿</div>
        <div style={styles.sampleContent}>
          <p style={styles.sampleName}>Snake Gourd</p>
          <p style={styles.sampleSci}>Trichosanthes cucumerina</p>
          <div style={styles.sampleStatus}>
            <span style={{ ...styles.dot, background: '#4CAF50' }} />
            <span style={{ ...styles.sampleStatusLabel, color: '#4CAF50' }}>Healthy</span>
          </div>
        </div>
        <span style={styles.sampleBadge}>Example</span>
      </div>
      <h3 style={styles.emptyTitle}>Your garden awaits</h3>
      <p style={styles.emptyText}>
        Scan any plant to identify it, diagnose its health, and get a personalised care plan.
      </p>
      <button style={styles.emptyAction} onClick={onRetakePhoto}>
        🌿 Scan your first plant
      </button>
    </div>
  )
}

const styles = {
  loadingPage: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
  },
  loadingDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: 'var(--leaf)',
    animation: 'pulse 1.4s infinite',
  },
  loadingText: { fontSize: '14px', color: 'var(--text-4)' },

  page: {
    flex: 1,
    padding: '32px 20px 60px',
    maxWidth: '600px',
    margin: '0 auto',
    width: '100%',
  },

  header: { marginBottom: '24px' },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--text-1)',
    letterSpacing: '-0.5px',
    marginBottom: '4px',
  },
  subtitle: { fontSize: '14px', color: 'var(--text-3)' },

  // 2-column photo grid
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },

  card: {
    position: 'relative',
    borderRadius: 'var(--r-lg)',
    overflow: 'hidden',
    aspectRatio: '3 / 4',
    cursor: 'pointer',
    background: 'var(--mist)',
    boxShadow: 'var(--shadow-sm)',
  },
  cardImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },

  // Scan count — top right
  scanBadge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'rgba(10,31,20,0.7)',
    backdropFilter: 'blur(4px)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '800',
    padding: '3px 9px',
    borderRadius: 'var(--r-full)',
  },

  // Pending overlay (full card)
  pendingOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(10,31,20,0.5)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  pendingDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: 'var(--leaf)',
    animation: 'pulse 1.4s infinite',
  },
  pendingText: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
  },

  // Error badge — top left
  errorBadge: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    background: '#DC2626',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '900',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  },

  // Bottom gradient overlay
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '36px 12px 12px',
    background: 'linear-gradient(to top, rgba(10,31,20,0.85) 0%, rgba(10,31,20,0) 100%)',
  },
  cardName: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: '700',
    letterSpacing: '-0.2px',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardStatusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  cardDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  cardStatus: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: '11px',
    fontWeight: '500',
  },
  cardStatusMuted: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: '11px',
    fontWeight: '500',
  },

  // Empty state
  emptyState: {
    textAlign: 'center',
    padding: '60px 24px',
    background: 'var(--card)',
    borderRadius: 'var(--r-xl)',
    border: '1px dashed var(--border)',
  },
  sampleCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding: '14px 16px',
    marginBottom: '24px',
    width: '100%',
    position: 'relative',
    opacity: 0.75,
  },
  sampleThumb: {
    fontSize: '36px',
    width: '56px',
    height: '56px',
    background: 'rgba(82,183,136,0.12)',
    borderRadius: 'var(--r-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sampleContent: { flex: 1, minWidth: 0 },
  sampleName:   { fontSize: '15px', fontWeight: '700', color: 'var(--text-1)', margin: 0, marginBottom: '2px' },
  sampleSci:    { fontSize: '12px', color: 'var(--text-3)', fontStyle: 'italic', margin: 0, marginBottom: '6px' },
  sampleStatus: { display: 'flex', alignItems: 'center', gap: '7px' },
  dot:          { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  sampleStatusLabel: { fontSize: '13px', fontWeight: '600' },
  sampleBadge: {
    position: 'absolute',
    top: '10px',
    right: '12px',
    fontSize: '9px',
    fontWeight: '800',
    color: 'var(--mid)',
    background: 'var(--sage)',
    borderRadius: 'var(--r-full)',
    padding: '2px 8px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  emptyTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '22px',
    color: 'var(--text-1)',
    marginBottom: '10px',
  },
  emptyText: { fontSize: '14px', color: 'var(--text-3)', lineHeight: '1.6' },
  emptyAction: {
    marginTop: '20px',
    padding: '14px 28px',
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-full)',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(27,67,50,0.2)',
  },
}
