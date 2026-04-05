import { useEffect, useMemo, useState } from 'react';
import './styles.css';
import { resolveAudioUrl, inlineToPlainText, loadAudioMap, type AudioMap } from './audio';
import AudioPlayer from './AudioPlayer';
import { resolvePage, resolveReferenceTarget } from './navigation';
import { parseJournalineXml } from './parser';
import { SAMPLE_FILES } from './sampleXml';
import type { ActionLink, InlineNode, JournalineDocument, PageNode } from './types';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type UploadedFile = {
  name: string;
  size: number;
  blobUrl?: string;
};

type SavedState = {
  sourceLabel: string;
  audio: UploadedFile | null;
  images: UploadedFile[];
  timestamp: number;
};

export default function App() {
  const [xmlText, setXmlText] = useState<string>('');
  const [sourceLabel, setSourceLabel] = useState<string>('root.xml');
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string>('');
  const [currentPageId, setCurrentPageId] = useState<string>('');
  const [audioMap, setAudioMap] = useState<AudioMap>({});
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [audioFile, setAudioFile] = useState<UploadedFile | null>(null);
  const [imageFiles, setImageFiles] = useState<UploadedFile[]>([]);
  const [uploadError, setUploadError] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);
  const [savedXmls, setSavedXmls] = useState<Array<{ name: string; label: string }>>([]);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors?: Array<{ message: string; line?: number; column?: number }>; message?: string } | null>(null);

  const doc = useMemo<JournalineDocument | null>(() => {
    if (!xmlText) return null;
    try {
      return parseJournalineXml(xmlText);
    } catch {
      return null;
    }
  }, [xmlText]);

  useEffect(() => {
    // Clear old localStorage entries for XMLs (they're now stored on server)
    const keysToRemove: string[] = [];
    for (let key in localStorage) {
      if (key.startsWith('journaline_xml_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    void loadSample(SAMPLE_FILES[0].path, SAMPLE_FILES[0].label);
    void loadAudioMap().then(setAudioMap);
    // Load saved XMLs from server
    void loadSavedXmlsList();
  }, []);

  async function loadSavedXmlsList() {
    try {
      const response = await fetch('http://localhost:5001/api/saved-xmls');
      if (response.ok) {
        const data = await response.json();
        setSavedXmls(data.files || []);
      }
    } catch (err) {
      console.warn('Failed to load saved XMLs list:', err);
      setSavedXmls([]);
    }
  }

  useEffect(() => {
    if (doc) {
      setCurrentPageId(doc.rootPageId);
    }
  }, [doc]);

  // Track changes in audio and image files
  useEffect(() => {
    setHasChanges(true);
  }, [audioFile, imageFiles]);

  const resolved = doc ? resolvePage(doc, currentPageId || doc.rootPageId) : null;
  const audioInfo = useMemo(
    () => {
      // If there's an uploaded audio file, use that instead of mapped audio
      if (uploadedAudioUrl) {
        return { url: uploadedAudioUrl, matchedKey: 'uploaded' };
      }
      return resolveAudioUrl({ audioMap, page: resolved?.page ?? null, sourceLabel, doc });
    },
    [uploadedAudioUrl, audioMap, resolved?.page, sourceLabel, doc],
  );

  async function detectAssociatedFiles(xmlFileName: string) {
    // Clear uploaded audio when loading new XML
    if (uploadedAudioUrl) {
      URL.revokeObjectURL(uploadedAudioUrl);
    }
    setUploadedAudioUrl(null);
    
    // First check if there's a saved state for this XML file in localStorage
    try {
      const savedState = localStorage.getItem(`journaline_${xmlFileName}`);
      if (savedState) {
        const parsed = JSON.parse(savedState) as SavedState;
        setAudioFile(parsed.audio);
        setImageFiles(parsed.images);
        
        // If audio file has a server path (blobUrl), use it
        if (parsed.audio?.blobUrl && parsed.audio.blobUrl.startsWith('/')) {
          setUploadedAudioUrl(parsed.audio.blobUrl);
        }
        
        setHasChanges(false);
        return;
      }
    } catch {
      // Continue with default loading if localStorage fails
    }

    try {
      // Try to fetch audio-map.json which contains audio file names
      const audioMapResponse = await fetch('/audio/audio-map.json');
      if (audioMapResponse.ok) {
        const audioMapData = await audioMapResponse.json() as Record<string, string>;
        // Look for audio files associated with this XML
        const lowerFileName = xmlFileName.toLowerCase();
        let audioPath: string | undefined;
        
        if (audioMapData[lowerFileName]) {
          audioPath = audioMapData[lowerFileName];
        } else if (audioMapData[xmlFileName]) {
          audioPath = audioMapData[xmlFileName];
        }
        
        if (audioPath) {
          // Extract just the filename from the path
          const audioFileName = audioPath.split('/').pop() || audioPath;
          setAudioFile({ name: audioFileName, size: 0 });
        } else {
          setAudioFile(null);
        }
      }

      // Try to fetch images-map.json which contains image filenames for each XML
      const imagesMapResponse = await fetch('/images/images-map.json');
      if (imagesMapResponse.ok) {
        const imagesMapData = await imagesMapResponse.json() as Record<string, string[]>;
        // Look for images associated with this XML
        const lowerFileName = xmlFileName.toLowerCase();
        let associatedImages: string[] = [];
        
        if (imagesMapData[lowerFileName]) {
          associatedImages = imagesMapData[lowerFileName];
        } else if (imagesMapData[xmlFileName]) {
          associatedImages = imagesMapData[xmlFileName];
        }
        
        if (associatedImages.length > 0) {
          setImageFiles(associatedImages.map(name => ({ name, size: 0 })));
        } else {
          setImageFiles([]);
        }
      }
      
      setHasChanges(false);
    } catch {
      // Silently fail - file detection is optional
    }
  }

  async function loadSample(path: string, label: string) {
    setStatus('loading');
    setError('');
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Failed to load ${label}`);
      const text = await response.text();
      parseJournalineXml(text);
      setXmlText(text);
      setSourceLabel(label);
      setStatus('ready');
      // Detect and load associated files
      await detectAssociatedFiles(label);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to load XML file.');
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus('loading');
    setError('');
    setUploadError('');
    try {
      const text = await file.text();
      parseJournalineXml(text);
      setXmlText(text);
      setSourceLabel(file.name);
      setStatus('ready');
      
      // Save the XML to server
      try {
        const saveResponse = await fetch('http://localhost:5001/api/upload-xml', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: file.name,
            content: text
          })
        });
        
        const saveData = await saveResponse.json();
        
        if (saveResponse.ok) {
          // Reload the saved XMLs list
          await loadSavedXmlsList();
          console.log('XML saved successfully:', saveData);
        } else {
          console.error('Failed to save XML to server:', saveData);
          setUploadError(`Failed to save: ${saveData.error || 'Unknown error'}`);
        }
      } catch (saveErr) {
        // Server error, but still allow the file to be displayed
        console.error('Failed to save XML to server:', saveErr);
        setUploadError(`Save error: ${saveErr instanceof Error ? saveErr.message : 'Network error'}`);
      }
      
      // Detect and load associated files
      await detectAssociatedFiles(file.name);
      
      // Validate XML against schema
      await validateXmlAgainstSchema(text);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Invalid XML file.');
    }
  }

  async function loadSavedXml(filename: string, label: string) {
    try {
      setStatus('loading');
      setError('');
      
      const response = await fetch('http://localhost:5001/api/get-xml', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename })
      });
      
      if (!response.ok) {
        throw new Error('Failed to load saved XML');
      }
      
      const data = await response.json();
      const text = data.content;
      
      parseJournalineXml(text);
      setXmlText(text);
      setSourceLabel(label);
      setStatus('ready');
      void detectAssociatedFiles(label);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load XML');
    }
  }

  async function deleteSavedXml(filename: string) {
    try {
      console.log('Attempting to delete:', filename);
      const response = await fetch('http://localhost:5001/api/delete-xml', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename })
      });
      
      const data = await response.json();
      console.log('Delete response:', data);
      
      if (response.ok) {
        console.log('File deleted successfully');
        setUploadError('');
        // Reload the saved XMLs list
        await loadSavedXmlsList();
        // Close the file UI if the deleted file was active
        if (sourceLabel === filename) {
          setXmlText('');
          setSourceLabel('');
          setAudioFile(null);
          setImageFiles([]);
        }
      } else {
        const errorMsg = data?.error || 'Failed to delete XML file';
        console.error('Delete failed:', errorMsg);
        setUploadError(`Delete error: ${errorMsg}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Network error';
      console.error('Failed to delete saved XML:', err);
      setUploadError(`Delete failed: ${errorMsg}`);
    }
  }

  async function validateXmlAgainstSchema(xmlContent: string) {
    try {
      const response = await fetch('http://localhost:5001/api/validate-xml', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ xmlContent })
      });
      
      const result = await response.json();
      setValidationResult(result);
      
      if (result.valid) {
        console.log('✓ XML is valid according to Journaline.xsd');
      } else {
        console.warn('✗ XML validation errors:', result.errors);
        if (result.errors && result.errors.length > 0) {
          const errorMsg = result.errors.map((e: any) => `Line ${e.line}: ${e.message}`).join('\n');
          setUploadError(`Validation errors:\n${errorMsg}`);
        }
      }
    } catch (err) {
      console.error('Validation request failed:', err);
      setValidationResult({
        valid: false,
        error: 'Failed to validate XML'
      });
    }
  }

  function handleAudioUpload(event: React.ChangeEvent<HTMLInputElement>) {
    if (!xmlText) {
      setUploadError('Please load or upload an XML file first');
      return;
    }
    
    const file = event.target.files?.[0];
    if (!file) return;
    
    setUploadError('');
    
    // Create a blob URL for the uploaded audio file
    const blobUrl = URL.createObjectURL(file);
    
    // Remove old uploaded audio blob URL if exists
    if (uploadedAudioUrl) {
      URL.revokeObjectURL(uploadedAudioUrl);
    }
    
    setAudioFile({ name: file.name, size: file.size, blobUrl });
    setUploadedAudioUrl(blobUrl);
  }

  function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    if (!xmlText) {
      setUploadError('Please load or upload an XML file first');
      return;
    }

    const files = event.target.files;
    if (!files) return;

    setUploadError('');
    const newImages = Array.from(files).map(file => ({ name: file.name, size: file.size }));
    setImageFiles([...imageFiles, ...newImages]);
  }

  function removeAudioFile() {
    // Revoke the blob URL to free up memory
    if (uploadedAudioUrl) {
      URL.revokeObjectURL(uploadedAudioUrl);
      setUploadedAudioUrl(null);
    }
    setAudioFile(null);
  }

  function removeImageFile(index: number) {
    setImageFiles(imageFiles.filter((_, i) => i !== index));
  }

  function handleSave() {
    // Save audio file to server only if it's a NEW upload (blob URL, not a server path)
    if (audioFile && uploadedAudioUrl && audioFile.blobUrl && audioFile.blobUrl.startsWith('blob:')) {
      // This is a new audio file (blob URL), need to upload
      uploadAudioFileToServer();
    } else {
      // No new audio upload, just save metadata
      saveMetadataToStorage();
    }
  }

  async function uploadAudioFileToServer() {
    try {
      setUploadError('');
      
      // Get the file from the input
      const audioInput = document.querySelector('input[accept*="audio"]') as HTMLInputElement;
      const file = audioInput?.files?.[0];
      
      if (!file) {
        saveMetadataToStorage();
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://localhost:5001/api/upload-audio', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload audio file');
      }

      const result = await response.json();
      
      // Update audioFile with the server path
      setAudioFile({
        name: audioFile!.name,
        size: audioFile!.size,
        blobUrl: result.path // Store the server path instead of blob URL
      });

      // Save the server path to storage
      saveAudioPathToStorage(result.path);
    } catch (err) {
      setUploadError('Failed to upload audio: ' + (err instanceof Error ? err.message : 'Unknown error'));
      // Still save local metadata even if upload fails
      saveMetadataToStorage();
    }
  }

  function saveAudioPathToStorage(serverPath: string) {
    const audioToSave = { name: audioFile!.name, size: audioFile!.size, blobUrl: serverPath };
    const imagesToSave = imageFiles.map(f => ({ name: f.name, size: f.size }));
    
    const savedState: SavedState = {
      sourceLabel,
      audio: audioToSave,
      images: imagesToSave,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(`journaline_${sourceLabel}`, JSON.stringify(savedState));
      setLastSaved(Date.now());
      setHasChanges(false);
      setUploadError('');
    } catch (err) {
      setUploadError('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }

  function saveMetadataToStorage() {
    const audioToSave = audioFile ? { name: audioFile.name, size: audioFile.size, blobUrl: audioFile.blobUrl } : null;
    const imagesToSave = imageFiles.map(f => ({ name: f.name, size: f.size }));
    
    const savedState: SavedState = {
      sourceLabel,
      audio: audioToSave,
      images: imagesToSave,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(`journaline_${sourceLabel}`, JSON.stringify(savedState));
      setLastSaved(Date.now());
      setHasChanges(false);
      setUploadError('');
    } catch (err) {
      setUploadError('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }

  function navigateTo(id?: string) {
    if (!doc || !id) return;
    const actual = doc.pages[id]?.kind === 'reference'
      ? resolveReferenceTarget(doc, doc.pages[id].referenceTarget || '') || doc.rootPageId
      : id;
    if (doc.pages[actual]) setCurrentPageId(actual);
  }

  return (
    <div className="app-shell">
      <aside className="control-panel">
        <div className="brand-card">
          <div className="brand-logo" aria-hidden="true">JR</div>
          <div>
            <h1>Journaline Reader UI</h1>
            <p>Fixed layout, XML-driven content.</p>
          </div>
        </div>

        <div className="control-section">
          <h2>Sample XML</h2>
          <div className="button-stack">
            {SAMPLE_FILES.map((file) => (
              <div key={file.key} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="secondary-button" 
                  style={{ 
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={file.label}
                  onClick={() => void loadSample(file.path, file.label)}
                >
                  {file.label}
                </button>
                <button 
                  className="remove-btn"
                  style={{ width: '36px', height: '36px' }}
                  onClick={() => void deleteSavedXml(file.label)}
                  title="Delete XML file"
                >
                  ✕
                </button>
              </div>
            ))}
            
            {savedXmls.length > 0 && (
              <>
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', opacity: 0.7 }}>Saved XMLs:</p>
                </div>
                {savedXmls.map((savedXml) => (
                  <div key={savedXml.name} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button 
                      className="secondary-button" 
                      style={{ 
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      onClick={() => void loadSavedXml(savedXml.name, savedXml.label)}
                      title={savedXml.label}
                    >
                      {savedXml.label}
                    </button>
                    <button 
                      className="remove-btn"
                      style={{ width: '36px', height: '36px' }}
                      onClick={() => void deleteSavedXml(savedXml.name)}
                      title="Delete saved XML"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="control-section">
          <h2>Upload XML</h2>
          <label className="upload-box">
            <span>Select .xml file</span>
            <input type="file" accept=".xml,text/xml" onChange={handleUpload} />
          </label>
          <p className="helper-text">Tip: keep page <code>idString</code> values stable to match per-page audio files.</p>
          
          {validationResult && (
            <div style={{ 
              marginTop: '12px', 
              padding: '12px', 
              borderRadius: '8px',
              backgroundColor: validationResult.valid ? 'rgba(26, 160, 131, 0.15)' : 'rgba(255, 107, 107, 0.15)',
              border: `1px solid ${validationResult.valid ? '#1aa083' : '#ff6b6b'}`
            }}>
              <p style={{ 
                margin: '0 0 8px 0',
                color: validationResult.valid ? '#1aa083' : '#ff6b6b',
                fontWeight: 'bold'
              }}>
                {validationResult.valid ? '✓ XML Valid' : '✗ XML Invalid'}
              </p>
              {validationResult.message && (
                <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>
                  {validationResult.message}
                </p>
              )}
              {validationResult.errors && validationResult.errors.length > 0 && (
                <div style={{ fontSize: '0.85rem' }}>
                  {validationResult.errors.map((error, idx) => (
                    <p key={idx} style={{ margin: '4px 0', color: '#ff6b6b' }}>
                      {error.line && `Line ${error.line}: `}{error.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {xmlText && (
          <>
            <div className="control-section">
              <h2>Audio</h2>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                <select 
                  value={audioFile?.name || ''} 
                  onChange={(e) => {
                    const newAudio = e.target.value ? { name: e.target.value, size: 0 } : null;
                    setAudioFile(newAudio);
                  }}
                  size={1}
                  style={{ 
                    flex: 1, 
                    padding: '0.5rem', 
                    borderRadius: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={audioFile?.name || 'No audio selected'}
                >
                  <option value="">No audio selected</option>
                  {audioFile && <option value={audioFile.name}>{audioFile.name}</option>}
                </select>
                <label className="upload-box" style={{ marginBottom: 0, minWidth: '120px' }}>
                  <span>Choose file</span>
                  <input 
                    type="file" 
                    accept=".mp3,.wav,audio/mpeg,audio/wav" 
                    onChange={handleAudioUpload}
                  />
                </label>
                {audioFile && (
                  <button className="remove-btn" onClick={removeAudioFile} style={{ width: '36px', height: '36px' }}>
                    ✕
                  </button>
                )}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ minWidth: '80px' }}>Volume:</label>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1" 
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: '40px' }}>{Math.round(volume * 100)}%</span>
              </div>
            </div>

            <div className="control-section">
              <h2>Upload Images</h2>
              <label className="upload-box">
                <span>Select .jpg, .png or .gif files (multiple allowed)</span>
                <input 
                  type="file" 
                  accept=".jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif" 
                  multiple
                  onChange={handleImageUpload}
                />
              </label>
              {imageFiles.length > 0 && (
                <div className="file-list">
                  {imageFiles.map((img, index) => (
                    <div key={`img-${index}`} className="file-item">
                      <span className="file-name">🖼 {img.name}</span>
                      <button className="remove-btn" onClick={() => removeImageFile(index)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {uploadError && <div className="control-section error-text">{uploadError}</div>}

        <div className="control-section small-text">
          <h2>Status</h2>
          <p><strong>Source:</strong> {sourceLabel}</p>
          <p><strong>State:</strong> {status}</p>
          {error ? <p className="error-text">{error}</p> : null}
          {doc ? (
            <>
              <p><strong>Pages:</strong> {Object.keys(doc.pages).length}</p>
              <p><strong>Author:</strong> {doc.meta.author || '—'}</p>
              <p><strong>Version:</strong> {doc.meta.version || '—'}</p>
              <p><strong>Audio:</strong> {audioFile ? audioFile.name : 'No match'}</p>
              <p><strong>Images:</strong> {imageFiles.length > 0 ? imageFiles.length : 'No images'}</p>
            </>
          ) : null}
        </div>

        {xmlText && (
          <div className="control-section">
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
              <button 
                className="save-button"
                onClick={handleSave}
                disabled={!hasChanges}
              >
                💾 Save
              </button>
              {hasChanges && <span className="unsaved-badge">● Unsaved changes</span>}
              {lastSaved && !hasChanges && <span className="saved-badge">✓ Saved</span>}
            </div>
            <p className="helper-text" style={{ margin: '0' }}>
              {lastSaved ? `Last saved: ${new Date(lastSaved).toLocaleTimeString()}` : 'Save your file configuration'}
            </p>
          </div>
        )}
      </aside>

      <main className="viewer-shell">
        <header className="viewer-header-top">
          <div className="viewer-brand">Journaline Demo Reader</div>
          <div className="viewer-subbrand">XML → Model → UI → Per-page audio</div>
        </header>

        <div className="viewer-service-bar">
          <div>
            <div className="service-name">EduRadio English</div>
            <div className="service-note">Open an XML page and play the audio assigned to that page.</div>
          </div>
          <div className="service-actions">
            <button 
              className="service-action-button"
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                setIsMuted(false);
              }}
              style={{ width: '120px', cursor: 'pointer' }}
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
            <span style={{ minWidth: '40px', fontSize: '0.85rem' }}>
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        {resolved ? (
          <section className="page-surface">
            <Toolbar onPrev={() => navigateTo(resolved.previousId)} onUp={() => navigateTo(resolved.upId)} onNext={() => navigateTo(resolved.nextId)} />

            <nav className="breadcrumbs">
              {resolved.breadcrumbs.map((crumb, index) => (
                <span key={crumb.id}>
                  {index > 0 ? <span className="crumb-divider">›</span> : null}
                  <button className="crumb-button" onClick={() => navigateTo(crumb.id)}>{inlineToPlainText(crumb.title) || 'Untitled'}</button>
                </span>
              ))}
            </nav>

            <AudioPlayer
              audioUrl={audioInfo.url}
              pageTitle={inlineToPlainText(resolved.page.title) || 'Untitled page'}
              matchedKey={audioInfo.matchedKey}
              isMuted={isMuted}
              volume={volume}
            />

            <PageView page={resolved.page} onNavigate={navigateTo} />

            <footer className="bottom-nav">
              {doc && resolved.page.meta.links
                .filter((link) => link.type === 'jml')
                .map((link, index) => {
                  const resolvedId = resolveReferenceTarget(doc, link.target);
                  return (
                    <button
                      key={index}
                      className="nav-card"
                      disabled={!resolvedId}
                      onClick={() => resolvedId && navigateTo(resolvedId)}
                    >
                      <InlineRenderer nodes={link.label} />
                    </button>
                  );
                })}
            </footer>
          </section>
        ) : (
          <section className="empty-state">Load a sample XML file to begin.</section>
        )}
      </main>
    </div>
  );
}

function Toolbar({ onPrev, onUp, onNext }: { onPrev: () => void; onUp: () => void; onNext: () => void }) {
  return (
    <div className="mini-toolbar">
      <button onClick={onPrev}>◀ previous</button>
      <button onClick={onUp}>↑ up</button>
      <button onClick={onNext}>next ▶</button>
    </div>
  );
}

function PageView({ page, onNavigate }: { page: PageNode; onNavigate: (id?: string) => void }) {
  if (page.kind === 'menu') {
    return (
      <div className="page-layout">
        <div className="content-main">
          <h2 className="page-title"><InlineRenderer nodes={page.title} /></h2>
          <div className="menu-list">
            {page.menuItems?.map((item) => (
              <button key={`${page.id}-${item.targetId}`} className="menu-link" onClick={() => onNavigate(item.targetId)}>
                <span className="menu-link-bullet">➜</span>
                <span><InlineRenderer nodes={item.label} /></span>
              </button>
            ))}
          </div>
          <MetaPanel page={page} />
        </div>
        <aside className="content-aside">
          <AsideCard title="Menu Page" body="This page is rendered from a Journaline <menu> node. The layout stays fixed while XML content and audio mapping change." />
        </aside>
      </div>
    );
  }

  return (
    <div className="page-layout">
      <div className="content-main">
        <h2 className="page-title"><InlineRenderer nodes={page.title} /></h2>
        {page.kind === 'titleOnly' ? (
          <section className="article-card intro-card">
            <p className="article-intro">This is a title-only Journaline message. It behaves like a compact update page.</p>
          </section>
        ) : null}

        {page.kind === 'article' ? (
          <section className="article-card">
            <InlineBlockRenderer nodes={page.body || []} />
          </section>
        ) : null}

        {page.kind === 'list' ? (
          <section className="article-card">
            <div className="list-table">
              {page.listItems?.map((row, index) => (
                <div key={`${page.id}-row-${index}`} className="list-row">
                  <InlineRenderer nodes={row} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <ActionLinks links={page.meta.links} />
        <MetaPanel page={page} />
      </div>
      <aside className="content-aside">
        <AsideCard title={kindLabel(page.kind)} body="The UI theme stays the same. Only the parsed XML data changes page title, text, lists, links, audio, and navigation." />
      </aside>
    </div>
  );
}

function ActionLinks({ links }: { links: ActionLink[] }) {
  if (!links.length) return null;
  return (
    <section className="action-links">
      {links.map((link, index) => (
        <div key={`${link.target}-${index}`} className="action-link-card">
          <div className="action-link-type">{link.type}</div>
          <div className="action-link-label"><InlineRenderer nodes={link.label} /></div>
          <div className="action-link-target">{link.target}</div>
        </div>
      ))}
    </section>
  );
}

function MetaPanel({ page }: { page: PageNode }) {
  const hasMeta = page.meta.positions.length || page.meta.regions.length || page.meta.abstimeout || page.idString || page.objectID;
  if (!hasMeta) return null;
  return (
    <section className="meta-panel">
      {page.idString ? <div><strong>idString:</strong> {page.idString}</div> : null}
      {page.objectID ? <div><strong>objectID:</strong> {page.objectID}</div> : null}
      {page.meta.positions.length ? (
        <div>
          <strong>Geo positions:</strong>
          <ul>
            {page.meta.positions.map((pos, index) => (
              <li key={`${page.id}-pos-${index}`}>{pos.lat}, {pos.lon}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {page.meta.regions.length ? (
        <div>
          <strong>Regions:</strong>
          <ul>
            {page.meta.regions.map((region, index) => (
              <li key={`${page.id}-region-${index}`}>Polygon with {region.positions.length} points</li>
            ))}
          </ul>
        </div>
      ) : null}
      {page.meta.abstimeout ? <div><strong>Absolute timeout:</strong> {page.meta.abstimeout}</div> : null}
    </section>
  );
}

function AsideCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="aside-card">
      <div className="aside-badge">UI</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function InlineBlockRenderer({ nodes }: { nodes: InlineNode[] }) {
  const blocks: React.ReactNode[] = [];
  let currentInline: InlineNode[] = [];

  const flush = (key: string) => {
    if (!currentInline.length) return;
    blocks.push(
      <p key={key} className="article-paragraph">
        <InlineRenderer nodes={currentInline} />
      </p>,
    );
    currentInline = [];
  };

  nodes.forEach((node, index) => {
    if (node.type === 'paragraph') {
      flush(`text-${index}`);
      blocks.push(
        <p key={`p-${index}`} className="article-paragraph">
          <InlineRenderer nodes={node.children} />
        </p>,
      );
      return;
    }
    if (node.type === 'introductionBreak') {
      flush(`intro-${index}`);
      blocks.push(<div key={`rule-${index}`} className="intro-divider">Introduction</div>);
      return;
    }
    currentInline.push(node);
  });

  flush('final');
  return <>{blocks}</>;
}

function InlineRenderer({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.type) {
          case 'text':
            return <span key={index}>{node.value} </span>;
          case 'br':
            return <br key={index} />;
          case 'paragraph':
            return <span key={index} className="inline-paragraph"><InlineRenderer nodes={node.children} /></span>;
          case 'emphasis':
            return <em key={index}><InlineRenderer nodes={node.children} /></em>;
          case 'strong':
            return <strong key={index}><InlineRenderer nodes={node.children} /></strong>;
          case 'image':
            return <img key={index} className="inline-image" src={node.src} alt={node.alt || 'Journaline image'} />;
          case 'speechBreak':
            return <span key={index} className="speech-break">⏸ {node.seconds || '1'}s </span>;
          case 'keyword':
            return <mark key={index} title={node.description}><InlineRenderer nodes={node.children} /></mark>;
          case 'unsupported':
            return <span key={index} className="unsupported-chip">{node.label}</span>;
          case 'introductionBreak':
            return null;
          default:
            return null;
        }
      })}
    </>
  );
}

function kindLabel(kind: PageNode['kind']) {
  switch (kind) {
    case 'article':
      return 'Article Page';
    case 'list':
      return 'List Page';
    case 'titleOnly':
      return 'Title-only Page';
    case 'menu':
      return 'Menu Page';
    default:
      return 'Page';
  }
}

function pageLabel(doc: JournalineDocument, id: string) {
  const page = doc.pages[id];
  return page ? inlineToPlainText(page.title) : id;
}
