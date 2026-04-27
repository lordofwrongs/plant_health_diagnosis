import React, { useState } from 'react';
import { supabase } from '../supabaseClient.js';

export default function ResultsScreen({ result, userLanguage, onReset, onBack, allScans = [] }) {
  const [feedbackStatus, setFeedbackStatus] = useState(null);

  const getDynamicName = () => {
    if (!result) return 'New Discovery';
    const meta = result.vernacular_metadata;
    const currentLangKey = userLanguage?.toLowerCase();
    if (!meta || !currentLangKey || currentLangKey === 'english') {
      return result.PlantName || 'New Discovery';
    }
    const matchingKey = Object.keys(meta).find(k => k.toLowerCase().includes(currentLangKey));
    if (matchingKey && meta[matchingKey]) {
      const localName = meta[matchingKey];
      const englishRef = meta.english || result.PlantName;
      return `${localName} (${englishRef})`;
    }
    return result.PlantName || 'New Discovery';
  };

  const previousScan = allScans.length > 1 ? allScans[1] : null;

  const healthColor = result?.HealthColor
    ? { bg: `${result.HealthColor}18`, text: result.HealthColor, dot: result.HealthColor }
    : { bg: 'var(--mist)', text: 'var(--mid)', dot: 'var(--leaf)' };

  const recommendations = result?.CarePlan
    ? result.CarePlan.split('\n').filter(line => line.trim() !== '')
    : [];

  const handleFeedback = async (isCorrect) => {
    setFeedbackStatus(isCorrect ? 'correct' : 'incorrect');
    let userCorrection = null;
    if (!isCorrect) {
      userCorrection = window.prompt('What is the correct name of this plant? (Optional)');
    }
    try {
      await supabase
        .from('plant_logs')
        .update({ IsCorrect: isCorrect, UserCorrection: userCorrection })
        .eq('id', result.id);
    } catch (err) {
      console.error('Feedback Error:', err);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>

        {/* Nav row */}
        <div style={styles.navRow}>
          <button onClick={onBack} style={styles.backBtn}>
            <span style={styles.backArrow}>←</span> My Garden
          </button>
          <button onClick={onReset} style={styles.newScanBtn}>+ New Scan</button>
        </div>

        {/* Weather alert */}
        {result?.WeatherAlert && (
          <div className="fade-up" style={styles.weatherCard}>
            <span style={styles.weatherIcon}>⚠️</span>
            <div>
              <p style={styles.weatherTitle}>Climate Alert</p>
              <p style={styles.weatherText}>{result.WeatherAlert}</p>
            </div>
          </div>
        )}

        {/* Hero card */}
        <div className="fade-up verdant-card" style={styles.heroCard}>
          <div style={styles.imgWrap}>
            <img src={result?.image_url} alt="Scanned plant" style={styles.heroImg} />
            <div style={{ ...styles.healthPill, background: healthColor.bg, color: healthColor.text }}>
              <span style={{ ...styles.healthDot, background: healthColor.dot }} />
              {result?.HealthStatus || 'Analysing...'}
            </div>
          </div>

          <div style={styles.heroInfo}>
            <div style={styles.nameRow}>
              <h1 style={styles.plantName}>{getDynamicName()}</h1>
              {previousScan && (
                <span style={styles.trendChip}>
                  {result?.HealthStatus === previousScan?.HealthStatus ? 'Stable' : 'Changed'}
                </span>
              )}
            </div>
            <p style={styles.sciName}>{result?.ScientificName}</p>

            {result?.vernacular_metadata && (
              <div style={styles.vernRow}>
                {Object.entries(result.vernacular_metadata).map(([lang, name]) =>
                  lang !== 'english' && (
                    <span key={lang} style={styles.vernBadge}>
                      {lang.charAt(0).toUpperCase() + lang.slice(1)}: {name}
                    </span>
                  )
                )}
              </div>
            )}

            <div style={styles.confidenceTag}>
              <span style={styles.confidenceLabel}>AI Confidence</span>
              <span style={styles.confidenceValue}>{result?.AccuracyScore}%</span>
            </div>
          </div>
        </div>

        {/* Health journey */}
        {previousScan && (
          <div className="fade-up-delay-1 verdant-card" style={styles.section}>
            <h3 style={styles.sectionTitle}>Health Journey</h3>
            <div style={styles.journeyGrid}>
              <div style={styles.journeyItem}>
                <span style={styles.journeyLabel}>Previous scan</span>
                <span style={styles.journeyValue}>
                  {new Date(previousScan.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div style={styles.journeyItem}>
                <span style={styles.journeyLabel}>Previous status</span>
                <span style={{ ...styles.journeyValue, color: previousScan.HealthColor || 'var(--mid)' }}>
                  {previousScan.HealthStatus}
                </span>
              </div>
            </div>
            <div style={styles.divider} />
            <p style={styles.trendNote}>
              {result?.HealthStatus === previousScan?.HealthStatus
                ? 'Plant conditions remain consistent with the last observation.'
                : 'A change in health status has been detected since your last scan.'}
            </p>
          </div>
        )}

        {/* Visual analysis */}
        <div className="fade-up-delay-1 verdant-card" style={styles.section}>
          <h3 style={styles.sectionTitle}>Visual Analysis</h3>
          <p style={styles.bodyText}>{result?.VisualAnalysis}</p>
        </div>

        {/* Care plan */}
        <div className="fade-up-delay-2 verdant-card" style={styles.section}>
          <h3 style={styles.sectionTitle}>Care Recommendations</h3>
          <div style={styles.stepList}>
            {recommendations.map((step, i) => (
              <div key={i} style={styles.stepItem}>
                <div style={styles.stepNum}>{i + 1}</div>
                <p style={styles.stepText}>{step.replace(/[•*-]/g, '').trim()}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Expert tip */}
        {result?.ExpertTip && (
          <div className="fade-up-delay-2" style={styles.expertBox}>
            <span style={styles.expertLabel}>PRO TIP</span>
            <p style={styles.expertText}>{result.ExpertTip}</p>
          </div>
        )}

        {/* Photo tip */}
        {result?.error_details && (
          <div className="fade-up-delay-2" style={styles.photoTipBox}>
            <span style={styles.photoTipLabel}>📸 PHOTO TIP</span>
            <p style={styles.expertText}>Next time: {result.error_details}</p>
          </div>
        )}

        {/* Feedback */}
        <div className="fade-up-delay-3" style={styles.feedbackBox}>
          {feedbackStatus ? (
            <p style={styles.thankYou}>Thank you for helping BotanIQ learn! 🌱</p>
          ) : (
            <>
              <p style={styles.feedbackQ}>Was this analysis accurate?</p>
              <div style={styles.feedbackBtns}>
                <button style={styles.fbBtn} onClick={() => handleFeedback(true)}>Yes, correct</button>
                <button style={styles.fbBtn} onClick={() => handleFeedback(false)}>No, incorrect</button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

const styles = {
  page: {
    flex: 1,
    background: 'var(--bg)',
    padding: '20px',
  },
  wrapper: {
    maxWidth: '520px',
    margin: '0 auto',
    paddingBottom: '48px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: 'none',
    color: 'var(--mid)',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px 0',
  },
  backArrow: { fontSize: '16px' },
  newScanBtn: {
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    padding: '9px 18px',
    borderRadius: 'var(--r-full)',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    letterSpacing: '0.2px',
  },

  weatherCard: {
    display: 'flex',
    gap: '14px',
    alignItems: 'flex-start',
    background: '#FEF7E0',
    border: '1px solid #F0D080',
    padding: '16px',
    borderRadius: 'var(--r-md)',
  },
  weatherIcon: { fontSize: '22px', flexShrink: 0 },
  weatherTitle: { fontSize: '13px', fontWeight: '700', color: '#78580A', marginBottom: '2px' },
  weatherText: { fontSize: '13px', color: '#78580A', lineHeight: '1.4' },

  heroCard: {
    overflow: 'hidden',
  },
  imgWrap: {
    position: 'relative',
    height: '300px',
  },
  heroImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  healthPill: {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: 'var(--r-full)',
    fontSize: '13px',
    fontWeight: '700',
    backdropFilter: 'blur(12px)',
  },
  healthDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },

  heroInfo: { padding: '24px' },
  nameRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px',
    marginBottom: '4px',
  },
  plantName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '26px',
    fontWeight: '700',
    color: 'var(--text-1)',
    lineHeight: '1.2',
    flex: 1,
    margin: 0,
  },
  trendChip: {
    background: 'var(--mist)',
    color: 'var(--mid)',
    padding: '4px 12px',
    borderRadius: 'var(--r-full)',
    fontSize: '11px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    border: '1px solid var(--border)',
  },
  sciName: {
    fontSize: '15px',
    color: 'var(--text-3)',
    fontStyle: 'italic',
    marginBottom: '12px',
  },
  vernRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '14px',
  },
  vernBadge: {
    fontSize: '11px',
    color: 'var(--mid)',
    background: 'var(--sage)',
    padding: '3px 10px',
    borderRadius: 'var(--r-sm)',
    fontWeight: '600',
  },
  confidenceTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--mist)',
    border: '1px solid var(--border)',
    padding: '4px 12px',
    borderRadius: 'var(--r-full)',
  },
  confidenceLabel: {
    fontSize: '11px',
    color: 'var(--text-3)',
    fontWeight: '600',
  },
  confidenceValue: {
    fontSize: '12px',
    color: 'var(--primary)',
    fontWeight: '800',
  },

  section: {
    padding: '24px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: 'var(--text-3)',
    marginBottom: '14px',
  },
  bodyText: {
    fontSize: '15px',
    color: 'var(--text-2)',
    lineHeight: '1.65',
  },

  journeyGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '16px',
  },
  journeyItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  journeyLabel: {
    fontSize: '11px',
    color: 'var(--text-4)',
    fontWeight: '600',
    letterSpacing: '0.3px',
  },
  journeyValue: {
    fontSize: '14px',
    color: 'var(--text-1)',
    fontWeight: '600',
  },
  divider: {
    height: '1px',
    background: 'var(--border)',
    marginBottom: '12px',
  },
  trendNote: {
    fontSize: '13px',
    color: 'var(--text-3)',
    fontStyle: 'italic',
  },

  stepList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  stepItem: {
    display: 'flex',
    gap: '14px',
    alignItems: 'flex-start',
  },
  stepNum: {
    width: '24px',
    height: '24px',
    background: 'var(--primary)',
    color: '#fff',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: '800',
    flexShrink: 0,
  },
  stepText: {
    margin: 0,
    fontSize: '14px',
    color: 'var(--text-2)',
    lineHeight: '1.6',
    paddingTop: '2px',
  },

  expertBox: {
    background: 'var(--primary)',
    padding: '24px',
    borderRadius: 'var(--r-lg)',
  },
  expertLabel: {
    background: 'var(--leaf)',
    color: '#fff',
    fontSize: '10px',
    fontWeight: '900',
    padding: '3px 8px',
    borderRadius: '4px',
    display: 'inline-block',
    marginBottom: '10px',
    letterSpacing: '0.5px',
  },
  expertText: {
    margin: 0,
    color: 'var(--sage)',
    fontSize: '14px',
    lineHeight: '1.65',
  },

  photoTipBox: {
    background: '#78350F',
    padding: '20px 24px',
    borderRadius: 'var(--r-lg)',
  },
  photoTipLabel: {
    background: '#F59E0B',
    color: '#fff',
    fontSize: '10px',
    fontWeight: '900',
    padding: '3px 8px',
    borderRadius: '4px',
    display: 'inline-block',
    marginBottom: '10px',
    letterSpacing: '0.5px',
  },

  feedbackBox: {
    textAlign: 'center',
    padding: '24px',
    background: 'var(--card)',
    borderRadius: 'var(--r-lg)',
    border: '1px solid var(--border)',
  },
  feedbackQ: {
    fontSize: '14px',
    color: 'var(--text-3)',
    marginBottom: '14px',
  },
  feedbackBtns: {
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
  },
  fbBtn: {
    padding: '10px 20px',
    background: 'var(--mist)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-full)',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--primary)',
    fontWeight: '600',
  },
  thankYou: {
    color: 'var(--mid)',
    fontWeight: '600',
    fontSize: '14px',
  },
};
