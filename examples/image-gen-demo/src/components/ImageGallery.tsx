import React, { useEffect, useRef, useState } from 'react';
import { ImageCard } from './ImageCard';
import { ImageModal } from './ImageModal';
import type { ImageGalleryProps } from '../types';

export function ImageGallery({ images, onDownload, onDelete, onClearAll }: ImageGalleryProps) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  // Auto-scroll to latest image when new ones are added
  useEffect(() => {
    if (galleryRef.current && images.length > 0) {
      galleryRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [images.length]);

  // Modal handlers
  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
  };

  const handleCloseModal = () => {
    setSelectedImageIndex(null);
  };

  const handleNextImage = () => {
    if (selectedImageIndex !== null && selectedImageIndex < images.length - 1) {
      setSelectedImageIndex(selectedImageIndex + 1);
    }
  };

  const handlePreviousImage = () => {
    if (selectedImageIndex !== null && selectedImageIndex > 0) {
      setSelectedImageIndex(selectedImageIndex - 1);
    }
  };

  const selectedImage = selectedImageIndex !== null ? images[selectedImageIndex] : null;

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
            onImageClick={() => handleImageClick(index)}
          />
        ))}
      </div>

      <ImageModal
        image={selectedImage}
        onClose={handleCloseModal}
        onNext={handleNextImage}
        onPrevious={handlePreviousImage}
        hasNext={selectedImageIndex !== null && selectedImageIndex < images.length - 1}
        hasPrevious={selectedImageIndex !== null && selectedImageIndex > 0}
      />
    </div>
  );
}
