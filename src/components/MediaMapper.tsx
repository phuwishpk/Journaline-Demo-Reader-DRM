import { useEffect, useRef, useState } from 'react';
import { inlineToPlainText, getAudioUrlFromValue, getAudioFilenameFromValue } from '../audio';
import type { AudioMap } from '../audio';
import type { ImageMap } from '../images';
import type { JournalineDocument, PageNode } from '../types';

type PageMediaMap = Record<string, { audioKey?: string; imageKey?: string }>;

type BaseMedia = {
  audio: Array<{ name: string; stem: string; url: string }>;
  images: Array<{ name: string; url: string; folder?: string }>;
};

type Props = {
  doc: JournalineDocument | null;
  audioMap: AudioMap;
  imageMap: ImageMap;
  onSave: (mapping: PageMediaMap) => void;
};

export default function MediaMapper({ doc, audioMap, imageMap, onSave }: Props) {
  const [mapping, setMapping] = useState<PageMediaMap>({});
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [baseMedia, setBaseMedia] = useState<BaseMedia>({ audio: [], images: [] });
  const [loadingMedia, setLoadingMedia] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load base media files from /public/audio and /public/images
  useEffect(() => {
    const fetchBaseMedia = async () => {
      try {
        const res = await fetch('http://localhost:5001/api/media/list');
        if (res.ok) {
          const data = await res.json();
          console.log('📊 Fetched base media:', data);
          setBaseMedia(data);
        } else {
          console.error('Failed to fetch media list:', res.status);
        }
      } catch (err) {
        console.error('Failed to load base media:', err);
      } finally {
        setLoadingMedia(false);
      }
    };
    fetchBaseMedia();
  }, []);

  // Load initial mapping from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('pageMediaMapping');
    if (stored) {
      setMapping(JSON.parse(stored));
    }
  }, []);

  // Get all pages from document
  const allPages = doc
    ? Object.values(doc.pages)
        .sort((a, b) => {
          const aTitle = inlineToPlainText(a.title) || '';
          const bTitle = inlineToPlainText(b.title) || '';
          return aTitle.localeCompare(bTitle);
        })
    : [];

  const currentPage = selectedPageId && doc ? doc.pages[selectedPageId] : null;
  const currentMapping = selectedPageId ? mapping[selectedPageId] || {} : {};

  const handleAudioSelect = (audioKey: string) => {
    if (!selectedPageId) return;
    setMapping((prev) => ({
      ...prev,
      [selectedPageId]: {
        ...prev[selectedPageId],
        audioKey,
      },
    }));
    // Get URL from combinedAudioItems (already converted to URLs)
    const url = combinedAudioItems.find(a => a.key === audioKey)?.url || null;
    setPlayingAudio(url);
  };

  const handleImageSelect = (imageKey: string) => {
    if (!selectedPageId) return;
    setMapping((prev) => ({
      ...prev,
      [selectedPageId]: {
        ...prev[selectedPageId],
        imageKey,
      },
    }));
  };

  const handleSave = () => {
    localStorage.setItem('pageMediaMapping', JSON.stringify(mapping));
    onSave(mapping);
    alert('✅ Media mapping saved!');
  };

  // Combine base media files + uploaded media
  const combinedAudioItems = [
    ...baseMedia.audio.map((f) => ({
      key: f.stem,
      name: f.name,
      url: f.url,
      isBase: true,
    })),
    ...Object.entries(audioMap).map(([key, value]) => ({
      key,
      name: key,
      url: getAudioUrlFromValue(value),
      isBase: false,
    })),
  ]
    .filter((v, i, a) => a.findIndex((x) => x.key === v.key) === i) // Remove duplicates
    .sort((a, b) => a.key.localeCompare(b.key));

  const combinedImageItems = [
    ...baseMedia.images.map((f) => ({
      key: f.name,
      name: f.folder ? `${f.folder}/${f.name}` : f.name,
      url: f.url,
      isBase: true,
    })),
    ...Object.entries(imageMap).map(([key, url]) => ({
      key,
      name: key,
      url,
      isBase: false,
    })),
  ]
    .filter((v, i, a) => a.findIndex((x) => x.key === v.key) === i) // Remove duplicates
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="media-mapper">
      <h2>📱 Media Mapper - ผูกเสียง/รูปกับแต่ละหน้า</h2>

      <div className="mapper-grid">
        {/* Left: Page List */}
        <div className="mapper-pages">
          <h3>📄 Pages ({allPages.length})</h3>
          <div className="page-list">
            {allPages.length === 0 ? (
              <p className="empty-hint">ยังไม่มี XML</p>
            ) : (
              allPages.map((page) => (
                <button
                  key={page.id}
                  className={`page-item ${selectedPageId === page.id ? 'active' : ''}`}
                  onClick={() => setSelectedPageId(page.id)}
                >
                  <span className="page-title">
                    {inlineToPlainText(page.title) || 'Untitled'}
                  </span>
                  {mapping[page.id]?.audioKey && (
                    <span className="badge">🔊</span>
                  )}
                  {mapping[page.id]?.imageKey && (
                    <span className="badge">📸</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Media Selection */}
        <div className="mapper-editor">
          {!selectedPageId ? (
            <div className="empty-hint">
              <p>เลือกหน้าเพื่อจัดการเสียง/รูปภาพ</p>
            </div>
          ) : (
            <>
              <div className="page-header">
                <h3>
                  📄{' '}
                  {inlineToPlainText((currentPage?.title as any) || []) || 'Untitled'}
                </h3>
                <small>{selectedPageId}</small>
              </div>

              {/* Audio Selection */}
              <div className="mapper-section">
                <h4>🔊 เสียง</h4>

                {loadingMedia ? (
                  <p className="empty-hint">⏳ Loading audio files...</p>
                ) : combinedAudioItems.length === 0 ? (
                  <p className="empty-hint">ไม่มีไฟล์เสียง</p>
                ) : (
                  <>
                    <div className="audio-list">
                      {combinedAudioItems.map((item) => (
                        <button
                          key={item.key}
                          className={`audio-item ${
                            currentMapping.audioKey === item.key ? 'selected' : ''
                          }`}
                          onClick={() => handleAudioSelect(item.key)}
                          title={item.isBase ? 'Base audio file' : 'Uploaded file'}
                        >
                          <span>
                            {item.name}
                            {item.isBase && <span style={{ opacity: 0.6, fontSize: '0.8em', marginLeft: '4px' }}>📂</span>}
                          </span>
                          {currentMapping.audioKey === item.key && (
                            <span className="check">✓</span>
                          )}
                        </button>
                      ))}
                    </div>

                    {currentMapping.audioKey && (
                      <div className="audio-preview">
                        <audio
                          ref={audioRef}
                          src={combinedAudioItems.find(a => a.key === currentMapping.audioKey)?.url || undefined}
                          controls
                          style={{ width: '100%' }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Image Selection */}
              <div className="mapper-section">
                <h4>📸 รูปภาพ</h4>

                {loadingMedia ? (
                  <p className="empty-hint">⏳ Loading image files...</p>
                ) : combinedImageItems.length === 0 ? (
                  <p className="empty-hint">ไม่มีไฟล์รูปภาพ</p>
                ) : (
                  <>
                    <div className="image-list">
                      {combinedImageItems.map((item) => (
                        <button
                          key={item.key}
                          className={`image-item ${
                            currentMapping.imageKey === item.key ? 'selected' : ''
                          }`}
                          onClick={() => handleImageSelect(item.key)}
                          title={item.isBase ? 'Base image file' : 'Uploaded file'}
                        >
                          <img
                            src={item.url as string}
                            alt={item.name}
                            style={{
                              width: '60px',
                              height: '60px',
                              objectFit: 'cover',
                            }}
                          />
                          <span>
                            {item.name}
                            {item.isBase && <span style={{ opacity: 0.6, fontSize: '0.8em' }}> 📂</span>}
                          </span>
                          {currentMapping.imageKey === item.key && (
                            <span className="check">✓</span>
                          )}
                        </button>
                      ))}
                    </div>

                    {currentMapping.imageKey && (
                      <div className="image-preview">
                        <img
                          src={imageMap[currentMapping.imageKey] || 
                               combinedImageItems.find(i => i.key === currentMapping.imageKey)?.url}
                          alt={currentMapping.imageKey}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '200px',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="mapper-footer">
        <button className="primary-button" onClick={handleSave}>
          💾 Save Mapping
        </button>
      </div>
    </div>
  );
}
