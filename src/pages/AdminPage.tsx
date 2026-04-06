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
} from '../storage';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export default function AdminPage({ onNavigatePublic }: { onNavigatePublic: () => void }) {
  const { logout } = useAuth();
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
    void loadAudioMap().then(setBaseAudioMap);
    // Audio/Image maps don't persist across page reloads anymore (use memory only)
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
        const response = await fetch(`/api/media/by-xmlname?name=${encodeURIComponent(xmlStem)}`);
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
  }, [sourceLabel]);

  useEffect(() => {
    const onStorage = () => {
      // Audio/Image maps don't sync from storage (use memory only)
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  async function loadSample(path: string, label: string) {
    setStatus('loading');
    setError('');
    try {
      const response = await fetch(path);
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
    const nextMap = { ...uploadedAudioMap };
    for (const file of files) {
      const stem = file.name.replace(/\.[^.]+$/, '');
      // Use object URL instead of data URL to avoid localStorage size limits
      const objectUrl = URL.createObjectURL(file);
      nextMap[stem] = objectUrl;
    }
    setUploadedAudioMap(nextMap);
    // Don't save object URLs to localStorage (they can't persist across page reloads)
    event.target.value = '';
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const nextMap = { ...uploadedImageMap };
    for (const file of files) {
      // Use object URL instead of data URL to avoid localStorage size limits
      const objectUrl = URL.createObjectURL(file);
      Object.assign(nextMap, buildImageAliases(file.name, objectUrl));
    }
    setUploadedImageMap(nextMap);
    // Don't save object URLs to localStorage (they can't persist across page reloads)
    event.target.value = '';
  }

  function resetUploads() {
    setUploadedAudioMap({});
    setUploadedImageMap({});
    // Audio/Image maps are memory-only now (no localStorage to clear)
  }

  function handleLogout() {
    logout();
    onNavigatePublic();
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
            <input type="file" accept="audio/*" multiple onChange={handleAudioUpload} />
          </label>
          <p className="helper-text">ระบบจะ map อัตโนมัติตามชื่อไฟล์ เช่น <code>hot_news.wav</code> → key <code>hot_news</code></p>
          
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
