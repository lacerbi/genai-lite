import React from 'react';
import type { PromptInputProps } from '../types';

export function PromptInput({
  value,
  onChange,
  maxLength = 32000,
  disabled = false
}: PromptInputProps) {
  const charCount = value.length;
  const isNearLimit = charCount > maxLength * 0.9;
  const isOverLimit = charCount > maxLength;

  const handleClear = () => {
    onChange('');
  };

  const charCountClass = `char-count ${isOverLimit ? 'error' : isNearLimit ? 'warning' : ''}`;

  return (
    <div className="prompt-input">
      <label htmlFor="prompt">Prompt</label>
      <textarea
        id="prompt"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe the image you want to generate... (e.g., 'A serene mountain lake at sunrise, photorealistic')"
        disabled={disabled}
      />
      <div className="prompt-footer">
        <span className={charCountClass}>
          {charCount.toLocaleString()}/{maxLength.toLocaleString()} characters
        </span>
        <div>
          {value.length > 0 && (
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={handleClear}
              disabled={disabled}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
