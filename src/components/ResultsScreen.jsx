export default function ResultsScreen({ result, onReset }) {
  const healthColor = getHealthColor(result?.health)

  // issues and recommendations may be JSON strings or plain text from n8n
  const issues = parseList(result?.issues)
  const recommendations = parseList(result?.recommendations)

  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>
        {/* Header */}
        <div style={styles.header} className="fade-up">
          <div style={styles.logo}>
            <LeafIcon />
            <span style={styles.logoText}>PlantCare</span>
          </div>
        </div>

        {/* Plant identity card */}
        <div style={styles.identityCard} className="fade-up-delay-1">
          {result?.image_url && (
            <img src={result.image_url} alt="Your plant" style={styles.plantImage} />
          )}
          <div style={styles.identityInfo}>
            <p style={styles.identityLabel}>Plant identified</p>
            <h2 style={styles.plantName}>{result?.plant_name || 'Unknown plant'}</h2>
            <div style={{ ...styles.healthBadge, background: healthColor.bg, color: healthColor.text }}>
              <span style={{ ...styles.healthDot, background: healthColor.dot }} />
              {result?.health || 'Assessment pending'}
            </div>
          </div>
        </div>

        {/* Issues */}
        {issues.length > 0 && (
          <div style={styles.section} className="fade-up-delay-2">
            <div style={styles.sectionHeader}>
              <WarningIcon />
              <h3 style={styles.sectionTitle}>Issues detected</h3>
            </div>
            <div style={styles.issuesList}>
              {issues.map((issue, i) => (
                <div key={i} style={styles.issueItem}>
                  <span style={styles.issueDot} />
                  <span style={styles.issueText}>{issue}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div style={styles.section} className="fade-up-delay-3">
            <div style={styles.sectionHeader}>
              <RemedyIcon />
              <h3 style={styles.sectionTitle}>Recommended remedies</h3>
            </div>
            <div style={styles.remediesList}>
              {recommendations.map((rec, i) => (
                <div key={i} style={styles.remedyItem}>
                  <span style={styles.remedyNumber}>{i + 1}</span>
                  <span style={styles.remedyText}>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scan again */}
        <button style={styles.resetBtn} onClick={onReset} className="fade-up-delay-3">
          Scan another plant
        </button>

        <p style={styles.disclaimer}>
          AI-generated diagnosis. Always consult a plant specialist for serious issues.
        </p>
      </div>
    </div>
  )
}

function parseList(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  try {
    const parsed = JSON.parse(val)
    if (Array.isArray(parsed)) return parsed
    return [val]
  } catch {
    // Split by newline or semicolon if plain text
    return val.split(/[\n;]+/).map(s => s.trim()).filter(Boolean)
  }
}

function getHealthColor(health) {
  const h = (health || '').toLowerCase()
  if (h.includes('healthy')) return { bg: '#e8f5e9', text: '#1b5e20', dot: '#43a047' }
  if (h.includes('risk') || h.includes('caution')) return { bg: '#fff8e1', text: '#e65100', dot: '#ffa000' }
  if (h.includes('disease') || h.includes('critical') || h.includes('severe')) return { bg: '#ffebee', text: '#b71c1c', dot: '#e53935' }
  return { bg: '#f3f4f6', text: '#374151', dot: '#9ca3af' }
}

function LeafIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="#52b788" stroke="#2d6a4f" strokeWidth="1.5"/>
      <path d="M12 22C12 22 9 16 11 10" stroke="#2d6a4f" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#e67e22" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

function RemedyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="none" stroke="#2d6a4f" strokeWidth="1.8"/>
      <path d="M9 12l2 2 4-4" stroke="#2d6a4f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #f0faf4 0%, #faf8f3 60%, #e8f5e9 100%)',
    padding: '32px 20px 40px',
    display: 'flex',
    justifyContent: 'center',
  },
  wrapper: {
    width: '100%',
    maxWidth: '440px',
  },
  header: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '22px',
    fontWeight: '600',
    color: '#1a3a2a',
  },
  identityCard: {
    background: '#fff',
    borderRadius: '20px',
    overflow: 'hidden',
    boxShadow: '0 8px 40px rgba(26,58,42,0.10)',
    marginBottom: '16px',
    border: '1px solid rgba(82,183,136,0.15)',
  },
  plantImage: {
    width: '100%',
    height: '200px',
    objectFit: 'cover',
  },
  identityInfo: {
    padding: '20px 24px',
  },
  identityLabel: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: '#8aaa96',
    marginBottom: '6px',
    fontWeight: '500',
  },
  plantName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '22px',
    fontWeight: '500',
    color: '#1a3a2a',
    marginBottom: '12px',
  },
  healthBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '500',
  },
  healthDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  section: {
    background: '#fff',
    borderRadius: '16px',
    padding: '20px 24px',
    marginBottom: '12px',
    boxShadow: '0 4px 20px rgba(26,58,42,0.06)',
    border: '1px solid rgba(82,183,136,0.10)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: '500',
    color: '#1a3a2a',
  },
  issuesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  issueItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  issueDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#e67e22',
    flexShrink: 0,
    marginTop: '6px',
  },
  issueText: {
    fontSize: '14px',
    color: '#4a6358',
    lineHeight: '1.6',
    fontWeight: '300',
  },
  remediesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  remedyItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  remedyNumber: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #2d6a4f, #52b788)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  remedyText: {
    fontSize: '14px',
    color: '#4a6358',
    lineHeight: '1.6',
    fontWeight: '300',
    paddingTop: '2px',
  },
  resetBtn: {
    width: '100%',
    padding: '16px',
    background: 'linear-gradient(135deg, #2d6a4f, #52b788)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    marginTop: '8px',
    marginBottom: '16px',
    letterSpacing: '0.3px',
  },
  disclaimer: {
    fontSize: '11px',
    color: '#8aaa96',
    textAlign: 'center',
    lineHeight: '1.5',
  },
}
