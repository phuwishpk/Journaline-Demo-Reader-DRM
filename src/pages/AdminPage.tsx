import { useEffect, useMemo, useState } from 'react';
import { loadAudioMap, type AudioMap } from '../audio';
import JournalineViewer from '../components/JournalineViewer';
import { buildImageAliases, type ImageMap } from '../images';
import { SAMPLE_FILES } from '../sampleXml';
import { useAuth } from '../AuthContext';
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
    setUploadedAudioMap(loadStoredAudioMap());
    setUploadedImageMap(loadStoredImageMap());
  }, []);

  const mergedAudioMap = useMemo(() => ({ ...baseAudioMap, ...uploadedAudioMap }), [baseAudioMap, uploadedAudioMap]);

  useEffect(() => {
    const onStorage = () => {
      setUploadedAudioMap(loadStoredAudioMap());
      setUploadedImageMap(loadStoredImageMap());
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
      const dataUrl = await readAsDataUrl(file);
      const stem = file.name.replace(/\.[^.]+$/, '');
      nextMap[stem] = dataUrl;
    }
    setUploadedAudioMap(nextMap);
    saveStoredAudioMap(nextMap);
    event.target.value = '';
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const nextMap = { ...uploadedImageMap };
    for (const file of files) {
      const dataUrl = await readAsDataUrl(file);
      Object.assign(nextMap, buildImageAliases(file.name, dataUrl));
    }
    setUploadedImageMap(nextMap);
    saveStoredImageMap(nextMap);
    event.target.value = '';
  }

  function resetUploads() {
    setUploadedAudioMap({});
    setUploadedImageMap({});
    saveStoredAudioMap({});
    saveStoredImageMap({});
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
        </div>

        <div className="control-section">
          <h2>Upload Images</h2>
          <label className="upload-box upload-box--short">
            <span>Select image files</span>
            <input type="file" accept="image/*" multiple onChange={handleImageUpload} />
          </label>
          <p className="helper-text">รูปที่อัปโหลดจะถูก resolve ตามชื่อไฟล์และ alias ใน renderer</p>
          <div className="manifest-count">Mapped image keys: {Object.keys(uploadedImageMap).length}</div>
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

      <JournalineViewer
        xmlText={xmlText}
        sourceLabel={sourceLabel}
        audioMap={mergedAudioMap}
        imageMap={uploadedImageMap}
        status={status}
        error={error}
        headerTitle="Journaline Admin Preview"
        headerSubtitle="Admin preview keeps XML / image / audio uploads and restores the lost XML renderer."
        serviceName="Admin XML Preview"
        serviceNote="The viewer below uses the same XML rendering style as journaline-reader-ui-audio."
        emptyMessage="Upload or open an XML file to preview the rendered Journaline pages."
      />
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}
