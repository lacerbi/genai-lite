import React, { useEffect, useRef } from 'react';
import { ImageCard } from './ImageCard';
import type { ImageGalleryProps } from '../types';

export function ImageGallery({ images, onDownload, onDelete, onClearAll }: ImageGalleryProps) {
  const galleryRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest image when new ones are added
  useEffect(() => {
    if (galleryRef.current && images.length > 0) {
      galleryRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [images.length]);

  if (images.length === 0) {
    return (
      <div className="image-gallery">
        <div className="gallery-empty">
          <div className="gallery-empty-icon">🖼️</div>
          <p>No images generated yet</p>
          <p style={{ fontSize: '14px', marginTop: '8px', color: 'var(--text-secondary)' }}>
            Enter a prompt and click "Generate Image" to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="image-gallery" ref={galleryRef}>
      <div className="gallery-header">
        <h2>Generated Images ({images.length})</h2>
        <button className="btn-secondary btn-small" onClick={onClearAll}>
          Clear All
        </button>
      </div>

      <div className="gallery-grid">
        {images.map((image, index) => (
          <ImageCard
            key={`${image.generatedAt}-${image.index}`}
            image={image}
            onDownload={() => onDownload(index)}
            onDelete={() => onDelete(index)}
          />
        ))}
      </div>
    </div>
  );
}
