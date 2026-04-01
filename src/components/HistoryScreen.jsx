import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'

export default function HistoryScreen({ onSelectResult }) {
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
      // GROUPING LOGIC: Groups by Nickname first, then PlantName
      const grouped = data.reduce((acc, log) => {
        const identity = log.plant_nickname || log.PlantName || 'Identifying...';
        const key = identity;

        if (!acc[key]) {
          acc[key] = {
            id: key,
            nickname: log.plant_nickname || log.PlantName || 'New Discovery',
            plantName: log.PlantName || 'Identifying...',
            latestTimestamp: log.created_at,
            latestImage: log.image_url,
            latestStatus: log.HealthStatus,
            latestHealthColor: log.HealthColor,
            scans: []
          };
        }
        
        acc[key].scans.push(log);

        // Ensure the card reflects the absolute most recent scan data
        if (new Date(log.created_at) > new Date(acc[key].latestTimestamp)) {
          acc[key].latestTimestamp = log.created_at;
          acc[key].latestImage = log.image_url;
          acc[key].latestStatus = log.HealthStatus;
          acc[key].latestHealthColor = log.HealthColor;
        }

        return acc;
      }, {});

      setGroups(Object.values(grouped));
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchHistory()
    const channel = supabase
      .channel('history_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plant_logs' }, () => {
        fetchHistory()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchHistory])

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
          {groups.map((group) => (
            <div 
              key={group.id} 
              style={styles.card} 
              // PROFESSIONAL CHANGE: Pass the full 'scans' array, not just the first one
              onClick={() => onSelectResult(group.scans[0], group.scans)}
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
                <div style={styles.statusRow}>
                  <div style={{ 
                    ...styles.statusDot, 
                    background: group.latestHealthColor || (group.latestStatus?.toLowerCase().includes('healthy') ? '#4CAF50' : '#FF9800') 
                  }} />
                  <span style={styles.statusText}>{group.latestStatus || 'Processing...'}</span>
                </div>
              </div>
              <div style={styles.chevron}>›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { padding: '24px 20px', maxWidth: '600px', margin: '0 auto', minHeight: '100vh' },
  header: { marginBottom: '28px' },
  title: { fontFamily: "'Playfair Display', serif", color: '#1a3a2a', fontSize: '32px', margin: '0 0 6px 0', letterSpacing: '-0.5px' },
  subtitle: { fontSize: '14px', color: '#6a8378', fontWeight: '400' },
  loading: { textAlign: 'center', padding: '100px 20px', color: '#8aaa96', fontSize: '15px' },
  list: { display: 'grid', gap: '18px' },
  card: { 
    display: 'flex', alignItems: 'center', gap: '18px', background: '#fff', 
    padding: '18px', borderRadius: '24px', boxShadow: '0 8px 24px rgba(26,58,42,0.04)',
    cursor: 'pointer', transition: 'all 0.2s ease', border: '1px solid #f0f4f2'
  },
  imageWrapper: { position: 'relative', flexShrink: 0 },
  thumbnail: { width: '85px', height: '85px', borderRadius: '18px', objectFit: 'cover', background: '#f0f4f2' },
  badge: { 
    position: 'absolute', top: '-6px', left: '-6px', background: '#2d6a4f', 
    color: '#fff', fontSize: '10px', padding: '4px 10px', borderRadius: '12px', 
    fontWeight: '800', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  content: { flex: 1, minWidth: 0 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  plantTitle: { margin: 0, color: '#1a3a2a', fontSize: '18px', fontWeight: '700', letterSpacing: '-0.3px' },
  timestamp: { fontSize: '11px', color: '#9aaa96', fontWeight: '600', textTransform: 'uppercase' },
  scientificName: { fontSize: '14px', color: '#6a8378', marginBottom: '10px', fontStyle: 'italic', display: 'block' },
  statusRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  statusText: { fontSize: '13px', fontWeight: '600', color: '#4a6358' },
  chevron: { fontSize: '24px', color: '#cbdad2', marginLeft: '4px', fontWeight: '300' },
  emptyContainer: { textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: '24px', border: '1px dashed #cbdad2' },
  emptyText: { color: '#6a8378', fontSize: '15px', lineHeight: '1.6' }
}