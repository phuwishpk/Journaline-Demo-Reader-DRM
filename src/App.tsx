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

  const doc = useMemo<JournalineDocument | null>(() => {
    if (!xmlText) return null;
    try {
      return parseJournalineXml(xmlText);
    } catch {
      return null;
    }
  }, [xmlText]);

  useEffect(() => {
    void loadSample(SAMPLE_FILES[0].path, SAMPLE_FILES[0].label);
    void loadAudioMap().then(setAudioMap);
  }, []);

  useEffect(() => {
    if (doc) {
      setCurrentPageId(doc.rootPageId);
    }
  }, [doc]);

  const resolved = doc ? resolvePage(doc, currentPageId || doc.rootPageId) : null;
  const audioInfo = useMemo(
    () => resolveAudioUrl({ audioMap, page: resolved?.page ?? null, sourceLabel, doc }),
    [audioMap, resolved?.page, sourceLabel, doc],
  );

  async function detectAssociatedFiles(xmlFileName: string) {
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
        }
      }
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
      // Detect and load associated files
      await detectAssociatedFiles(file.name);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Invalid XML file.');
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
    setAudioFile({ name: file.name, size: file.size });
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
    setAudioFile(null);
  }

  function removeImageFile(index: number) {
    setImageFiles(imageFiles.filter((_, i) => i !== index));
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
            <input type="file" accept=".xml,text/xml" onChange={handleUpload} />
          </label>
          <p className="helper-text">Tip: keep page <code>idString</code> values stable to match per-page audio files.</p>
        </div>

        {xmlText && (
          <>
            <div className="control-section">
              <h2>Upload Audio</h2>
              <label className="upload-box">
                <span>Select .mp3 or .wav file (1 file only)</span>
                <input 
                  type="file" 
                  accept=".mp3,.wav,audio/mpeg,audio/wav" 
                  onChange={handleAudioUpload}
                  disabled={!!audioFile}
                />
              </label>
              {audioFile && (
                <div className="file-list">
                  <div className="file-item">
                    <span className="file-name">🔊 {audioFile.name}</span>
                    <button className="remove-btn" onClick={removeAudioFile}>✕</button>
                  </div>
                </div>
              )}
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
            <select
              className="service-action-dropdown"
              value={volume.toString()}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                setIsMuted(false);
              }}
            >
              <option value="0.25">25%</option>
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
            </select>
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
