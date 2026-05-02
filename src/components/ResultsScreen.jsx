import React, { useState } from 'react';

const CONF_TIER = (score) => {
  if (!score) return 'unknown'
  if (score >= 90) return 'high'
  if (score >= 75) return 'medium'
  if (score >= 60) return 'low'
  return 'uncertain'
}
const CONF_CONFIG = {
  high:      { color: '#4CAF50', bg: '#E8F5E9', border: 'transparent',  label: 'High confidence',     tip: 'Two independent sources agreed on this identification.' },
  medium:    { color: '#F59E0B', bg: '#FFFBEB', border: 'transparent',  label: 'Moderate confidence', tip: 'Sources partially agreed. Visual evidence was limited.' },
  low:       { color: '#F97316', bg: '#FFF7ED', border: '#F97316',      label: 'Low confidence',      tip: 'Sources disagreed. A clearer photo from a different angle should improve accuracy.' },
  uncertain: { color: '#EF4444', bg: '#FEF2F2', border: '#EF4444',      label: 'Uncertain',           tip: 'We could not identify this plant reliably. Try a side-angle photo in good light.' },
  unknown:   { color: 'var(--primary)', bg: 'var(--mist)', border: 'transparent', label: '', tip: '' },
}
import { supabase } from '../supabaseClient.js';

export default function ResultsScreen({ result, userLanguage, onReset, onBack, allScans = [], onSelectScan }) {
  const [feedbackStatus, setFeedbackStatus] = useState(null);
  const [showConfTip, setShowConfTip] = useState(false);

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

  const tier = CONF_TIER(result?.AccuracyScore)
  const conf = CONF_CONFIG[tier]

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

        {/* Hero card — border changes by confidence tier */}
        <div className="fade-up verdant-card" style={{
          ...styles.heroCard,
          ...(conf.border !== 'transparent' ? { border: `2px solid ${conf.border}` } : {}),
        }}>
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

            {/* Confidence badge — tiered colour, tap for explanation */}
            <button
              style={{ ...styles.confidenceTag, background: conf.bg, borderColor: conf.color, cursor: 'pointer' }}
              onClick={() => setShowConfTip(t => !t)}
            >
              <span style={{ ...styles.confidenceDot, background: conf.color }} />
              <span style={styles.confidenceLabel}>{conf.label || 'AI Confidence'}</span>
              <span style={{ ...styles.confidenceValue, color: conf.color }}>{result?.AccuracyScore}%</span>
              <span style={{ fontSize: '10px', color: conf.color, opacity: 0.7 }}>?</span>
            </button>
            {showConfTip && conf.tip && (
              <div style={{ ...styles.confTipBox, borderColor: conf.color, background: conf.bg }}>
                <p style={{ ...styles.confTipText, color: conf.color }}>{conf.tip}</p>
              </div>
            )}

            {/* "We're not sure" banner for very low confidence */}
            {tier === 'uncertain' && (
              <div style={styles.uncertainBanner}>
                <p style={styles.uncertainTitle}>We're not sure about this one</p>
                <p style={styles.uncertainSub}>The identification below is our best guess. A photo from a different angle will help significantly.</p>
              </div>
            )}

            {/* Alternatives — shown when confidence ≤ 80% and PlantNet had other candidates */}
            {result?.AccuracyScore <= 80 &&
             Array.isArray(result?.plantnet_candidates) &&
             result.plantnet_candidates.length > 1 && (
              <div style={styles.altRow}>
                <span style={styles.altLabel}>Could also be:</span>
                {result.plantnet_candidates.slice(1).map((c, i) => (
                  <span key={i} style={styles.altChip}>{c.common || c.name}</span>
                ))}
              </div>
            )}
            {/* Medium confidence note */}
            {tier === 'medium' && (
              <p style={styles.evidenceNote}>Based on limited visual evidence — a side-angle photo would improve accuracy.</p>
            )}

            {/* Re-scan CTA for low / uncertain */}
            {(tier === 'low' || tier === 'uncertain') && (
              <button style={styles.rescanCta} onClick={onReset}>
                📷 Try a better angle for this plant
              </button>
            )}
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

        {/* Care schedule */}
        {result?.care_schedule && (result.care_schedule.water_every_days || result.care_schedule.fertilise_every_days) && (
          <div className="fade-up-delay-2 verdant-card" style={styles.section}>
            <h3 style={styles.sectionTitle}>Care Schedule</h3>
            <div style={styles.scheduleGrid}>
              {result.care_schedule.water_every_days && (
                <div style={styles.scheduleItem}>
                  <span style={styles.scheduleIcon}>💧</span>
                  <span style={styles.scheduleLabel}>Water</span>
                  <span style={styles.scheduleFreq}>Every {result.care_schedule.water_every_days} days</span>
                </div>
              )}
              {result.care_schedule.fertilise_every_days && (
                <div style={styles.scheduleItem}>
                  <span style={styles.scheduleIcon}>🌱</span>
                  <span style={styles.scheduleLabel}>Fertilise</span>
                  <span style={styles.scheduleFreq}>Every {result.care_schedule.fertilise_every_days} days</span>
                </div>
              )}
              {result.care_schedule.check_pests_every_days && (
                <div style={styles.scheduleItem}>
                  <span style={styles.scheduleIcon}>🔍</span>
                  <span style={styles.scheduleLabel}>Check pests</span>
                  <span style={styles.scheduleFreq}>Every {result.care_schedule.check_pests_every_days} days</span>
                </div>
              )}
            </div>
            {result.care_schedule.notes && (
              <p style={{ ...styles.bodyText, marginTop: '14px', fontSize: '13px', color: 'var(--text-3)' }}>
                {result.care_schedule.notes}
              </p>
            )}
          </div>
        )}

        {/* Scan history timeline */}
        {allScans.length > 1 && (
          <div className="fade-up-delay-2 verdant-card" style={styles.section}>
            <h3 style={styles.sectionTitle}>Scan History ({allScans.length})</h3>
            <div style={styles.timelineList}>
              {allScans.map((scan, i) => {
                const isCurrent = scan.id === result?.id;
                return (
                  <button
                    key={scan.id}
                    style={{ ...styles.timelineRow, ...(isCurrent ? styles.timelineRowActive : {}) }}
                    onClick={() => !isCurrent && onSelectScan?.(scan)}
                    disabled={isCurrent}
                  >
                    <span style={{ ...styles.timelineDot, background: scan.HealthColor || 'var(--leaf)' }} />
                    <span style={styles.timelineDate}>
                      {new Date(scan.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span style={{ ...styles.timelineStatus, color: scan.HealthColor || 'var(--mid)' }}>
                      {scan.HealthStatus || '—'}
                    </span>
                    {isCurrent
                      ? <span style={styles.timelineCurrent}>Viewing</span>
                      : <span style={styles.timelineChevron}>›</span>
                    }
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
    border: '1px solid',
    borderColor: 'var(--border)',
    padding: '4px 12px',
    borderRadius: 'var(--r-full)',
  },
  confidenceDot: { width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0 },
  confidenceLabel: { fontSize: '11px', color: 'var(--text-3)', fontWeight: '600' },
  confidenceValue: { fontSize: '12px', fontWeight: '800' },

  confTipBox: {
    marginTop: '10px',
    padding: '10px 14px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid',
  },
  confTipText: { fontSize: '12px', lineHeight: '1.5', margin: 0, fontWeight: '500' },

  uncertainBanner: {
    marginTop: '12px',
    padding: '12px 14px',
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: 'var(--r-sm)',
  },
  uncertainTitle: { fontSize: '13px', fontWeight: '700', color: '#EF4444', margin: 0, marginBottom: '4px' },
  uncertainSub:   { fontSize: '12px', color: '#7F1D1D', margin: 0, lineHeight: '1.5' },

  evidenceNote: {
    marginTop: '10px',
    fontSize: '12px',
    color: '#92400e',
    background: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: 'var(--r-sm)',
    padding: '8px 12px',
  },

  rescanCta: {
    marginTop: '14px',
    width: '100%',
    padding: '12px',
    background: 'none',
    border: '2px solid #F97316',
    borderRadius: 'var(--r-full)',
    color: '#F97316',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    letterSpacing: '0.2px',
  },

  altRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    marginTop: '10px',
  },
  altLabel: {
    fontSize: '11px',
    color: 'var(--text-4)',
    fontWeight: '600',
  },
  altChip: {
    fontSize: '11px',
    color: 'var(--text-3)',
    background: 'var(--mist)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-full)',
    padding: '2px 10px',
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

  timelineList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  timelineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
    background: 'var(--mist)',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.15s',
  },
  timelineRowActive: {
    background: 'var(--sage)',
    border: '1px solid var(--leaf)',
    cursor: 'default',
  },
  timelineDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  timelineDate: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-2)',
    minWidth: '110px',
  },
  timelineStatus: {
    fontSize: '13px',
    fontWeight: '500',
    flex: 1,
  },
  timelineCurrent: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--mid)',
    background: 'var(--card)',
    border: '1px solid var(--leaf)',
    borderRadius: 'var(--r-full)',
    padding: '2px 8px',
    letterSpacing: '0.3px',
  },
  timelineChevron: {
    fontSize: '18px',
    color: 'var(--text-4)',
    fontWeight: '300',
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

  scheduleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  scheduleItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    background: 'var(--mist)',
    borderRadius: 'var(--r-md)',
    padding: '14px 8px',
    textAlign: 'center',
  },
  scheduleIcon:  { fontSize: '22px' },
  scheduleLabel: { fontSize: '11px', fontWeight: '700', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.4px' },
  scheduleFreq:  { fontSize: '12px', color: 'var(--primary)', fontWeight: '600' },
};
