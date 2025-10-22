import React from 'react';
import type { SettingsPanelProps } from '../types';

export function SettingsPanel({
  providerId,
  settings,
  count,
  onSettingsChange,
  onCountChange
}: SettingsPanelProps) {
  const isOpenAI = providerId === 'openai-images';
  const isDiffusion = providerId === 'genai-electron-images';

  const updateSetting = <K extends keyof typeof settings>(
    key: K,
    value: typeof settings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const updateOpenAISetting = (key: string, value: any) => {
    onSettingsChange({
      ...settings,
      openai: { ...settings.openai, [key]: value }
    });
  };

  const updateDiffusionSetting = (key: string, value: any) => {
    onSettingsChange({
      ...settings,
      diffusion: { ...settings.diffusion, [key]: value }
    });
  };

  return (
    <div className="settings-panel">
      {/* Universal Settings */}
      <div className="settings-section">
        <h3>Dimensions</h3>
        <div className="settings-row">
          <div className="setting-field">
            <label htmlFor="width">Width</label>
            <input
              type="number"
              id="width"
              value={settings.width || 1024}
              onChange={(e) => updateSetting('width', parseInt(e.target.value))}
              min={64}
              max={2048}
              step={64}
            />
          </div>
          <div className="setting-field">
            <label htmlFor="height">Height</label>
            <input
              type="number"
              id="height"
              value={settings.height || 1024}
              onChange={(e) => updateSetting('height', parseInt(e.target.value))}
              min={64}
              max={2048}
              step={64}
            />
          </div>
        </div>
      </div>

      {/* Batch Generation */}
      <div className="settings-section">
        <h3>Batch Generation</h3>
        <div className="setting-field">
          <label htmlFor="count">
            Number of images: {count}
          </label>
          <input
            type="range"
            id="count"
            value={count}
            onChange={(e) => onCountChange(parseInt(e.target.value))}
            min={1}
            max={4}
            step={1}
          />
          <div className="slider-value">{count} image{count > 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* OpenAI-specific Settings */}
      {isOpenAI && (
        <>
          <div className="settings-section">
            <h3>OpenAI Settings</h3>
            <div className="settings-row">
              <div className="setting-field">
                <label htmlFor="quality">Quality</label>
                <select
                  id="quality"
                  value={settings.quality || 'auto'}
                  onChange={(e) => updateSetting('quality', e.target.value as any)}
                >
                  <option value="auto">Auto</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="hd">HD</option>
                  <option value="standard">Standard</option>
                </select>
              </div>
              <div className="setting-field">
                <label htmlFor="style">Style</label>
                <select
                  id="style"
                  value={settings.style || 'vivid'}
                  onChange={(e) => updateSetting('style', e.target.value as any)}
                >
                  <option value="vivid">Vivid</option>
                  <option value="natural">Natural</option>
                </select>
              </div>
            </div>
            <div className="settings-row">
              <div className="setting-field">
                <label htmlFor="outputFormat">Output Format</label>
                <select
                  id="outputFormat"
                  value={settings.openai?.outputFormat || 'png'}
                  onChange={(e) => updateOpenAISetting('outputFormat', e.target.value)}
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>
              <div className="setting-field">
                <label htmlFor="background">Background</label>
                <select
                  id="background"
                  value={settings.openai?.background || 'auto'}
                  onChange={(e) => updateOpenAISetting('background', e.target.value)}
                >
                  <option value="auto">Auto</option>
                  <option value="transparent">Transparent</option>
                  <option value="white">White</option>
                  <option value="black">Black</option>
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Diffusion-specific Settings */}
      {isDiffusion && (
        <>
          <div className="settings-section">
            <h3>Diffusion Settings</h3>
            <div className="setting-field">
              <label htmlFor="negativePrompt">Negative Prompt</label>
              <textarea
                id="negativePrompt"
                className="negative-prompt"
                value={settings.diffusion?.negativePrompt || ''}
                onChange={(e) => updateDiffusionSetting('negativePrompt', e.target.value)}
                placeholder="Things to avoid in the image (e.g., 'blurry, low quality, distorted')"
              />
            </div>
            <div className="settings-row">
              <div className="setting-field">
                <label htmlFor="steps">
                  Steps: {settings.diffusion?.steps || 20}
                </label>
                <input
                  type="range"
                  id="steps"
                  value={settings.diffusion?.steps || 20}
                  onChange={(e) => updateDiffusionSetting('steps', parseInt(e.target.value))}
                  min={1}
                  max={150}
                  step={1}
                />
                <div className="slider-value">{settings.diffusion?.steps || 20} steps</div>
              </div>
              <div className="setting-field">
                <label htmlFor="cfgScale">
                  CFG Scale: {settings.diffusion?.cfgScale || 7.5}
                </label>
                <input
                  type="range"
                  id="cfgScale"
                  value={settings.diffusion?.cfgScale || 7.5}
                  onChange={(e) => updateDiffusionSetting('cfgScale', parseFloat(e.target.value))}
                  min={1}
                  max={30}
                  step={0.5}
                />
                <div className="slider-value">{settings.diffusion?.cfgScale || 7.5}</div>
              </div>
            </div>
            <div className="settings-row">
              <div className="setting-field">
                <label htmlFor="sampler">Sampler</label>
                <select
                  id="sampler"
                  value={settings.diffusion?.sampler || 'dpm++2m'}
                  onChange={(e) => updateDiffusionSetting('sampler', e.target.value)}
                >
                  <option value="euler_a">Euler A</option>
                  <option value="euler">Euler</option>
                  <option value="heun">Heun</option>
                  <option value="dpm2">DPM2</option>
                  <option value="dpm++2s_a">DPM++ 2S A</option>
                  <option value="dpm++2m">DPM++ 2M</option>
                  <option value="dpm++2mv2">DPM++ 2M V2</option>
                  <option value="lcm">LCM</option>
                </select>
              </div>
              <div className="setting-field">
                <label htmlFor="seed">Seed (optional)</label>
                <input
                  type="number"
                  id="seed"
                  value={settings.diffusion?.seed || ''}
                  onChange={(e) => updateDiffusionSetting('seed', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="Random"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
