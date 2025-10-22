import React from 'react';
import type { ErrorDisplayProps } from '../types';

export function ErrorDisplay({ error, onDismiss }: ErrorDisplayProps) {
  if (!error) return null;

  return (
    <div className="error-display">
      <div className="error-icon">⚠️</div>
      <div className="error-content">
        <div className="error-title">Error</div>
        <div className="error-message">{error.message}</div>
        {error.code && (
          <div className="error-message" style={{ fontSize: '12px', marginTop: '4px' }}>
            Code: {error.code}
          </div>
        )}
      </div>
      <button className="error-dismiss" onClick={onDismiss} aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
}
