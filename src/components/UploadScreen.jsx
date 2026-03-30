import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient.js'

const BUCKET = 'plant_images'

export default function UploadScreen({ onUploadComplete }) {
  const [previews, setPreviews] = useState([])
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef()

  const handleFiles = (fileList) => {
    const selectedFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    if (selectedFiles.length === 0) return
    
    setFiles(selectedFiles)
    setPreviews(selectedFiles.map(f => URL.createObjectURL(f)))
    setError(null)
  }

  const handleSubmit = async () => {
    if (files.length === 0) return
    setUploading(true)
    setError(null)

    const guestId = localStorage.getItem('plant_care_guest_id')

    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(fileName, file, { contentType: file.type })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
        const imageUrl = urlData.publicUrl

        const { data: logData, error: insertError } = await supabase
          .from('plant_logs')
          .insert({
            user_id: guestId,
            image_url: imageUrl,
            status: 'pending',
          })
          .select('id')
          .single()

        if (insertError) throw insertError
        
        // If multiple are uploaded, we navigate to history to see all progress
        if (files.length === 1) {
          onUploadComplete(logData.id)
        } else {
          window.location.reload() // Refresh to show history with new pending items
        }
      }
    } catch (err) {
      console.error(err)
      setError('Upload failed. Please check your connection.')
      setUploading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Scan your plants</h2>
        <div
          style={{ ...styles.dropZone, ...(previews.length > 0 ? styles.dropZoneWithImage : {}) }}
          onClick={() => previews.length === 0 && inputRef.current.click()}
        >
          {previews.length > 0 ? (
            <div style={styles.previewGrid}>
              {previews.map((src, i) => (
                <img key={i} src={src} alt="Preview" style={styles.miniPreview} />
              ))}
              <button style={styles.changeBtn} onClick={() => inputRef.current.click()}>Add/Change</button>
            </div>
          ) : (
            <p style={styles.dropText}>Tap to upload one or more photos</p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...styles.submitBtn, ...(files.length === 0 || uploading ? styles.submitBtnDisabled : {}) }}
          onClick={handleSubmit}
          disabled={files.length === 0 || uploading}
        >
          {uploading ? 'Processing...' : `Analyse ${files.length} Plant(s)`}
        </button>
      </div>
    </div>
  )
}

// Styles omitted for brevity, maintain your existing CSS objects
const styles = { /* Use your existing styles from the previous UploadScreen.jsx */ }