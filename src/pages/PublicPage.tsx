import { useEffect, useMemo, useState } from 'react';
import { loadAudioMap, type AudioMap } from '../audio';
import JournalineViewer from '../components/JournalineViewer';
import type { ImageMap } from '../images';
import { SAMPLE_FILES } from '../sampleXml';
import { loadStoredAudioMap, loadStoredImageMap, loadStoredXml } from '../storage';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export default function PublicPage({ onNavigateAdmin }: { onNavigateAdmin: () => void }) {
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
      // Load audio mappings from MongoDB
      void loadAudioMap(stored.sourceLabel || 'uploaded.xml').then(setBaseAudioMap);
    } else {
      void loadDefaultSample().then(() => {
        // Load audio mappings for default sample
        void loadAudioMap('root.xml').then(setBaseAudioMap);
      });
    }
    setUploadedAudioMap(loadStoredAudioMap());
    setUploadedImageMap(loadStoredImageMap());
  }, []);

  useEffect(() => {
    const onStorage = () => {
      const stored = loadStoredXml();
      if (stored.xmlText) {
        setXmlText(stored.xmlText);
        setSourceLabel(stored.sourceLabel || 'uploaded.xml');
        setStatus('ready');
        // Reload audio mappings when XML changes
        void loadAudioMap(stored.sourceLabel || 'uploaded.xml').then(setBaseAudioMap);
      }
      setUploadedAudioMap(loadStoredAudioMap());
      setUploadedImageMap(loadStoredImageMap());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Load audio mappings whenever sourceLabel changes
  useEffect(() => {
    if (sourceLabel) {
      void loadAudioMap(sourceLabel).then(setBaseAudioMap);
    }
  }, [sourceLabel]);

  const mergedAudioMap = useMemo(() => ({ ...baseAudioMap, ...uploadedAudioMap }), [baseAudioMap, uploadedAudioMap]);

  async function loadDefaultSample() {
    setStatus('loading');
    setError('');
    try {
      const response = await fetch(SAMPLE_FILES[0].path);
      if (!response.ok) throw new Error(`Failed to load ${SAMPLE_FILES[0].label}`);
      const text = await response.text();
      setXmlText(text);
      setSourceLabel(SAMPLE_FILES[0].label);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to load XML file.');
    }
  }

  return (
    <div className="app-shell public-shell">
      <aside className="control-panel public-panel">
        <div className="brand-card">
          <div className="brand-logo" aria-hidden="true">PU</div>
          <div>
            <h1>Public Reader</h1>
            <p>หน้าใช้งานสำหรับผู้ชมทั่วไป แสดงผลจาก XML เดียวกับฝั่ง admin</p>
          </div>
        </div>

        <div className="control-section small-text">
          <h2>Current content</h2>
          <p><strong>Source:</strong> {sourceLabel}</p>
          <p><strong>State:</strong> {status}</p>
          <p><strong>Audio map:</strong> {Object.keys(mergedAudioMap).length}</p>
          <p><strong>Image map:</strong> {Object.keys(uploadedImageMap).length}</p>
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <div className="control-section button-stack">
          <button className="secondary-button" onClick={() => void loadDefaultSample()}>Reload default XML</button>
          <button className="ghost-button" onClick={onNavigateAdmin}>Admin / Login</button>
        </div>
      </aside>

      <JournalineViewer
        xmlText={xmlText}
        sourceLabel={sourceLabel}
        audioMap={mergedAudioMap}
        imageMap={uploadedImageMap}
        status={status}
        error={error}
        headerTitle="Journaline Public Reader"
        headerSubtitle="Public view restored with the same XML renderer as journaline-reader-ui-audio."
        serviceName="Public XML Reader"
        serviceNote="This screen reflects the XML, image, and audio content prepared in the admin console."
        emptyMessage="No XML has been published yet. Please upload a file in the admin page."
      />
    </div>
  );
}
