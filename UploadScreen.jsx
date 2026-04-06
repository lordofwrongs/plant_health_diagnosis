import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient.js'

const BUCKET = 'plant_images'

export default function UploadScreen({ onUploadComplete, userLanguage }) {
  const [previews, setPreviews] = useState([])
  const [files, setFiles] = useState([])
  const [nickname, setNickname] = useState('') 
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const inputRef = useRef()
  const isProcessing = useRef(false)

  const handleFiles = (fileList) => {
    const selectedFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (selectedFiles.length === 0) return
    
    setFiles(prev => [...prev, ...selectedFiles])
    setPreviews(prev => [...prev, ...selectedFiles.map(f => URL.createObjectURL(f))])
    setError(null)
  }

  const removeImage = (e, index) => {
    e.stopPropagation();
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const getLocationContext = async () => {
    setStatusMessage('Syncing with satellites...')
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null, name: 'Unknown Location' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await res.json();
            resolve({ lat: latitude, lng: longitude, name: data.address.city || data.address.town || 'Nearby' });
          } catch {
            resolve({ lat: latitude, lng: longitude, name: 'Current Location' });
          }
        },
        () => resolve({ lat: null, lng: null, name: 'Unknown Location' }),
        { timeout: 10000 }
      );
    });
  };

  const handleUpload = async () => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    const guestId = localStorage.getItem('plant_care_guest_id');
    const uploadedIds = [];

    try {
      const location = await getLocationContext();

      for (const file of files) {
        setStatusMessage(`Uploading ${file.name}...`);
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${guestId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(filePath);

        setStatusMessage('Initializing AI Engine...');
        const { data, error: dbError } = await supabase
          .from('plant_logs')
          .insert([{
            user_id: guestId,
            image_url: publicUrl,
            plant_nickname: nickname || null,
            latitude: location.lat,
            longitude: location.lng,
            location_name: location.name,
            preferred_language: userLanguage, // CRITICAL FIX: Save the language here
            status: 'processing'
          }])
          .select();

        if (dbError) throw dbError;
        uploadedIds.push(data[0].id);
      }

      onUploadComplete(uploadedIds);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setUploading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Plant Health Check</h2>
        <p style={styles.subtitle}>Upload photos of your plant for an instant AI diagnosis</p>

        <input 
          type="text" 
          placeholder="Give this plant a nickname (e.g. 'Kitchen Orchid')" 
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          style={styles.nicknameInput}
        />

        <div 
          onClick={() => inputRef.current.click()}
          style={styles.dropzone}
        >
          <input 
            type="file" 
            multiple 
            accept="image/*" 
            hidden 
            ref={inputRef}
            onChange={(e) => handleFiles(e.target.files)}
          />
          
          {previews.length === 0 ? (
            <div style={styles.uploadPlaceholder}>
              <div style={styles.iconCircle}>📸</div>
              <p style={styles.uploadText}>Tap to take photos or upload</p>
              <p style={styles.uploadSubtext}>Tip: Get close to leaves or stems</p>
            </div>
          ) : (
            <div style={styles.previewGrid}>
              {previews.map((url, i) => (
                <div key={i} style={styles.previewItem}>
                  <img src={url} alt="preview" style={styles.previewImg} />
                  <button onClick={(e) => removeImage(e, i)} style={styles.removeBadge}>×</button>
                </div>
              ))}
              <div style={styles.addMoreCircle}>+</div>
            </div>
          )}
        </div>

        {error && <div style={styles.errorContainer}>{error}</div>}

        <button 
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          style={{...styles.submitBtn, ...(files.length === 0 || uploading ? styles.submitBtnDisabled : {})}}
        >
          {uploading ? statusMessage : `Analyze ${files.length} Photo${files.length !== 1 ? 's' : ''}`}
        </button>

        {files.length > 0 && !uploading && (
          <button onClick={() => { setFiles([]); setPreviews([]); }} style={styles.clearBtn}>
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: { padding: '20px', maxWidth: '500px', margin: '0 auto', width: '100%' },
  card: { background: '#fff', padding: '30px', borderRadius: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' },
  title: { margin: '0 0 8px 0', fontSize: '22px', color: '#1a3a2a', textAlign: 'center' },
  subtitle: { margin: '0 0 25px 0', fontSize: '14px', color: '#6a8378', textAlign: 'center', lineHeight: '1.5' },
  nicknameInput: { width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbdad2', marginBottom: '20px', fontSize: '14px', outline: 'none' },
  dropzone: { border: '2px dashed #cbdad2', borderRadius: '20px', padding: '20px', cursor: 'pointer', background: '#f9fbf9', transition: 'all 0.2s' },
  uploadPlaceholder: { textAlign: 'center', padding: '20px' },
  iconCircle: { fontSize: '32px', marginBottom: '12px' },
  uploadText: { margin: '0 0 4px 0', fontWeight: '600', color: '#2d6a4f' },
  uploadSubtext: { margin: 0, fontSize: '12px', color: '#8aaa96' },
  previewGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' },
  previewItem: { position: 'relative', height: '80px' },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' },
  removeBadge: { position: 'absolute', top: '-5px', right: '-5px', background: '#ff5252', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', zIndex: 10 },
  addMoreCircle: { height: '80px', borderRadius: '10px', border: '2px dashed #cbdad2', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fbf9' },
  submitBtn: { width: '100%', padding: '18px', background: 'linear-gradient(135deg, #2d6a4f, #52b788)', color: '#fff', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: '600', fontSize: '16px', marginTop: '16px' },
  submitBtnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  clearBtn: { width: '100%', background: 'none', border: 'none', color: '#8aaa96', fontSize: '12px', marginTop: '12px', cursor: 'pointer' },
  errorContainer: { color: '#d32f2f', fontSize: '13px', margin: '15px 0', textAlign: 'center', background: '#ffebee', padding: '10px', borderRadius: '8px' }
};