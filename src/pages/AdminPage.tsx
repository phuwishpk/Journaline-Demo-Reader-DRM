import { useEffect, useMemo, useState } from 'react';
import { loadAudioMap, type AudioMap } from '../audio';
import JournalineViewer from '../components/JournalineViewer';
import { buildImageAliases, type ImageMap } from '../images';
import { SAMPLE_FILES } from '../sampleXml';
import { useAuth } from '../AuthContext';
import { parseJournalineXml, extractReferencedFilesFromXml } from '../parser';
import type { JournalineDocument } from '../types';
import {
  loadStoredAudioMap,
  loadStoredImageMap,
  loadStoredXml,
  saveStoredAudioMap,
  saveStoredImageMap,
  saveStoredXml,
  saveMediaAssignmentForXml,
  loadMediaAssignmentForXml,
} from '../storage';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export default function AdminPage({ onNavigatePublic }: { onNavigatePublic: () => void }) {
  const { logout, token } = useAuth();
  const [xmlText, setXmlText] = useState('');
  const [sourceLabel, setSourceLabel] = useState('root.xml');
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState('');
  const [baseAudioMap, setBaseAudioMap] = useState<AudioMap>({});
  const [uploadedAudioMap, setUploadedAudioMap] = useState<AudioMap>({});
  const [uploadedImageMap, setUploadedImageMap] = useState<ImageMap>({});
  const [referencedAudioFiles, setReferencedAudioFiles] = useState<string[]>([]);
  const [referencedImageFiles, setReferencedImageFiles] = useState<string[]>([]);

  useEffect(() => {
    const stored = loadStoredXml();
    if (stored.xmlText) {
      setXmlText(stored.xmlText);
      setSourceLabel(stored.sourceLabel || 'uploaded.xml');
      setStatus('ready');
    } else {
      void loadSample(SAMPLE_FILES[0].path, SAMPLE_FILES[0].label);
    }
    // Load audio mappings from MongoDB
    void loadAudioMap(SAMPLE_FILES[0].label).then(setBaseAudioMap);
    
    // Load uploaded audio/image maps from localStorage (persist across reloads)
    setUploadedAudioMap(loadStoredAudioMap());
    setUploadedImageMap(loadStoredImageMap());
  }, []);

  const mergedAudioMap = useMemo(() => ({ ...baseAudioMap, ...uploadedAudioMap }), [baseAudioMap, uploadedAudioMap]);
  const mergedImageMap = useMemo(() => ({ ...uploadedImageMap }), [uploadedImageMap]);

  const doc = useMemo<JournalineDocument | null>(() => {
    if (!xmlText) return null;
    try {
      return parseJournalineXml(xmlText);
    } catch {
      return null;
    }
  }, [xmlText]);

  // Extract referenced audio and image files from XML
  useEffect(() => {
    if (!xmlText) {
      setReferencedAudioFiles([]);
      setReferencedImageFiles([]);
      return;
    }
    const { audioFiles, imageFiles } = extractReferencedFilesFromXml(xmlText);
    setReferencedAudioFiles(audioFiles);
    setReferencedImageFiles(imageFiles);
  }, [xmlText]);

  // Fetch media files that match the loaded XML filename
  useEffect(() => {
    if (!sourceLabel) return;
    
    // Extract stem from sourceLabel (e.g., "root_pythagoras_th.xml" -> "root_pythagoras_th")
    const xmlStem = sourceLabel.replace(/\.[^.]+$/, '');
    
    const fetchMatchingMedia = async () => {
      try {
        const response = await fetch(`http://localhost:5001/api/media/by-xmlname?name=${encodeURIComponent(xmlStem)}`);
        if (!response.ok) throw new Error('Failed to fetch media');
        const data = await response.json();
        
        // If we found matching audio/image files, merge them with referenced files
        if (data.audio?.length > 0) {
          const matchingAudioStems = data.audio.map((a: any) => a.stem);
          setReferencedAudioFiles((prev) => {
            const combined = new Set([...prev, ...matchingAudioStems]);
            return Array.from(combined).sort();
          });
        }
        
        if (data.images?.length > 0) {
          const matchingImageStems = data.images.map((img: any) => img.name);
          setReferencedImageFiles((prev) => {
            const combined = new Set([...prev, ...matchingImageStems]);
            return Array.from(combined).sort();
          });
        }
      } catch (err) {
        console.error('Error fetching matching media:', err);
        // Silently fail - still show XML-referenced files
      }
    };
    
    fetchMatchingMedia();
    
    // Load audio mappings for the current XML from MongoDB
    if (sourceLabel) {
      void loadAudioMap(sourceLabel).then(setBaseAudioMap);
    }
  }, [sourceLabel]);

  // Load saved media assignment for the opened XML file
  useEffect(() => {
    // Reset uploaded maps when switching XML files
    setUploadedAudioMap({});
    setUploadedImageMap({});
    
    if (!sourceLabel) return;
    
    const xmlStem = sourceLabel.replace(/\.[^.]+$/, '');
    const assignment = loadMediaAssignmentForXml(xmlStem);
    
    // Start building the audio/image maps
    const newAudioMap: AudioMap = {};
    const newImageMap: ImageMap = {};
    
    // First, try to load previously stored audio/image for this XML (has full paths)
    const storedAudioMap = loadStoredAudioMap();
    const storedImageMap = loadStoredImageMap();
    if (storedAudioMap[xmlStem]) {
      newAudioMap[xmlStem] = storedAudioMap[xmlStem];
      console.log(`  📻 Loaded stored audio: ${xmlStem} → ${storedAudioMap[xmlStem]}`);
    }
    if (storedImageMap[xmlStem]) {
      newImageMap[xmlStem] = storedImageMap[xmlStem];
      console.log(`  🖼️  Loaded stored image: ${xmlStem} → ${storedImageMap[xmlStem]}`);
    }
    
    // Then load from media assignment (file listings)
    if (assignment.audioFiles.length > 0 || assignment.imageFiles.length > 0) {
      console.log(`📥 Loaded media assignment for ${xmlStem}:`, assignment);
      
      // Load audio files from /public/audio/ ONLY if no stored audio exists
      // (stored audio from uploads is the source of truth)
      if (assignment.audioFiles.length > 0 && !storedAudioMap[xmlStem]) {
        for (const filename of assignment.audioFiles) {
          const audioUrl = `/audio/${filename}`;
          // Use xmlStem as key (not filename stem) so it matches audio candidates
          newAudioMap[xmlStem] = audioUrl;
          console.log(`  📻 Added audio: ${xmlStem} → ${audioUrl}`);
        }
      }
      
      // Load image files from /public/images/
      if (assignment.imageFiles.length > 0) {
        for (const filename of assignment.imageFiles) {
          const imageUrl = `/images/${filename}`;
          newImageMap[filename] = imageUrl;
          console.log(`  🖼️  Added image: ${filename} → ${imageUrl}`);
        }
      }
      
      // Also add to referenced files for display
      setReferencedAudioFiles((prev) => {
        const combined = new Set([...prev, ...assignment.audioFiles]);
        return Array.from(combined).sort();
      });
      
      setReferencedImageFiles((prev) => {
        const combined = new Set([...prev, ...assignment.imageFiles]);
        return Array.from(combined).sort();
      });
    }
    
    // Apply the maps
    if (Object.keys(newAudioMap).length > 0) {
      setUploadedAudioMap(newAudioMap);
    }
    if (Object.keys(newImageMap).length > 0) {
      setUploadedImageMap(newImageMap);
    }
  }, [sourceLabel]);

  async function loadSample(path: string, label: string) {
    setStatus('loading');
    setError('');
    try {
      // Fetch from public folder via static server on port 5001
      const fullUrl = `http://localhost:5001${path}`;
      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error(`Failed to load ${label}`);
      const text = await response.text();
      setXmlText(text);
      setSourceLabel(label);
      setStatus('ready');
      saveStoredXml(text, label);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to load XML file.');
    }
  }

  async function handleXmlUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('loading');
    setError('');
    try {
      const text = await file.text();
      setXmlText(text);
      setSourceLabel(file.name);
      setStatus('ready');
      saveStoredXml(text, file.name);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Invalid XML file.');
    } finally {
      event.target.value = '';
    }
  }

  async function handleAudioUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    
    if (!token) {
      setError('Not authenticated - please login first');
      return;
    }

    setStatus('loading');
    const nextMap = { ...uploadedAudioMap };
    
    for (const file of files) {
      try {
        // Upload audio file
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('http://localhost:5001/api/upload-audio', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        const data = await response.json();
        console.log(`📻 Uploaded audio: ${file.name} → ${data.path}`);
        
        // Store using sourceBase as key (to match MongoDB)
        const sourceBase = sourceLabel.replace(/\.xml$/i, '');
        nextMap[sourceBase] = data.path;
        
        // Save audio mapping to MongoDB (one per XML)
        const mappingResponse = await fetch('http://localhost:5001/api/audio-mapping', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            xmlName: sourceLabel,
            audioPath: data.path,
            originalFilename: file.name,
            fileSize: file.size
          })
        });
        
        if (!mappingResponse.ok) {
          console.warn(`⚠️ Failed to save audio mapping for ${sourceLabel}`);
        } else {
          const mappingData = await mappingResponse.json();
          console.log(`✅ Audio mapping saved: ${sourceLabel} → ${data.path}`);
        }
      } catch (err) {
        console.error(`❌ Failed to upload ${file.name}:`, err);
        setError(`Failed to upload ${file.name}`);
      }
    }
    
    setUploadedAudioMap(nextMap);
    // Save to localStorage so it persists
    saveStoredAudioMap(nextMap);
    setStatus('ready');
    event.target.value = '';
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    
    if (!token) {
      setError('Not authenticated - please login first');
      return;
    }

    setStatus('loading');
    const nextMap = { ...uploadedImageMap };
    
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('http://localhost:5001/api/upload-image', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        const data = await response.json();
        console.log(`📸 Uploaded image: ${file.name} → ${data.path}`);
        
        // Use buildImageAliases to create mappings from server path
        Object.assign(nextMap, buildImageAliases(file.name, data.path));
      } catch (err) {
        console.error(`❌ Failed to upload ${file.name}:`, err);
        setError(`Failed to upload ${file.name}`);
      }
    }
    
    setUploadedImageMap(nextMap);
    // Save to localStorage so it persists
    saveStoredImageMap(nextMap);
    setStatus('ready');
    event.target.value = '';
  }

  function resetUploads() {
    setUploadedAudioMap({});
    setUploadedImageMap({});
    // Clear saved uploads from localStorage
    saveStoredAudioMap({});
    saveStoredImageMap({});
  }

  function handleLogout() {
    logout();
    onNavigatePublic();
  }

  function handleSaveMediaAssignment() {
    if (!sourceLabel) {
      alert('Please load an XML file first');
      return;
    }

    const xmlStem = sourceLabel.replace(/\.[^.]+$/, '');
    
    // Use referenced files if available (from XML + API match)
    // Otherwise use uploaded stems
    const audioFilenames = referencedAudioFiles.length > 0 
      ? referencedAudioFiles 
      : Object.keys(uploadedAudioMap).map(stem => `${stem}.mp3`);

    const imageFilenames = referencedImageFiles.length > 0
      ? referencedImageFiles
      : Object.keys(uploadedImageMap).filter(key => 
          !key.includes('localfile') && !key.startsWith('data:') && !key.startsWith('images/')
        );

    // Save assignment
    saveMediaAssignmentForXml(xmlStem, audioFilenames, imageFilenames);
    
    alert(`✅ Saved media assignment for ${sourceLabel}\n\nAudio: ${audioFilenames.length} files\nImages: ${imageFilenames.length} files`);
  }

  return (
    <div className="app-shell admin-shell">
      <aside className="control-panel">
        <div className="brand-card">
          <div className="brand-logo" aria-hidden="true">AD</div>
          <div>
            <h1>Admin Console</h1>
            <p>จัดการ XML, เสียง และรูปภาพ โดยไม่แตะโครงสร้าง renderer</p>
          </div>
        </div>

        <div className="control-section">
          <h2>Sample XML</h2>
          <div className="button-stack">
            {SAMPLE_FILES.map((file) => (
              <button key={file.key} className="secondary-button" onClick={() => void loadSample(file.path, file.label)}>
                Open {file.label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-section">
          <h2>Upload XML</h2>
          <label className="upload-box">
            <span>Select .xml file</span>
            <input type="file" accept=".xml,text/xml" onChange={handleXmlUpload} />
          </label>
          <p className="helper-text">ไฟล์ XML ที่อัปโหลดจะถูกบันทึกไว้สำหรับหน้า Public ด้วย</p>
        </div>

        <div className="control-section">
          <h2>Upload Audio</h2>
          
          <label className="upload-box upload-box--short">
            <span>Select audio files</span>
            <input 
              type="file" 
              accept="audio/*" 
              multiple 
              onChange={handleAudioUpload}
            />
          </label>
          <p className="helper-text">Audio files will be mapped to the current XML and saved to the database</p>
          
          <div className="manifest-count">Mapped audio keys: {Object.keys(uploadedAudioMap).length}</div>
          {Object.keys(uploadedAudioMap).length > 0 && (
            <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(100, 200, 150, 0.1)', borderRadius: '4px' }}>
              <p style={{ margin: '0 0 6px', fontSize: '0.85rem', fontWeight: '500', color: '#4CAF50' }}>✅ Uploaded:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {Object.keys(uploadedAudioMap).map((key) => (
                  <span key={key} style={{ background: 'rgba(76, 175, 80, 0.2)', padding: '4px 8px', borderRadius: '3px', fontSize: '0.8rem', border: '1px solid rgba(76, 175, 80, 0.4)' }}>
                    🎵 {key}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {referencedAudioFiles.length > 0 && (
            <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(30, 165, 141, 0.1)', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: '500', color: '#1ea58d' }}>📂 Reference in XML:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {referencedAudioFiles.map((f) => (
                  <span key={f} style={{ background: 'rgba(255,255,255,0.2)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.85rem', border: '1px solid rgba(30, 165, 141, 0.3)' }}>
                    🔊 {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="control-section">
          <h2>Upload Images</h2>
          <label className="upload-box upload-box--short">
            <span>Select image files</span>
            <input type="file" accept="image/*" multiple onChange={handleImageUpload} />
          </label>
          <p className="helper-text">รูปที่อัปโหลดจะถูก resolve ตามชื่อไฟล์และ alias ใน renderer</p>
          <div className="manifest-count">Mapped image keys: {Object.keys(uploadedImageMap).length}</div>
          
          {referencedImageFiles.length > 0 && (
            <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(30, 165, 141, 0.1)', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: '500', color: '#1ea58d' }}>📂 Reference in XML:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {referencedImageFiles.map((f) => (
                  <span key={f} style={{ background: 'rgba(255,255,255,0.2)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.85rem', border: '1px solid rgba(30, 165, 141, 0.3)' }}>
                    📸 {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="control-section small-text">
          <h2>Status</h2>
          <p><strong>Source:</strong> {sourceLabel}</p>
          <p><strong>State:</strong> {status}</p>
          {error ? <p className="error-text">{error}</p> : null}
          <p><strong>Audio overrides:</strong> {Object.keys(uploadedAudioMap).length}</p>
          <p><strong>Image overrides:</strong> {Object.keys(uploadedImageMap).length}</p>
        </div>

        <div className="control-section button-stack">
          <button className="primary-button" onClick={handleSaveMediaAssignment}>💾 Save Media Assignment</button>
          <button className="secondary-button" onClick={resetUploads}>Clear uploaded media</button>
          <button className="ghost-button" onClick={onNavigatePublic}>Open Public Page</button>
          <button className="ghost-button" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <div>
        <JournalineViewer
        xmlText={xmlText}
        sourceLabel={sourceLabel}
        audioMap={mergedAudioMap}
        imageMap={mergedImageMap}
        status={status}
        error={error}
        headerTitle="Journaline Admin Preview"
        headerSubtitle="Admin preview keeps XML / image / audio uploads and restores the lost XML renderer."
        serviceName="Admin XML Preview"
        serviceNote="The viewer below uses the same XML rendering style as journaline-reader-ui-audio."
        emptyMessage="Upload or open an XML file to preview the rendered Journaline pages."
      />
      </div>
    </div>
  );
}


