import React from 'react';
import type { ImageCardProps } from '../types';

export function ImageCard({ image, onDownload, onDelete }: ImageCardProps) {
  const timeTaken = Date.now() - image.generatedAt;
  const timeSeconds = (timeTaken / 1000).toFixed(1);

  const handleDownload = () => {
    // Create a download link
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${image.data}`;
    link.download = `generated-image-${image.index}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onDownload();
  };

  return (
    <div className="image-card">
      <img
        src={`data:image/png;base64,${image.data}`}
        alt={`Generated image ${image.index + 1}`}
        loading="lazy"
      />

      <div className="image-actions">
        <button onClick={handleDownload} title="Download image" aria-label="Download">
          ⬇️
        </button>
        <button onClick={onDelete} title="Delete image" aria-label="Delete">
          🗑️
        </button>
      </div>

      <div className="image-metadata">
        <span><strong>Size:</strong> {image.width}×{image.height}</span>
        {image.seed !== undefined && (
          <span><strong>Seed:</strong> {image.seed}</span>
        )}
        <span><strong>Time:</strong> {timeSeconds}s</span>
      </div>
    </div>
  );
}
