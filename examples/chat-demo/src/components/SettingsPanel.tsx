// SettingsPanel component - Configure LLM settings

import { useState } from 'react';
import type { LLMSettings } from '../types';

interface SettingsPanelProps {
  settings: LLMSettings;
  onSettingsChange: (settings: LLMSettings) => void;
  onResetSettings: () => void;
  disabled?: boolean;
}

export function SettingsPanel({ settings, onSettingsChange, onResetSettings, disabled = false }: SettingsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateSetting = <K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="settings-panel">
      <button
        className="settings-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
      >
        ⚙️ Settings {isExpanded ? '▼' : '▶'}
      </button>

      {isExpanded && (
        <div className="settings-content">
          <div className="setting-group">
            <label htmlFor="temperature">
              Temperature: {settings.temperature?.toFixed(2) ?? '0.70'}
            </label>
            <input
              id="temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature ?? 0.7}
              onChange={(e) => updateSetting('temperature', parseFloat(e.target.value))}
              disabled={disabled}
            />
            <span className="setting-hint">Controls randomness (0 = focused, 2 = creative)</span>
          </div>

          <div className="setting-group">
            <label htmlFor="maxTokens">
              Max Tokens: {settings.maxTokens ?? 'default'}
            </label>
            <input
              id="maxTokens"
              type="number"
              min="1"
              max="100000"
              step="100"
              value={settings.maxTokens ?? ''}
              onChange={(e) => updateSetting('maxTokens', e.target.value ? parseInt(e.target.value) : undefined)}
              disabled={disabled}
              placeholder="Default"
            />
            <span className="setting-hint">Maximum response length</span>
          </div>

          <div className="setting-group">
            <label htmlFor="topP">
              Top P: {settings.topP?.toFixed(2) ?? 'default'}
            </label>
            <input
              id="topP"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.topP ?? 1}
              onChange={(e) => updateSetting('topP', parseFloat(e.target.value))}
              disabled={disabled}
            />
            <span className="setting-hint">Nucleus sampling threshold</span>
          </div>

          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={settings.reasoning?.enabled ?? false}
                onChange={(e) =>
                  updateSetting('reasoning', {
                    enabled: e.target.checked,
                    effort: settings.reasoning?.effort ?? 'medium',
                  })
                }
                disabled={disabled}
              />
              Enable Reasoning
            </label>
            {settings.reasoning?.enabled && (
              <select
                value={settings.reasoning.effort ?? 'medium'}
                onChange={(e) =>
                  updateSetting('reasoning', {
                    enabled: true,
                    effort: e.target.value as 'low' | 'medium' | 'high',
                  })
                }
                disabled={disabled}
                className="effort-select"
              >
                <option value="low">Low Effort</option>
                <option value="medium">Medium Effort</option>
                <option value="high">High Effort</option>
              </select>
            )}
            <span className="setting-hint">Use extended reasoning (Claude 4, Gemini 2.5, o4-mini)</span>
          </div>

          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={settings.thinkingExtraction?.enabled ?? false}
                onChange={(e) =>
                  updateSetting('thinkingExtraction', {
                    enabled: e.target.checked,
                  })
                }
                disabled={disabled}
              />
              Enable Thinking Extraction
            </label>
            <span className="setting-hint">Extract thinking from &lt;thinking&gt; tags</span>
          </div>

          <button
            className="reset-settings"
            onClick={onResetSettings}
            disabled={disabled}
          >
            Reset to Defaults
          </button>
        </div>
      )}
    </div>
  );
}
