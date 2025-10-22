import React from 'react';
import type { ProgressDisplayProps } from '../types';

export function ProgressDisplay({
  isGenerating,
  stage = 'loading',
  percentage = 0,
  currentStep = 0,
  totalSteps = 0,
  elapsed = 0
}: ProgressDisplayProps) {
  if (!isGenerating) return null;

  const stageNames = {
    loading: 'Preparing',
    diffusion: 'Generating',
    decoding: 'Finalizing'
  };

  const elapsedSeconds = (elapsed / 1000).toFixed(1);

  return (
    <div className="progress-display">
      <div className="progress-header">
        <span className="progress-stage">{stageNames[stage]}</span>
        <span className="progress-time">{elapsedSeconds}s elapsed</span>
      </div>

      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>

      <div className="progress-footer">
        {totalSteps > 0 ? (
          <span>Step {currentStep}/{totalSteps}</span>
        ) : (
          <span>Processing...</span>
        )}
        <span>{percentage.toFixed(1)}%</span>
      </div>
    </div>
  );
}
