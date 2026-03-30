import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function HistoryScreen({ onSelectResult }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      const guestId = localStorage.getItem('plant_care_guest_id')
      const { data, error } = await supabase
        .from('plant_logs')
        .select('*')
        .eq('user_id', guestId)
        .order('created_at', { ascending: false })

      if (!error) setLogs(data)
      setLoading(false)
    }
    fetchHistory()
  }, [])

  if (loading) return <div style={{ textAlign: 'center', padding: '50px' }}>Loading history...</div>

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'Playfair Display', color: '#1a3a2a' }}>Your Scans</h2>
      {logs.length === 0 ? (
        <p>No scans found yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '15px' }}>
          {logs.map(log => (
            <div 
              key={log.id} 
              onClick={() => log.status === 'done' && onSelectResult(log)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '15px', 
                background: '#fff', 
                padding: '10px', 
                borderRadius: '10px',
                cursor: log.status === 'done' ? 'pointer' : 'default',
                opacity: log.status === 'done' ? 1 : 0.6
              }}
            >
              <img src={log.image_url} alt="" style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
              <div>
                <h4 style={{ margin: 0 }}>{log.plant_name || 'Identifying...'}</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                  Status: {log.status} • {new Date(log.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}