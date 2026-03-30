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
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
      <h2 style={{ fontFamily: 'Playfair Display', color: '#1a3a2a', marginBottom: '20px' }}>Your Scans</h2>
      {logs.length === 0 ? (
        <p style={{ color: '#666' }}>No scans found. Start by scanning a plant!</p>
      ) : (
        <div style={{ display: 'grid', gap: '15px' }}>
          {logs.map(log => (
            <div 
              key={log.id} 
              onClick={() => log.status === 'done' && onSelectResult(log)}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '15px', background: '#fff', 
                padding: '12px', borderRadius: '15px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                cursor: log.status === 'done' ? 'pointer' : 'default',
                opacity: log.status === 'done' ? 1 : 0.7,
                border: '1px solid rgba(82,183,136,0.1)'
              }}
            >
              <img src={log.image_url} alt="" style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 4px 0', color: '#1a3a2a' }}>{log.plant_name || 'Identifying...'}</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#8aaa96' }}>{new Date(log.created_at).toLocaleDateString()}</span>
                  <span style={{ 
                    fontSize: '11px', padding: '2px 8px', borderRadius: '10px', 
                    background: log.status === 'done' ? '#e8f5e9' : '#fff8e1',
                    color: log.status === 'done' ? '#2d6a4f' : '#e65100'
                  }}>
                    {log.status === 'done' ? 'Ready' : 'Processing'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}