// SettingsPanel component - Configure LLM settings (Sidebar version)

import { useState, useEffect } from 'react';
import type { LLMSettings, UserVariables, AutomaticVariables, StructuredOutputSchema } from '../types';

// Default schema for structured output
const DEFAULT_SCHEMA: StructuredOutputSchema = {
  type: "object",
  properties: {
    answer: { type: "string", description: "The main response" },
    confidence: { type: "number", description: "Confidence level 0-1" },
    sources: {
      type: "array",
      items: { type: "string" },
      description: "Referenced sources if any"
    }
  },
  required: ["answer"]
};

// Preset schemas for quick selection
const PRESET_SCHEMAS: Record<string, StructuredOutputSchema> = {
  person: {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "integer" },
      email: { type: "string" }
    },
    required: ["name"]
  },
  list: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" }
          },
          required: ["title"]
        }
      }
    },
    required: ["items"]
  },
  analysis: {
    type: "object",
    properties: {
      summary: { type: "string" },
      keyPoints: { type: "array", items: { type: "string" } },
      sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
      score: { type: "number" }
    },
    required: ["summary", "keyPoints"]
  }
};

interface SettingsPanelProps {
  settings: LLMSettings;
  onSettingsChange: (settings: LLMSettings) => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  onResetSettings: () => void;
  disabled?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  userVariables: UserVariables;
  onUserVariablesChange: (variables: UserVariables) => void;
  automaticVariables: AutomaticVariables;
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  systemPrompt,
  onSystemPromptChange,
  onResetSettings,
  disabled = false,
  isExpanded,
  onToggle,
  userVariables,
  onUserVariablesChange,
  automaticVariables
}: SettingsPanelProps) {

  const [newVarKey, setNewVarKey] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaText, setSchemaText] = useState(() =>
    settings.structuredOutput?.schema
      ? JSON.stringify(settings.structuredOutput.schema, null, 2)
      : JSON.stringify(DEFAULT_SCHEMA, null, 2)
  );

  // Sync schemaText when settings.structuredOutput.schema changes externally
  // (e.g., loaded from localStorage or reset to defaults)
  useEffect(() => {
    const currentSchemaStr = settings.structuredOutput?.schema
      ? JSON.stringify(settings.structuredOutput.schema, null, 2)
      : JSON.stringify(DEFAULT_SCHEMA, null, 2);

    // Only update if the schema actually changed (avoid cursor jumping)
    try {
      const currentParsed = JSON.parse(schemaText);
      const settingsParsed = settings.structuredOutput?.schema ?? DEFAULT_SCHEMA;
      if (JSON.stringify(currentParsed) !== JSON.stringify(settingsParsed)) {
        setSchemaText(currentSchemaStr);
        setSchemaError(null);
      }
    } catch {
      // If current schemaText is invalid JSON, sync it
      setSchemaText(currentSchemaStr);
      setSchemaError(null);
    }
  }, [settings.structuredOutput?.schema]);

  const updateSetting = <K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const loadPresetSchema = (presetName: keyof typeof PRESET_SCHEMAS) => {
    const schema = PRESET_SCHEMAS[presetName];
    setSchemaText(JSON.stringify(schema, null, 2));
    setSchemaError(null);
    updateSetting('structuredOutput', {
      ...settings.structuredOutput!,
      schema
    });
  };

  const handleSchemaChange = (text: string) => {
    setSchemaText(text);
    try {
      const parsed = JSON.parse(text);
      setSchemaError(null);
      updateSetting('structuredOutput', {
        ...settings.structuredOutput!,
        schema: parsed
      });
    } catch {
      setSchemaError('Invalid JSON');
    }
  };

  const handleAddVariable = () => {
    if (!newVarKey.trim()) return;

    // Validate variable name (alphanumeric + underscore only)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newVarKey.trim())) {
      alert('Variable name must start with a letter or underscore and contain only letters, numbers, and underscores.');
      return;
    }

    onUserVariablesChange({
      ...userVariables,
      [newVarKey.trim()]: newVarValue
    });
    setNewVarKey('');
    setNewVarValue('');
  };

  const handleDeleteVariable = (key: string) => {
    const updated = { ...userVariables };
    delete updated[key];
    onUserVariablesChange(updated);
  };

  const handleUpdateVariable = (key: string, value: string) => {
    onUserVariablesChange({
      ...userVariables,
      [key]: value
    });
  };

  return (
    <div className={`settings-sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button
        className="sidebar-toggle"
        onClick={onToggle}
        disabled={disabled}
        title={isExpanded ? 'Collapse settings' : 'Expand settings'}
      >
        {isExpanded ? '◀' : '▶'}
      </button>

      {isExpanded && (
        <div className="sidebar-content">
          <h3 className="sidebar-title">Settings</h3>

          <div className="setting-group">
            <label htmlFor="systemPrompt">
              System Prompt
            </label>
            <textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={3}
              disabled={disabled}
              className="system-prompt-textarea"
            />
            <span className="setting-hint">Instructions for the AI's behavior and personality</span>
          </div>

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
                onChange={(e) => {
                  if (e.target.checked) {
                    updateSetting('reasoning', {
                      enabled: true,
                      effort: settings.reasoning?.effort ?? 'medium',
                    });
                  } else {
                    // When disabling, only set enabled: false (no effort)
                    updateSetting('reasoning', { enabled: false });
                  }
                }}
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
                checked={settings.thinkingTagFallback?.enabled ?? true}
                onChange={(e) =>
                  updateSetting('thinkingTagFallback', {
                    enabled: e.target.checked,
                    enforce: e.target.checked ? (settings.thinkingTagFallback?.enforce ?? false) : false,
                  })
                }
                disabled={disabled}
              />
              Enable Thinking Tag Extraction
            </label>
            <span className="setting-hint">Extract reasoning from &lt;thinking&gt; tags for models without native reasoning</span>

            {settings.thinkingTagFallback?.enabled && (
              <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.thinkingTagFallback?.enforce ?? false}
                    onChange={(e) =>
                      updateSetting('thinkingTagFallback', {
                        enabled: true,
                        enforce: e.target.checked,
                      })
                    }
                    disabled={disabled}
                  />
                  Require Thinking Tags
                </label>
                <span className="setting-hint">Enforce thinking tags when native reasoning is not active</span>
              </div>
            )}
          </div>

          {/* Structured Output Section */}
          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={settings.structuredOutput?.enabled ?? false}
                onChange={(e) => {
                  if (e.target.checked) {
                    updateSetting('structuredOutput', {
                      enabled: true,
                      name: 'response_schema',
                      schema: DEFAULT_SCHEMA,
                      strict: true
                    });
                    setSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
                    setSchemaError(null);
                  } else {
                    updateSetting('structuredOutput', undefined);
                  }
                }}
                disabled={disabled}
              />
              Enable Structured Output (JSON)
            </label>
            <span className="setting-hint">
              Constrain response to JSON schema (GPT-4.1+, Gemini 2.5, Mistral, llama.cpp)
            </span>

            {settings.structuredOutput?.enabled && (
              <div className="structured-output-config">
                <div className="setting-subgroup">
                  <label htmlFor="schemaName">Schema Name</label>
                  <input
                    id="schemaName"
                    type="text"
                    value={settings.structuredOutput.name}
                    onChange={(e) => updateSetting('structuredOutput', {
                      ...settings.structuredOutput!,
                      name: e.target.value
                    })}
                    disabled={disabled}
                    placeholder="response_schema"
                    className="schema-name-input"
                  />
                </div>

                <div className="setting-subgroup">
                  <label htmlFor="schemaEditor">JSON Schema</label>
                  <textarea
                    id="schemaEditor"
                    value={schemaText}
                    onChange={(e) => handleSchemaChange(e.target.value)}
                    disabled={disabled}
                    rows={8}
                    className={`schema-textarea ${schemaError ? 'error' : ''}`}
                  />
                  {schemaError && <span className="schema-error-text">{schemaError}</span>}
                </div>

                <div className="schema-presets">
                  <span>Quick schemas:</span>
                  <button type="button" onClick={() => loadPresetSchema('person')} disabled={disabled}>Person</button>
                  <button type="button" onClick={() => loadPresetSchema('list')} disabled={disabled}>List</button>
                  <button type="button" onClick={() => loadPresetSchema('analysis')} disabled={disabled}>Analysis</button>
                </div>

                <label>
                  <input
                    type="checkbox"
                    checked={settings.structuredOutput.strict !== false}
                    onChange={(e) => updateSetting('structuredOutput', {
                      ...settings.structuredOutput!,
                      strict: e.target.checked
                    })}
                    disabled={disabled}
                  />
                  Strict Mode
                </label>
                <span className="setting-hint">
                  Enforce exact schema match (recommended)
                </span>
              </div>
            )}
          </div>

          {/* Variables Section */}
          <div className="variables-section">
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: 'var(--text)' }}>Variables</h4>
            <span className="setting-hint" style={{ marginBottom: '0.75rem', display: 'block' }}>
              Use {'{{variableName}}'} in messages and system prompt
            </span>

            {/* Automatic Variables */}
            <div className="variables-subsection">
              <div className="variables-subsection-title">Automatic (computed)</div>
              <span className="setting-hint" style={{ fontSize: '0.8rem', display: 'block', marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
                Based on model capabilities and settings above
              </span>
              <div className="variable-list">
                {Object.keys(automaticVariables).length === 0 ? (
                  <div className="variables-empty">No automatic variables available</div>
                ) : (
                  Object.entries(automaticVariables).map(([key, value]) => (
                    <div key={key} className="variable-item variable-item-readonly">
                      <div className="variable-item-header">
                        <span className="variable-icon">🔒</span>
                        <span className="variable-key">{key}</span>
                      </div>
                      <div className="variable-value">{String(value)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Custom Variables */}
            <div className="variables-subsection">
              <div className="variables-subsection-title">Custom</div>
              <div className="variable-list">
                {Object.keys(userVariables).length === 0 ? (
                  <div className="variables-empty">No custom variables defined</div>
                ) : (
                  Object.entries(userVariables).map(([key, value]) => (
                    <div key={key} className="variable-item variable-item-editable">
                      <div className="variable-key">{key}</div>
                      <input
                        type="text"
                        className="variable-value-input"
                        value={value}
                        onChange={(e) => handleUpdateVariable(key, e.target.value)}
                        disabled={disabled}
                        placeholder="Value"
                      />
                      <div className="variable-actions">
                        <button
                          className="variable-delete-btn"
                          onClick={() => handleDeleteVariable(key)}
                          disabled={disabled}
                          title="Delete variable"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add Variable Form */}
              <div className="add-variable-form">
                <div className="add-variable-inputs">
                  <input
                    type="text"
                    className="add-variable-input"
                    placeholder="Variable name"
                    value={newVarKey}
                    onChange={(e) => setNewVarKey(e.target.value)}
                    disabled={disabled}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddVariable();
                      }
                    }}
                  />
                  <input
                    type="text"
                    className="add-variable-input"
                    placeholder="Value"
                    value={newVarValue}
                    onChange={(e) => setNewVarValue(e.target.value)}
                    disabled={disabled}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddVariable();
                      }
                    }}
                  />
                </div>
                <button
                  className="add-variable-btn"
                  onClick={handleAddVariable}
                  disabled={disabled || !newVarKey.trim()}
                >
                  Add Variable
                </button>
              </div>
            </div>
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
