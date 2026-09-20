'use client';

import Link from 'next/link';
import { useState } from 'react';
import { marketingTheme } from '@/config/marketing';
import { VideoModal } from './video-modal';

export function BlurryHero() {
  const [showVideo, setShowVideo] = useState(false);

  return (
    <section
      aria-labelledby="hero-title"
      className="flex items-center justify-center px-6 py-20 relative"
      style={{
        paddingTop: marketingTheme.layout.navHeight,
        minHeight: 'calc(100vh)',
      }}
    >
      <div className="text-center relative z-10" style={{ maxWidth: marketingTheme.layout.contentMaxWidth }}>
        <h1
          id="hero-title"
          className={`${marketingTheme.title.fontSize} ${marketingTheme.title.fontWeight} ${marketingTheme.title.lineHeight} ${marketingTheme.title.tracking} ${marketingTheme.title.textColor} mb-6`}
        >
          <span className="blur-word">Donde</span> <span className="blur-word">los datos</span>{' '}
          <span className="blur-word">terminan</span>
        </h1>

        <p className="text-[20px] md:text-[24px] text-gray-600 leading-[1.5] mb-12">
          El sistema de residuos de Lima mueve 3.8 millones de toneladas al año. Nadie sabe dónde están los camiones.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/blog/what-we-were-cooking"
            className="inline-block text-[15px] bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            Leer el artículo
          </Link>
          <button
            type="button"
            onClick={() => setShowVideo(true)}
            className="inline-block text-[15px] bg-white text-gray-900 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Ver el video
          </button>
        </div>
      </div>

      {showVideo ? <VideoModal onClose={() => setShowVideo(false)} /> : null}
    </section>
  );
}
