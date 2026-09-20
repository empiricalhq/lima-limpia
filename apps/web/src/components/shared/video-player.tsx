'use client';

import { useEffect, useRef, useState } from 'react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
}

const PERCENT_SCALE = 100;
const LOW_VOLUME_THRESHOLD = 0.5;

function VolumeIcon({ isMuted, volume }: { isMuted: boolean; volume: number }) {
  if (isMuted || volume === 0) {
    return (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }

  if (volume < LOW_VOLUME_THRESHOLD) {
    return (
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" />
        <path d="M15.54,8.46a5,5,0,0,1,0,7.07" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" />
      <path d="M15.54,8.46a5,5,0,0,1,0,7.07" />
      <path d="M19.07,4.93a10,10,0,0,1,0,14.14" />
    </svg>
  );
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: one video element with tightly coupled playback state; VolumeIcon is already extracted.
export function VideoPlayer({ src, poster, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);
    const updatePlayingState = () => setIsPlaying(!video.paused);

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('play', updatePlayingState);
    video.addEventListener('pause', updatePlayingState);
    video.addEventListener('ended', updatePlayingState);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('play', updatePlayingState);
      video.removeEventListener('pause', updatePlayingState);
      video.removeEventListener('ended', updatePlayingState);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const time = (Number.parseFloat(event.target.value) / PERCENT_SCALE) * duration;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const newVolume = Number.parseFloat(event.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (isMuted) {
      video.volume = volume > 0 ? volume : 1;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`bg-white rounded-lg overflow-hidden ${className}`} style={{ touchAction: 'manipulation' }}>
      <div className="relative bg-black">
        {/* biome-ignore lint/a11y/useMediaCaption: The external source has no caption track and no transcript is available. */}
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className="w-full h-auto"
          crossOrigin=""
          playsInline={true}
          onClick={togglePlay}
        />
      </div>
      <div className="bg-white border-t border-gray-200">
        <div className="px-4 pt-3 pb-2">
          <input
            type="range"
            min="0"
            max="100"
            value={duration ? (currentTime / duration) * PERCENT_SCALE : 0}
            onChange={handleSeek}
            className="video-progress-slider w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            aria-label="Seek"
            style={{ touchAction: 'manipulation' }}
          />
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="w-10 h-10 bg-gray-900 hover:bg-gray-800 active:bg-gray-700 text-white rounded-md flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              style={{ touchAction: 'manipulation' }}
            >
              {isPlaying ? (
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="7,4 19,12 7,20" />
                </svg>
              )}
            </button>

            <span className="text-gray-600 text-[13px] font-medium tabular-nums min-w-[80px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="w-9 h-9 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900 rounded-md flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                style={{ touchAction: 'manipulation' }}
              >
                <VolumeIcon isMuted={isMuted} volume={volume} />
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="video-volume-slider w-20 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                aria-label="Volume"
                style={{ touchAction: 'manipulation' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
