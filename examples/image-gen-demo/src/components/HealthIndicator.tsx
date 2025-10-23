import React from 'react';
import type { HealthStatus } from '../types';

interface HealthIndicatorProps {
  health: HealthStatus | null;
  isLoading: boolean;
  onTest: () => void;
}

export function HealthIndicator({ health, isLoading, onTest }: HealthIndicatorProps) {
  const getStatusInfo = () => {
    if (isLoading) {
      return { color: '#f59e0b', text: 'Checking...' };
    }
    if (!health) {
      return { color: '#6b7280', text: 'Unknown' };
    }
    if (health.status === 'error') {
      return { color: '#ef4444', text: `Not connected (${health.error || 'Server not reachable'})` };
    }
    if (health.busy) {
      return { color: '#f59e0b', text: 'Connected (busy)' };
    }
    return { color: '#10b981', text: 'Connected (ready)' };
  };

  const { color, text } = getStatusInfo();

  return (
    <div className="health-indicator">
      <div className="health-status">
        <span
          className="status-dot"
          style={{ backgroundColor: color }}
        />
        <span className="status-text">{text}</span>
      </div>
      <button
        className="btn-small btn-secondary"
        onClick={onTest}
        disabled={isLoading}
      >
        Test Connection
      </button>
    </div>
  );
}
