// ChatInterface component - Main chat interface that orchestrates all components

import { useState, useEffect } from 'react';
import { ProviderSelector } from './ProviderSelector';
import { SettingsPanel } from './SettingsPanel';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TemplateExamples } from './TemplateExamples';
import { LlamaCppTools } from './LlamaCppTools';
import { getProviders, getModels, sendChatMessage, getPresets } from '../api/client';
import type { Message, Provider, Model, LLMSettings, Preset } from '../types';

// localStorage key for persisted settings
const STORAGE_KEY = 'genai-lite-chat-demo-settings';

// Default settings
const DEFAULT_SETTINGS: LLMSettings = {
  temperature: 0.7,
  maxTokens: undefined,
  topP: 1,
  reasoning: { enabled: false },
  thinkingExtraction: { enabled: false },
};

// Format messages as Markdown
function formatMessagesAsMarkdown(messages: Message[]): string {
  return messages
    .map((msg) => {
      const timestamp = new Date(msg.timestamp).toLocaleString();
      let content = `## ${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}\n*${timestamp}*\n\n${msg.content}`;
      if (msg.reasoning) {
        content += `\n\n### Reasoning\n${msg.reasoning}`;
      }
      return content;
    })
    .join('\n\n---\n\n');
}

// Download JSON file
function downloadJSON(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Copy text to clipboard
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

// Enhance error messages with actionable hints
function enhanceErrorMessage(error: any, context?: { providerId?: string; modelId?: string }): string {
  const errorStr = error instanceof Error ? error.message : String(error);

  // Network errors
  if (errorStr.includes('fetch') || errorStr.includes('Network') || errorStr.includes('Failed to fetch')) {
    return 'Network error: Cannot connect to the backend server. Make sure the server is running with `npm run dev`.';
  }

  // HTTP errors
  if (errorStr.includes('HTTP 404')) {
    return 'Backend endpoint not found. The server may not be running or the API routes are misconfigured.';
  }

  if (errorStr.includes('HTTP 500')) {
    return 'Server error: The backend encountered an internal error. Check the server console for details.';
  }

  // API key errors
  if (errorStr.includes('API key') || errorStr.includes('authentication') || errorStr.includes('AUTHENTICATION_ERROR')) {
    const provider = context?.providerId || 'this provider';
    return `Missing or invalid API key for ${provider}. Add your API key to the .env file (e.g., ${provider.toUpperCase()}_API_KEY=your-key-here) and restart the server.`;
  }

  // Rate limit errors
  if (errorStr.includes('rate limit') || errorStr.includes('RATE_LIMIT_ERROR')) {
    return 'Rate limit exceeded: You\'ve made too many requests. Wait a few moments before trying again, or consider using llama.cpp for unlimited local inference.';
  }

  // llama.cpp specific errors
  if (errorStr.includes('llamacpp') || errorStr.includes('llama.cpp') || context?.providerId === 'llamacpp') {
    if (errorStr.includes('ECONNREFUSED') || errorStr.includes('connect')) {
      return 'llama.cpp server not running. Start it with: `llama-server -m /path/to/model.gguf --port 8080`';
    }
  }

  // Validation errors
  if (errorStr.includes('VALIDATION_ERROR') || errorStr.includes('Invalid')) {
    return `Validation error: ${errorStr}. Check that all required fields are filled correctly.`;
  }

  // Model not found
  if (errorStr.includes('model') && errorStr.includes('not found')) {
    const model = context?.modelId || 'the selected model';
    return `Model "${model}" not found or not supported. Try selecting a different model.`;
  }

  // Generic error with original message
  return `Error: ${errorStr}`;
}

// Load settings from localStorage
function loadPersistedSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to load persisted settings:', error);
  }
  return null;
}

// Save settings to localStorage
function savePersistedSettings(data: any) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save settings:', error);
  }
}

export function ChatInterface() {
  // Load persisted settings or use defaults
  const persisted = loadPersistedSettings();

  // State for providers and models
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState(persisted?.providerId || '');
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(persisted?.modelId || '');

  // State for chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for system prompt
  const [systemPrompt, setSystemPrompt] = useState<string>(persisted?.systemPrompt || '');

  // State for settings
  const [settings, setSettings] = useState<LLMSettings>(
    persisted?.settings || DEFAULT_SETTINGS
  );

  // State for presets and advanced features
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(persisted?.presetId || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedTab, setAdvancedTab] = useState<'templates' | 'llamacpp'>('templates');

  // Load providers and presets on mount
  useEffect(() => {
    loadProviders();
    loadPresets();
  }, []);

  // Load models when provider changes
  useEffect(() => {
    if (selectedProviderId) {
      loadModels(selectedProviderId);
    } else {
      setModels([]);
      setSelectedModelId('');
    }
  }, [selectedProviderId]);

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    savePersistedSettings({
      providerId: selectedProviderId,
      modelId: selectedModelId,
      presetId: selectedPresetId,
      systemPrompt,
      settings,
    });
  }, [selectedProviderId, selectedModelId, selectedPresetId, systemPrompt, settings]);

  const loadProviders = async () => {
    try {
      const response = await getProviders();
      setProviders(response.providers);

      // Auto-select first available provider only if no persisted provider
      if (!persisted?.providerId) {
        const firstAvailable = response.providers.find((p) => p.available);
        if (firstAvailable) {
          setSelectedProviderId(firstAvailable.id);
        }
      }
    } catch (err) {
      setError(enhanceErrorMessage(err));
    }
  };

  const loadModels = async (providerId: string) => {
    try {
      setError(null);
      const response = await getModels(providerId);
      setModels(response.models);

      // Auto-select first model only if no persisted model
      if (!persisted?.modelId && response.models.length > 0) {
        setSelectedModelId(response.models[0].id);
      }
    } catch (err) {
      setError(enhanceErrorMessage(err, { providerId }));
      setModels([]);
      setSelectedModelId('');
    }
  };

  const loadPresets = async () => {
    try {
      const response = await getPresets();
      setPresets(response.presets);
    } catch (err) {
      console.error('Failed to load presets:', err);
      // Don't show error to user, presets are optional
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedProviderId || !selectedModelId) {
      setError('Please select a provider and model first');
      return;
    }

    // Add user message to the list
    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      // Prepare messages for API (exclude reasoning field)
      const conversationMessages = messages
        .concat(userMessage)
        .map((m) => ({ role: m.role, content: m.content }));

      // Prepend system message if system prompt is set
      const apiMessages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...conversationMessages]
        : conversationMessages;

      // Send to backend
      const response = await sendChatMessage({
        providerId: selectedProviderId,
        modelId: selectedModelId,
        messages: apiMessages,
        settings,
      });

      if (response.success && response.response) {
        // Add assistant message
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.response.content,
          reasoning: response.response.reasoning,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else if (response.error) {
        setError(enhanceErrorMessage(response.error.message, { providerId: selectedProviderId, modelId: selectedModelId }));
      }
    } catch (err) {
      setError(enhanceErrorMessage(err, { providerId: selectedProviderId, modelId: selectedModelId }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
  };

  const handleResetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    setSelectedPresetId('');
    setSystemPrompt('');
  };

  const handleExportJSON = () => {
    if (messages.length === 0) {
      setError('No messages to export');
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      provider: selectedProviderId,
      model: selectedModelId,
      systemPrompt,
      settings,
      messages,
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadJSON(exportData, `chat-export-${timestamp}.json`);
  };

  const handleCopyMarkdown = async () => {
    if (messages.length === 0) {
      setError('No messages to copy');
      return;
    }

    const markdown = formatMessagesAsMarkdown(messages);
    const success = await copyToClipboard(markdown);

    if (success) {
      // Show temporary success message
      const originalError = error;
      setError(null);
      setTimeout(() => setError(originalError), 2000);
    } else {
      setError('Failed to copy to clipboard');
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h1>genai-lite Chat Demo</h1>
        <div className="header-buttons">
          <button
            className="export-button"
            onClick={handleCopyMarkdown}
            disabled={isLoading || messages.length === 0}
            title="Copy conversation as Markdown"
          >
            📋 Copy
          </button>
          <button
            className="export-button"
            onClick={handleExportJSON}
            disabled={isLoading || messages.length === 0}
            title="Export conversation as JSON"
          >
            💾 Export
          </button>
          <button className="clear-button" onClick={handleClearChat} disabled={isLoading}>
            🗑️ Clear
          </button>
        </div>
      </div>

      <ProviderSelector
        providers={providers}
        selectedProviderId={selectedProviderId}
        onProviderChange={setSelectedProviderId}
        models={models}
        selectedModelId={selectedModelId}
        onModelChange={setSelectedModelId}
        disabled={isLoading}
      />

      <SettingsPanel
        settings={settings}
        onSettingsChange={setSettings}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
        onResetSettings={handleResetSettings}
        disabled={isLoading}
      />

      {/* Advanced Features Section */}
      <div className="advanced-features-panel">
        <button
          className="advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
          disabled={isLoading}
        >
          🎯 Advanced Features {showAdvanced ? '▼' : '▶'}
        </button>

        {showAdvanced && (
          <div className="advanced-content">
            <div className="advanced-tabs">
              <button
                className={`advanced-tab ${advancedTab === 'templates' ? 'active' : ''}`}
                onClick={() => setAdvancedTab('templates')}
              >
                Templates
              </button>
              <button
                className={`advanced-tab ${advancedTab === 'llamacpp' ? 'active' : ''}`}
                onClick={() => setAdvancedTab('llamacpp')}
              >
                llama.cpp Tools
              </button>
            </div>

            {advancedTab === 'templates' && (
              <TemplateExamples
                presets={presets}
                selectedPresetId={selectedPresetId}
                onSelectPreset={setSelectedPresetId}
              />
            )}

            {advancedTab === 'llamacpp' && <LlamaCppTools />}
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="chat-container">
        <MessageList messages={messages} />
        <MessageInput
          onSendMessage={handleSendMessage}
          disabled={isLoading || !selectedProviderId || !selectedModelId}
          placeholder={
            isLoading
              ? 'Waiting for response...'
              : !selectedProviderId
              ? 'Select a provider first...'
              : !selectedModelId
              ? 'Select a model first...'
              : 'Type a message...'
          }
        />
      </div>

      {isLoading && <div className="loading-indicator">Loading...</div>}
    </div>
  );
}
