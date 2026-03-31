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
      // GROUPING LOGIC: Organizes flat logs into plant "identities"
      const grouped = data.reduce((acc, log) => {
        // Use nickname as the ID, or "Uncategorized" if null
        const key = log.plant_nickname || `Uncategorized-${log.id}`;
        if (!acc[key]) {
          acc[key] = {
            id: key,
            nickname: log.plant_nickname || 'New Discovery',
            plantName: log.PlantName || 'Identifying...',
            latestTimestamp: log.created_at,
            latestImage: log.image_url,
            latestStatus: log.HealthStatus,
            scans: []
          };
        }
        acc[key].scans.push(log);
        return acc;
      }, {});

      setGroups(Object.values(grouped));
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchHistory()
    const channel = supabase
      .channel('history_realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plant_logs' }, () => {
        fetchHistory()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchHistory])

  if (loading) return <div style={styles.loading}>Gathering your garden history...</div>

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>Your Garden</h2>
        <p style={styles.subtitle}>{groups.length} plants being monitored</p>
      </header>

      {groups.length === 0 ? (
        <p style={styles.emptyText}>No scans yet. Upload a photo to begin.</p>
      ) : (
        <div style={styles.list}>
          {groups.map((group) => (
            <div key={group.id} style={styles.card} onClick={() => onSelectResult(group.scans[0])}>
              <div style={styles.imageWrapper}>
                <img src={group.latestImage} style={styles.thumbnail} alt="Latest Scan" />
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
                  <div style={{ ...styles.statusDot, background: group.latestStatus?.toLowerCase().includes('healthy') ? '#4CAF50' : '#FF9800' }} />
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
  container: { padding: '24px 20px', maxWidth: '600px', margin: '0 auto' },
  header: { marginBottom: '24px' },
  title: { fontFamily: "'Playfair Display', serif", color: '#1a3a2a', fontSize: '28px', margin: '0 0 4px 0' },
  subtitle: { fontSize: '14px', color: '#6a8378' },
  loading: { textAlign: 'center', padding: '100px 20px', color: '#8aaa96', fontFamily: 'system-ui' },
  list: { display: 'grid', gap: '16px' },
  card: { 
    display: 'flex', alignItems: 'center', gap: '16px', background: '#fff', 
    padding: '16px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(26,58,42,0.06)',
    cursor: 'pointer', transition: 'transform 0.2s ease', border: '1px solid #f0f4f2'
  },
  imageWrapper: { position: 'relative', flexShrink: 0 },
  thumbnail: { width: '80px', height: '80px', borderRadius: '16px', objectFit: 'cover' },
  badge: { 
    position: 'absolute', bottom: '-8px', right: '-8px', background: '#2d6a4f', 
    color: '#fff', fontSize: '10px', padding: '4px 8px', borderRadius: '10px', 
    fontWeight: 'bold', border: '2px solid #fff' 
  },
  content: { flex: 1, minWidth: 0 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' },
  plantTitle: { margin: 0, color: '#1a3a2a', fontSize: '17px', fontWeight: '600' },
  timestamp: { fontSize: '12px', color: '#9aaa96' },
  scientificName: { fontSize: '13px', color: '#6a8378', marginBottom: '8px', fontStyle: 'italic' },
  statusRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  statusText: { fontSize: '12px', fontWeight: '500', color: '#4a6358' },
  chevron: { fontSize: '24px', color: '#cbdad2', marginLeft: '8px' },
  emptyText: { textAlign: 'center', color: '#9aaa96', marginTop: '40px' }
}