import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  audioUrl: string | null;
  pageTitle: string;
  matchedKey?: string | null;
};

export default function AudioPlayer({ audioUrl, pageTitle, matchedKey }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [wasPlayingBeforeChange, setWasPlayingBeforeChange] = useState(false);

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

    const shouldResume = !audio.paused || wasPlayingBeforeChange;
    setWasPlayingBeforeChange(!audio.paused);
    audio.pause();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    if (!audioUrl) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    audio.src = audioUrl;
    audio.load();

    if (shouldResume) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [audioUrl]);

  const canPlay = Boolean(audioUrl);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !canPlay) return;

    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
      setWasPlayingBeforeChange(true);
    } else {
      audio.pause();
      setIsPlaying(false);
      setWasPlayingBeforeChange(false);
    }
  }

  function handleSeek(nextValue: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = nextValue;
    setCurrentTime(nextValue);
  }

  const volumeLabel = useMemo(() => `${Math.round(volume * 100)}%`, [volume]);

  return (
    <div className="audio-player-card">
      <audio
        ref={audioRef}
        onEnded={() => {
          setIsPlaying(false);
          setWasPlayingBeforeChange(false);
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
      />

      <div className="audio-player-topline">
        <div>
          <div className="audio-player-label">Page audio</div>
          <div className="audio-player-title">{pageTitle || 'Untitled page'}</div>
          <div className="audio-player-subtitle">{matchedKey ? `Matched key: ${matchedKey}` : 'No audio mapped for this page'}</div>
        </div>
        <div className="audio-player-actions">
          <button className="icon-button" onClick={togglePlay} disabled={!canPlay} title={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <button className="icon-button" onClick={() => setIsMuted((value) => !value)} disabled={!canPlay} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      <div className="audio-seek-row">
        <span>{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => handleSeek(Number(event.target.value))}
          disabled={!canPlay || !duration}
        />
        <span>{formatTime(duration)}</span>
      </div>

      <div className="audio-volume-row">
        <span>{isMuted ? 'Muted' : 'Volume'}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
        />
        <span>{volumeLabel}</span>
      </div>
    </div>
  );
}

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
