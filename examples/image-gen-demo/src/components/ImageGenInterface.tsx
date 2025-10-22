import React, { useState } from 'react';
import { ProviderSelector } from './ProviderSelector';
import { PromptInput } from './PromptInput';
import { SettingsPanel } from './SettingsPanel';
import { ImageGallery } from './ImageGallery';
import { ProgressDisplay } from './ProgressDisplay';
import { ErrorDisplay } from './ErrorDisplay';
import { generateImage } from '../api/client';
import type { ImageSettings, GeneratedImage } from '../types';

export function ImageGenInterface() {
  // Provider & Model
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');

  // Prompt
  const [prompt, setPrompt] = useState('');

  // Settings
  const [settings, setSettings] = useState<ImageSettings>({
    width: 1024,
    height: 1024,
    quality: 'auto',
    style: 'vivid',
    openai: {
      outputFormat: 'png',
      background: 'auto'
    },
    diffusion: {
      steps: 20,
      cfgScale: 7.5,
      sampler: 'dpm++2m'
    }
  });
  const [count, setCount] = useState(1);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [startTime, setStartTime] = useState(0);

  // Images & Errors
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<{ message: string; code?: string; type?: string } | null>(null);

  // Get max prompt length based on provider/model
  const getMaxPromptLength = (): number => {
    if (modelId.includes('gpt-image')) return 32000;
    if (modelId.includes('dall-e-3')) return 4000;
    if (modelId.includes('dall-e-2')) return 1000;
    return 32000; // Default
  };

  const handleGenerate = async () => {
    // Validation
    if (!prompt.trim()) {
      setError({ message: 'Please enter a prompt', code: 'VALIDATION_ERROR' });
      return;
    }

    if (!providerId || !modelId) {
      setError({ message: 'Please select a provider and model', code: 'VALIDATION_ERROR' });
      return;
    }

    // Clear previous error
    setError(null);
    setIsGenerating(true);
    setProgress(0);
    setStartTime(Date.now());

    try {
      const response = await generateImage({
        providerId,
        modelId,
        prompt,
        count,
        settings
      });

      if (response.success && response.result) {
        // Add generated images to gallery
        const newImages: GeneratedImage[] = response.result.images.map(img => ({
          ...img,
          generatedAt: Date.now()
        }));

        setImages(prev => [...prev, ...newImages]);
        setProgress(100);
      } else if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Failed to generate image',
        code: 'NETWORK_ERROR'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (index: number) => {
    // Download handled in ImageCard
    console.log('Downloaded image', index);
  };

  const handleDelete = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all generated images?')) {
      setImages([]);
    }
  };

  const handleDismissError = () => {
    setError(null);
  };

  const elapsed = isGenerating ? Date.now() - startTime : 0;

  return (
    <div className="container">
      <div className="header">
        <h1>🎨 Image Generation Demo</h1>
        <p>Generate AI images using OpenAI Images or local diffusion models</p>
      </div>

      <ErrorDisplay error={error} onDismiss={handleDismissError} />

      <ProviderSelector
        selectedProviderId={providerId}
        selectedModelId={modelId}
        onProviderChange={setProviderId}
        onModelChange={setModelId}
      />

      <PromptInput
        value={prompt}
        onChange={setPrompt}
        maxLength={getMaxPromptLength()}
        disabled={isGenerating}
      />

      <SettingsPanel
        providerId={providerId}
        settings={settings}
        count={count}
        onSettingsChange={setSettings}
        onCountChange={setCount}
      />

      <div style={{ marginBottom: '20px' }}>
        <button
          className="btn-primary"
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim() || !providerId || !modelId}
          style={{ marginRight: '10px' }}
        >
          {isGenerating ? (
            <>
              <span className="loading-spinner" style={{ marginRight: '8px' }} />
              Generating...
            </>
          ) : (
            'Generate Image'
          )}
        </button>
        {isGenerating && (
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Generating {count} image{count > 1 ? 's' : ''}...
          </span>
        )}
      </div>

      <ProgressDisplay
        isGenerating={isGenerating}
        stage="loading"
        percentage={progress}
        elapsed={elapsed}
      />

      <ImageGallery
        images={images}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onClearAll={handleClearAll}
      />
    </div>
  );
}
