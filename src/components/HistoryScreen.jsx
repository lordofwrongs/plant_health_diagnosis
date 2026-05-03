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

const FAN_CARDS = [
  { rotate: '-14deg', tx: '-62%', ty: '10px', zIndex: 1, bg: 'linear-gradient(155deg, #1B4332 0%, #2D6A4F 100%)', emoji: '🌱', name: 'Basil' },
  { rotate:  '10deg', tx: '-42%', ty: '6px',  zIndex: 2, bg: 'linear-gradient(155deg, #2D6A4F 0%, #52B788 100%)', emoji: '🍃', name: 'Monstera' },
  { rotate:  '-2deg', tx: '-54%', ty: '0px',  zIndex: 3, bg: 'linear-gradient(155deg, #52B788 0%, #95D5B2 100%)', emoji: '🌿', name: 'Tomato' },
]

function EmptyState({ onRetakePhoto }) {
  return (
    <div className="fade-up-delay-1" style={styles.emptyState}>
      {/* Fan of mock photo cards */}
      <div style={styles.fanWrap} aria-hidden="true">
        {FAN_CARDS.map((card, i) => (
          <div key={i} style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: `translateX(${card.tx}) translateY(${card.ty}) rotate(${card.rotate})`,
            zIndex: card.zIndex,
            width: '88px',
            height: '118px',
            borderRadius: '16px',
            background: card.bg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 6px 20px rgba(10,31,20,0.22)',
          }}>
            <span style={{ fontSize: '32px', lineHeight: 1 }}>{card.emoji}</span>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', fontWeight: '700' }}>{card.name}</span>
          </div>
        ))}
      </div>

      <h3 style={styles.emptyTitle}>Your garden awaits</h3>
      <p style={styles.emptyText}>
        Scan any plant to identify it, diagnose its health, and get a personalised care plan.
      </p>
      <button style={styles.emptyAction} onClick={onRetakePhoto}>
        Scan your first plant
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
    paddingTop: '180px',
    paddingBottom: '60px',
    paddingLeft: '24px',
    paddingRight: '24px',
    background: 'var(--card)',
    borderRadius: 'var(--r-xl)',
    border: '1px dashed var(--border)',
    position: 'relative',
    overflow: 'hidden',
  },
  fanWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '180px',
  },
  emptyTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--text-1)',
    marginBottom: '10px',
  },
  emptyText: { fontSize: '14px', color: 'var(--text-3)', lineHeight: '1.65', maxWidth: '280px', margin: '0 auto' },
  emptyAction: {
    marginTop: '24px',
    padding: '15px 32px',
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-full)',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(27,67,50,0.25)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
}
