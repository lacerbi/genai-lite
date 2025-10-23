import React from 'react';
import type { PromptInputProps } from '../types';

const EXAMPLE_PROMPTS = [
  {
    category: 'Photorealistic',
    prompt: 'A professional photograph of a mountain lake at golden hour, crystal clear water reflecting snow-capped peaks, 8k resolution'
  },
  {
    category: 'Artistic',
    prompt: 'An oil painting of a bustling medieval marketplace, warm colors, impressionist style, Van Gogh inspired'
  },
  {
    category: 'Fantasy',
    prompt: 'A majestic dragon perched on a mountain peak, detailed scales, dramatic sunset lighting, epic fantasy art'
  },
  {
    category: 'Nature',
    prompt: 'A dense rainforest with morning mist and sun rays piercing through the canopy, vibrant tropical colors'
  },
  {
    category: 'Abstract',
    prompt: 'Abstract geometric shapes in vibrant neon colors, modern art, bold contrasts, digital art style'
  },
  {
    category: 'Product',
    prompt: 'Product photography of a smartwatch on a marble surface, studio lighting, minimalist, commercial advertisement style'
  }
];

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

  const handleExampleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedPrompt = e.target.value;
    if (selectedPrompt) {
      onChange(selectedPrompt);
      // Reset dropdown to default
      e.target.value = '';
    }
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
        <div className="prompt-actions">
          <select
            className="example-prompt-select"
            onChange={handleExampleSelect}
            disabled={disabled}
            defaultValue=""
          >
            <option value="" disabled>Try an example...</option>
            {EXAMPLE_PROMPTS.map((example, index) => (
              <option key={index} value={example.prompt}>
                {example.category}
              </option>
            ))}
          </select>
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
