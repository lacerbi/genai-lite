import { useEffect } from 'react';
import type { GeneratedImage } from '../types';

interface ImageModalProps {
  image: GeneratedImage | null;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

export function ImageModal({
  image,
  onClose,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false
}: ImageModalProps) {
  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!image) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        onPrevious();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose, onNext, onPrevious, hasNext, hasPrevious]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (image) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [image]);

  if (!image) return null;

  const timeSeconds = (image.generationTime / 1000).toFixed(1);

  return (
    <div className="image-modal-overlay" onClick={onClose}>
      <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
        <button
          className="modal-close-btn"
          onClick={onClose}
          title="Close (ESC)"
          aria-label="Close modal"
        >
          ✕
        </button>

        <img
          src={`data:image/png;base64,${image.data}`}
          alt={`Generated image ${image.index + 1}`}
        />

        <div className="modal-metadata">
          <span><strong>Size:</strong> {image.width}×{image.height}</span>
          {image.seed !== undefined && (
            <span><strong>Seed:</strong> {image.seed}</span>
          )}
          <span><strong>Time:</strong> {timeSeconds}s</span>
        </div>

        {hasPrevious && onPrevious && (
          <button
            className="modal-nav-btn prev"
            onClick={(e) => {
              e.stopPropagation();
              onPrevious();
            }}
            title="Previous image (←)"
            aria-label="Previous image"
          >
            ◀
          </button>
        )}

        {hasNext && onNext && (
          <button
            className="modal-nav-btn next"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            title="Next image (→)"
            aria-label="Next image"
          >
            ▶
          </button>
        )}
      </div>
    </div>
  );
}
