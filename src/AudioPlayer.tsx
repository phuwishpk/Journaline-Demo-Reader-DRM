import { useEffect, useRef } from 'react';

type Props = {
  audioUrl: string | null;
  pageTitle: string;
  matchedKey?: string | null;
  isMuted: boolean;
  volume: number;
};

export default function AudioPlayer({ audioUrl, pageTitle, matchedKey, isMuted, volume }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();

    if (!audioUrl) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    audio.src = audioUrl;
    audio.load();

    // Auto-play when new audio is set
    void audio.play().catch(() => {
      // Ignore play errors (browser autoplay policies, etc)
    });
  }, [audioUrl]);

  return (
    <div className="audio-player-card">
      <audio
        ref={audioRef}
        onEnded={() => {
          // Audio finished - no restart allowed
        }}
      />

      <div className="audio-player-topline">
        <div>
          <div className="audio-player-label">Page audio</div>
          <div className="audio-player-title">{pageTitle || 'Untitled page'}</div>
          <div className="audio-player-subtitle">{matchedKey ? `Matched key: ${matchedKey}` : 'No audio mapped for this page'}</div>
        </div>
      </div>
    </div>
  );
}
