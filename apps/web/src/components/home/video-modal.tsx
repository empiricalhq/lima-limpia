'use client';

import { gsap } from 'gsap';
import { useEffect, useRef } from 'react';
import { VideoPlayer } from '@/components/shared/video-player';

const OPEN_ANIMATION_DURATION_S = 0.3;
const CLOSE_ANIMATION_DURATION_S = 0.2;
const AUTOPLAY_DELAY_MS = 400;

interface VideoModalProps {
  onClose: () => void;
}

export function VideoModal({ onClose }: VideoModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const videoPlayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.set(modalRef.current, { scale: 0.8, opacity: 0 });
    gsap.set(backdropRef.current, { opacity: 0 });

    gsap.to(backdropRef.current, { opacity: 1, duration: OPEN_ANIMATION_DURATION_S });
    gsap.to(modalRef.current, {
      scale: 1,
      opacity: 1,
      duration: OPEN_ANIMATION_DURATION_S,
      ease: 'back.out(1.7)',
    });

    const playTimer = setTimeout(() => {
      const video = videoPlayerRef.current?.querySelector('video');
      if (video) {
        video.play().catch(() => {
          // Browsers may block playback until the user interacts.
        });
      }
    }, AUTOPLAY_DELAY_MS);

    return () => clearTimeout(playTimer);
  }, []);

  const closeModal = () => {
    if (modalRef.current && backdropRef.current) {
      gsap.to(modalRef.current, { scale: 0.8, opacity: 0, duration: CLOSE_ANIMATION_DURATION_S });
      gsap.to(backdropRef.current, {
        opacity: 0,
        duration: CLOSE_ANIMATION_DURATION_S,
        onComplete: onClose,
      });
    }
  };

  return (
    <>
      <button
        type="button"
        ref={backdropRef}
        aria-label="Cerrar el video"
        className="fixed inset-0 border-0 bg-black/50 p-0 z-50"
        onClick={closeModal}
      />
      <div ref={modalRef} className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold">Ver el Video</h3>
            <button
              type="button"
              onClick={closeModal}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            >
              ×
            </button>
          </div>
          <div className="p-4">
            <div ref={videoPlayerRef}>
              <VideoPlayer src="https://stream.mux.com/Sc89iWAyNkhJ3P1rQ02nrEdCFTnfT01CZ2KmaEcxXfB008/low.mp4" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
