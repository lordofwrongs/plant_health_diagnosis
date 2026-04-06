import React, { useState, useEffect } from 'react';
// Corrected Import: Use your existing client instead of creating a new one
import { supabase } from '../supabaseClient.js';

export default function ResultsScreen({ result, userLanguage, onReset, onBack, allScans = [] }) {
  const [feedbackStatus, setFeedbackStatus] = useState(null);

  // LOGIC: Get the correct name based on the current toggle setting
  const getDynamicName = () => {
    if (!result) return 'New Discovery';
    
    const meta = result.vernacular_metadata;
    const currentLangKey = userLanguage?.toLowerCase();

    // If we have metadata for the selected language, show it + English in parens
    if (meta && meta[currentLangKey] && currentLangKey !== 'english') {
      const vernacularName = meta[currentLangKey];
      const englishReference = meta.english || result.PlantName;
      return `${vernacularName} (${englishReference})`;
    }

    // Fallback to the default PlantName (English)
    return result.PlantName || 'New Discovery';
  };

  const previousScan = allScans.length > 1 ? allScans[1] : null;

  const healthColor = result?.HealthColor 
    ? { bg: `${result.HealthColor}15`, text: result.HealthColor, dot: result.HealthColor }
    : { bg: '#f0f4f2', text: '#2d6a4f', dot: '#52b788' };

  const recommendations = result?.CarePlan 
    ? result.CarePlan.split('\n').filter(line => line.trim() !== '') 
    : [];

  const handleFeedback = async (isCorrect) => {
    setFeedbackStatus(isCorrect ? 'correct' : 'incorrect');
    let userCorrection = null;
    
    if (!isCorrect) {
      userCorrection = window.prompt("What is the correct name of this plant? (Optional)");
    }

    try {
      await supabase
        .from('plant_logs')
        .update({ 
          IsCorrect: isCorrect,
          UserCorrection: userCorrection 
        })
        .eq('id', result.id);
    } catch (err) {
      console.error("Feedback Error:", err);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>
        <div style={styles.navRow}>
          <button onClick={onBack} style={styles.backBtn}>← My Garden</button>
          <button onClick={onReset} style={styles.newScanBtn}>New Scan</button>
        </div>

        {result?.WeatherAlert && (
          <div style={styles.weatherAlertCard}>
            <div style={styles.alertIcon}>⚠️</div>
            <div style={styles.alertContent}>
              <h4 style={styles.alertTitle}>Climate Protection Alert</h4>
              <p style={styles.alertText}>{result.WeatherAlert}</p>
            </div>
          </div>
        )}

        <div style={styles.mainCard}>
          <div style={styles.imageSection}>
            <img src={result?.image_url} alt="Scanned plant" style={styles.mainImage} />
            <div style={{ ...styles.healthBadge, backgroundColor: healthColor.bg, color: healthColor.text }}>
              <div style={{ ...styles.statusDot, backgroundColor: healthColor.dot }} />
              {result?.HealthStatus || 'Analyzing...'}
            </div>
          </div>

          <div style={styles.infoSection}>
            <div style={styles.titleRow}>
              <h1 style={styles.plantName}>{getDynamicName()}</h1>
              {previousScan && (
                <div style={styles.trendChip}>
                  {result?.HealthStatus === previousScan?.HealthStatus ? 'Stable' : 'Status Updated'}
                </div>
              )}
            </div>
            <p style={styles.scientificName}>{result?.ScientificName}</p>
            <div style={styles.accuracyTag}>AI Confidence: {result?.AccuracyScore}%</div>
          </div>
        </div>

        {previousScan && (
          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Health Journey</h3>
            <div style={styles.comparisonGrid}>
              <div style={styles.compItem}>
                <span style={styles.compLabel}>Previous Scan</span>
                <span style={styles.compValue}>
                  {new Date(previousScan.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div style={styles.compItem}>
                <span style={styles.compLabel}>Previous Health</span>
                <span style={{ ...styles.compValue, color: previousScan.HealthColor || '#2d6a4f' }}>
                  {previousScan.HealthStatus}
                </span>
              </div>
            </div>
            <div style={styles.timelineDivider} />
            <p style={styles.trendNote}>
              {result?.HealthStatus === previousScan?.HealthStatus 
                ? "Plant conditions remain consistent with the last observation." 
                : "A change in health status has been detected since your last scan."}
            </p>
          </div>
        )}

        <div style={styles.sectionCard}>
          <h3 style={styles.sectionTitle}>Visual Analysis</h3>
          <p style={styles.analysisBody}>{result?.VisualAnalysis}</p>
        </div>

        <div style={styles.sectionCard}>
          <h3 style={styles.sectionTitle}>Care Recommendations</h3>
          <div style={styles.remedyList}>
            {recommendations.map((step, i) => (
              <div key={i} style={styles.remedyItem}>
                <div style={styles.remedyIndex}>{i + 1}</div>
                <p style={styles.remedyText}>{step.replace(/[•*-]/g, '').trim()}</p>
              </div>
            ))}
          </div>
        </div>

        {result?.ExpertTip && (
          <div style={styles.expertTipBox}>
            <span style={styles.tipLabel}>PRO TIP</span>
            <p style={styles.tipText}>{result.ExpertTip}</p>
          </div>
        )}

        <div style={styles.feedbackContainer}>
          {feedbackStatus ? (
            <p style={styles.feedbackThanks}>Thank you for helping our AI learn! 🌱</p>
          ) : (
            <>
              <p style={styles.feedbackTitle}>Was this analysis accurate?</p>
              <div style={styles.feedbackButtons}>
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
  page: { minHeight: '100vh', background: '#f8faf9', padding: '20px' },
  wrapper: { maxWidth: '500px', margin: '0 auto', paddingBottom: '40px' },
  navRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '20px' },
  backBtn: { background: 'none', border: 'none', color: '#2d6a4f', fontWeight: '600', cursor: 'pointer' },
  newScanBtn: { background: '#2d6a4f', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '20px', fontWeight: '600', cursor: 'pointer' },
  weatherAlertCard: { display: 'flex', gap: '15px', background: '#fff4e5', border: '1px solid #ffe2b3', padding: '16px', borderRadius: '16px', marginBottom: '20px', alignItems: 'center' },
  alertIcon: { fontSize: '24px' },
  alertTitle: { margin: 0, fontSize: '14px', color: '#663c00', fontWeight: '700' },
  alertText: { margin: '2px 0 0 0', fontSize: '13px', color: '#663c00', lineHeight: '1.4' },
  mainCard: { background: '#fff', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', marginBottom: '20px' },
  imageSection: { position: 'relative', height: '300px' },
  mainImage: { width: '100%', height: '100%', objectFit: 'cover' },
  healthBadge: { position: 'absolute', bottom: '16px', left: '16px', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '30px', fontSize: '14px', fontWeight: '700', backdropFilter: 'blur(10px)' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  infoSection: { padding: '24px' },
  titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' },
  plantName: { margin: 0, fontSize: '24px', color: '#1a3a2a', fontFamily: "'Playfair Display', serif", flex: 1, lineHeight: '1.2' },
  trendChip: { background: '#e8f5e9', color: '#2d6a4f', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' },
  scientificName: { margin: '4px 0 12px 0', fontSize: '16px', color: '#6a8378', fontStyle: 'italic' },
  accuracyTag: { display: 'inline-block', background: '#f0f4f2', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: '#2d6a4f', fontWeight: '700' },
  sectionCard: { background: '#fff', padding: '24px', borderRadius: '20px', marginBottom: '16px', border: '1px solid #f0f4f2' },
  sectionTitle: { margin: '0 0 12px 0', fontSize: '15px', color: '#1a3a2a', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' },
  analysisBody: { fontSize: '15px', color: '#4a6358', lineHeight: '1.6' },
  comparisonGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '15px' },
  compItem: { display: 'flex', flexDirection: 'column', gap: '4px' },
  compLabel: { fontSize: '11px', color: '#8aaa96', fontWeight: '600' },
  compValue: { fontSize: '14px', color: '#1a3a2a', fontWeight: '500' },
  timelineDivider: { height: '1px', background: '#f0f4f2', marginBottom: '12px' },
  trendNote: { fontSize: '13px', color: '#6a8378', margin: 0, fontStyle: 'italic' },
  remedyList: { display: 'flex', flexDirection: 'column', gap: '16px' },
  remedyItem: { display: 'flex', gap: '12px', alignItems: 'flex-start' },
  remedyIndex: { width: '22px', height: '22px', background: '#2d6a4f', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  remedyText: { margin: 0, fontSize: '14px', color: '#4a6358', lineHeight: '1.6' },
  expertTipBox: { background: '#1b4332', padding: '24px', borderRadius: '24px', marginBottom: '20px' },
  tipLabel: { background: '#52b788', color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: '900', marginBottom: '10px', display: 'inline-block' },
  tipText: { margin: 0, color: '#d8f3dc', fontSize: '14px', lineHeight: '1.6' },
  feedbackContainer: { textAlign: 'center', padding: '20px' },
  feedbackTitle: { fontSize: '14px', color: '#6a8378', marginBottom: '12px' },
  feedbackButtons: { display: 'flex', justifyContent: 'center', gap: '12px' },
  fbBtn: { padding: '10px 20px', background: '#fff', border: '1px solid #cbdad2', borderRadius: '12px', cursor: 'pointer', fontSize: '14px', color: '#2d6a4f', fontWeight: '600' },
  feedbackThanks: { color: '#2d6a4f', fontWeight: '600' }
};