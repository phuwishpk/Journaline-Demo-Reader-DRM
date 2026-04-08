import { useEffect, useRef, useState } from 'react';

type Props = {
  audioUrl: string | null;
  filename?: string | null;
  matchedKey?: string | null;
  onVolumeChange?: (volume: number) => void;
};

export default function AudioControls({ audioUrl, filename, matchedKey, onVolumeChange }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // ✅ Watch audioUrl changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioUrl) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    audio.src = audioUrl;
    audio.load();
    // Auto-play new audio
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [audioUrl]);

  // ✅ Update volume on state change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : newVolume;
    }
    onVolumeChange?.(newVolume);
  };

  const handleMuteClick = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (audioRef.current) {
      audioRef.current.volume = newMuted ? 0 : volume;
    }
  };

  const canPlay = Boolean(audioUrl);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {filename && (
        <span style={{ 
          fontSize: '12px', 
          color: '#666',
          whiteSpace: 'nowrap',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }} 
        title={filename}>
          🎵 {filename}
        </span>
      )}
      <audio 
        ref={audioRef} 
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      
      <button 
        className="icon-button" 
        onClick={handleMuteClick}
        title={isMuted ? 'Unmute' : 'Mute'}
        style={{ marginRight: '4px', opacity: canPlay ? 1 : 0.5 }}
        disabled={!canPlay}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>
      
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={isMuted ? 0 : volume}
        onChange={(e) => handleVolumeChange(Number(e.target.value))}
        disabled={!canPlay}
        style={{
          width: '80px',
          cursor: canPlay ? 'pointer' : 'not-allowed',
          opacity: canPlay ? 1 : 0.5,
        }}
        title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
      />
    </div>
  );
}
