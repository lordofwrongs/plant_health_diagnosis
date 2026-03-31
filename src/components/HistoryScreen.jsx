import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'

export default function HistoryScreen({ onSelectResult }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    const guestId = localStorage.getItem('plant_care_guest_id')
    const { data, error } = await supabase
      .from('plant_logs')
      .select('*')
      .eq('user_id', guestId)
      .order('created_at', { ascending: false })

    if (!error) setLogs(data)
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
      <h2 style={styles.title}>Your Scans</h2>
      {logs.length === 0 ? (
        <p style={styles.emptyText}>No scans yet. Upload a photo to begin!</p>
      ) : (
        <div style={styles.list}>
          {logs.map(log => {
            const isDone = log.status === 'done';
            return (
              <div 
                key={log.id} 
                onClick={() => isDone && onSelectResult(log)}
                style={{ 
                  ...styles.card,
                  cursor: isDone ? 'pointer' : 'wait',
                  opacity: isDone ? 1 : 0.85,
                  border: isDone ? '1px solid #e8f5e9' : '1px solid #fff3e0'
                }}
              >
                {/* Image Preview */}
                <div style={styles.imageWrapper}>
                  <img src={log.image_url} alt="" style={styles.thumbnail} />
                  {!isDone && <div style={styles.imageOverlay}><span className="spinner-small" /></div>}
                </div>

                <div style={styles.content}>
                  <div style={styles.row}>
                    {/* Shows the AI name if done, otherwise a descriptive placeholder */}
                    <h4 style={styles.plantTitle}>
                      {log.PlantName || `Scan from ${new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </h4>
                    
                    {/* New: Quick Accuracy Score for ready items */}
                    {isDone && log.AccuracyScore && (
                      <span style={styles.miniScore}>{Math.round(log.AccuracyScore)}%</span>
                    )}
                  </div>

                  <div style={styles.footer}>
                    <span style={styles.date}>{new Date(log.created_at).toLocaleDateString()}</span>
                    
                    {/* Clearer Status Badges */}
                    <span style={{ 
                      ...styles.statusBadge,
                      background: isDone ? '#e8f5e9' : '#fff3e0',
                      color: isDone ? '#2d6a4f' : '#e65100'
                    }}>
                      {isDone ? 'View Results' : 'Analyzing...'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { padding: '20px', maxWidth: '500px', margin: '0 auto', width: '100%' },
  title: { fontFamily: "'Playfair Display', serif", color: '#1a3a2a', marginBottom: '24px', fontSize: '28px' },
  loading: { textAlign: 'center', padding: '100px 20px', color: '#8aaa96' },
  list: { display: 'grid', gap: '16px' },
  card: { 
    display: 'flex', alignItems: 'center', gap: '16px', background: '#fff', 
    padding: '12px', borderRadius: '18px', boxShadow: '0 4px 15px rgba(0,0,0,0.04)',
    transition: 'all 0.2s ease'
  },
  imageWrapper: { position: 'relative', flexShrink: 0 },
  thumbnail: { width: '70px', height: '70px', borderRadius: '14px', objectFit: 'cover' },
  imageOverlay: { position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.4)', borderRadius: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, minWidth: 0 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' },
  plantTitle: { margin: 0, color: '#1a3a2a', fontSize: '16px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  miniScore: { fontSize: '10px', background: '#f0faf4', color: '#52b788', padding: '2px 6px', borderRadius: '6px', fontWeight: 'bold' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: '12px', color: '#8aaa96' },
  statusBadge: { fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: '600', letterSpacing: '0.3px' },
  emptyText: { textAlign: 'center', color: '#8aaa96', marginTop: '40px' }
}