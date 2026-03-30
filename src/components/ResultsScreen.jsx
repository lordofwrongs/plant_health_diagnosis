import React from 'react';

export default function ResultsScreen({ result, onReset }) {
  // Use the AI-provided HealthColor if it exists, otherwise fallback to local logic
  const healthColor = result?.HealthColor 
    ? { bg: `${result.HealthColor}15`, text: result.HealthColor, dot: result.HealthColor }
    : getHealthColor(result?.HealthStatus);

  // Parse the CarePlan (handles both Array from AI and String from n8n)
  const recommendations = parseList(result?.CarePlan || result?.recommendations);

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
            <p style={styles.identityLabel}>Species Identified</p>
            {/* Mapped to PlantName (PascalCase) */}
            <h2 style={styles.plantName}>{result?.PlantName || 'Unknown plant'}</h2>
            {/* Mapped to ScientificName */}
            {result?.ScientificName && (
              <p style={styles.scientificName}>{result.ScientificName}</p>
            )}
            
            <div style={{ ...styles.healthBadge, background: healthColor.bg, color: healthColor.text }}>
              <span style={{ ...styles.healthDot, background: healthColor.dot }} />
              {/* Mapped to HealthStatus (PascalCase) */}
              {result?.HealthStatus || 'Assessment pending'}
            </div>
          </div>
        </div>

        {/* Visual Analysis Section */}
        {result?.VisualAnalysis && (
          <div style={styles.section} className="fade-up-delay-2">
            <div style={styles.sectionHeader}>
              <SearchIcon />
              <h3 style={styles.sectionTitle}>Botanical Analysis</h3>
            </div>
            <p style={styles.analysisText}>{result.VisualAnalysis}</p>
          </div>
        )}

        {/* Care Plan / Recommendations */}
        {recommendations.length > 0 && (
          <div style={styles.section} className="fade-up-delay-3">
            <div style={styles.sectionHeader}>
              <RemedyIcon />
              <h3 style={styles.sectionTitle}>Care Plan</h3>
            </div>
            <div style={styles.remediesList}>
              {recommendations.map((rec, i) => (
                <div key={i} style={styles.remedyItem}>
                  <span style={styles.remedyNumber}>{i + 1}</span>
                  <span style={styles.remedyText}>{rec.replace(/^•\s*/, '')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expert Tip (Cool Feature) */}
        {result?.ExpertTip && (
          <div style={styles.expertTipBox} className="fade-up-delay-4">
            <div style={styles.sectionHeader}>
              <BulbIcon />
              <h3 style={{...styles.sectionTitle, color: '#1b5e20'}}>Pro Tip</h3>
            </div>
            <p style={styles.tipText}>{result.ExpertTip}</p>
          </div>
        )}

        {/* Scan again */}
        <button style={styles.resetBtn} onClick={onReset} className="fade-up-delay-5">
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
  if (typeof val === 'string') {
    // Splits by bullet points, newlines, or semicolons
    return val.split(/[•\n;]+/).map(s => s.trim()).filter(Boolean)
  }
  return []
}

function getHealthColor(health) {
  const h = (health || '').toLowerCase()
  if (h.includes('healthy')) return { bg: '#e8f5e9', text: '#1b5e20', dot: '#43a047' }
  if (h.includes('deficient') || h.includes('risk') || h.includes('caution') || h.includes('infection')) 
    return { bg: '#fff8e1', text: '#e65100', dot: '#ffa000' }
  if (h.includes('disease') || h.includes('critical') || h.includes('severe')) 
    return { bg: '#ffebee', text: '#b71c1c', dot: '#e53935' }
  return { bg: '#f3f4f6', text: '#374151', dot: '#9ca3af' }
}

// Icons
function LeafIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="#52b788" stroke="#2d6a4f" strokeWidth="1.5"/><path d="M12 22C12 22 9 16 11 10" stroke="#2d6a4f" strokeWidth="1.2" strokeLinecap="round"/></svg> }
function SearchIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> }
function RemedyIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 22C6 22 2 16 2 10C2 10 8 4 16 6C18 10 16 16 12 22Z" fill="none" stroke="#2d6a4f" strokeWidth="1.8"/><path d="M9 12l2 2 4-4" stroke="#2d6a4f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function BulbIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffa000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M15.09 14c.18-.14.37-.32.47-.52a4 4 0 1 0-7.12 0c.1.2.29.38.47.52C9.75 15.31 10 16.33 10 17h4c0-.67.25-1.69.91-3z"/></svg> }

const styles = {
  page: { minHeight: '100vh', background: 'linear-gradient(160deg, #f0faf4 0%, #faf8f3 60%, #e8f5e9 100%)', padding: '32px 20px 40px', display: 'flex', justifyContent: 'center' },
  wrapper: { width: '100%', maxWidth: '440px' },
  header: { display: 'flex', justifyContent: 'center', marginBottom: '24px' },
  logo: { display: 'flex', alignItems: 'center', gap: '8px' },
  logoText: { fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: '600', color: '#1a3a2a' },
  identityCard: { background: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 8px 40px rgba(26,58,42,0.10)', marginBottom: '16px', border: '1px solid rgba(82,183,136,0.15)' },
  plantImage: { width: '100%', height: '200px', objectFit: 'cover' },
  identityInfo: { padding: '20px 24px' },
  identityLabel: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#8aaa96', marginBottom: '6px', fontWeight: '500' },
  plantName: { fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: '500', color: '#1a3a2a', marginBottom: '4px' },
  scientificName: { fontSize: '14px', fontStyle: 'italic', color: '#52796f', marginBottom: '12px' },
  healthBadge: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' },
  healthDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  section: { background: '#fff', borderRadius: '16px', padding: '20px 24px', marginBottom: '12px', boxShadow: '0 4px 20px rgba(26,58,42,0.06)', border: '1px solid rgba(82,183,136,0.10)' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' },
  sectionTitle: { fontSize: '15px', fontWeight: '600', color: '#1a3a2a' },
  analysisText: { fontSize: '14px', color: '#4a6358', lineHeight: '1.6', fontWeight: '300' },
  remediesList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  remedyItem: { display: 'flex', alignItems: 'flex-start', gap: '12px' },
  remedyNumber: { width: '22px', height: '22px', borderRadius: '50%', background: 'linear-gradient(135deg, #2d6a4f, #52b788)', color: '#fff', fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  remedyText: { fontSize: '14px', color: '#4a6358', lineHeight: '1.6', fontWeight: '400' },
  expertTipBox: { background: '#fff9c4', borderRadius: '16px', padding: '20px 24px', marginBottom: '20px', border: '1px solid #fff176' },
  tipText: { fontSize: '14px', color: '#33691e', lineHeight: '1.6', fontWeight: '500' },
  resetBtn: { width: '100%', padding: '16px', background: 'linear-gradient(135deg, #2d6a4f, #52b788)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', marginTop: '8px', marginBottom: '16px', fontFamily: "inherit" },
  disclaimer: { fontSize: '11px', color: '#8aaa96', textAlign: 'center', lineHeight: '1.5' },
}