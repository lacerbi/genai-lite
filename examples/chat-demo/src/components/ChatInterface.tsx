// ChatInterface component - Main chat interface that orchestrates all components

import { useState, useEffect } from 'react';
import { ProviderSelector } from './ProviderSelector';
import { SettingsPanel } from './SettingsPanel';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TemplateExamples } from './TemplateExamples';
import { LlamaCppTools } from './LlamaCppTools';
import { ErrorDisplay } from './ErrorDisplay';
import { getProviders, getModels, getLlamaCppModels, sendChatMessage, getPresets, renderTemplate as renderTemplateAPI } from '../api/client';
import { renderTemplate } from '../../../../src/prompting/template';
import type { Message, Provider, Model, LLMSettings, Preset, UserVariables, AutomaticVariables } from '../types';
import packageJson from '../../package.json';

// Error data structure
interface ErrorInfo {
  userMessage: string;
  rawError?: any;
}

// localStorage key for persisted settings
const STORAGE_KEY = 'genai-lite-chat-demo-settings';

// Default settings
const DEFAULT_SETTINGS: LLMSettings = {
  temperature: 0.7,
  maxTokens: undefined,
  topP: 1,
  reasoning: { enabled: false },
  thinkingTagFallback: { enabled: true, enforce: false },
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
  // Extract error string from different error formats
  let errorStr: string;

  if (error instanceof Error) {
    // JavaScript Error object
    errorStr = error.message;
  } else if (typeof error === 'object' && error !== null && error.message) {
    // Object with message property (from backend)
    errorStr = error.message;
  } else if (typeof error === 'string') {
    // Already a string
    errorStr = error;
  } else {
    // Fallback for other types
    errorStr = String(error);
  }

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
  return errorStr;
}

// Create error info object from error
function createErrorInfo(error: any, context?: { providerId?: string; modelId?: string }): ErrorInfo {
  return {
    userMessage: enhanceErrorMessage(error, context),
    rawError: error
  };
}

// Create simple error info (no raw error)
function createSimpleError(message: string): ErrorInfo {
  return {
    userMessage: message
  };
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

// Extract raw role content from template (without variable substitution)
function extractRawRoleContent(template: string): { system: string; user: string } {
  // Remove META block
  const cleanTemplate = template.replace(/<META>[\s\S]*?<\/META>/g, '').trim();

  // Extract SYSTEM and USER content (keep variables intact)
  const systemMatch = cleanTemplate.match(/<SYSTEM>([\s\S]*?)<\/SYSTEM>/);
  const userMatch = cleanTemplate.match(/<USER>([\s\S]*?)<\/USER>/);

  return {
    system: systemMatch?.[1].trim() || '',
    user: userMatch?.[1].trim() || ''
  };
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
  const [error, setError] = useState<ErrorInfo | null>(null);

  // State for system prompt
  const [systemPrompt, setSystemPrompt] = useState<string>(persisted?.systemPrompt || '');

  // State for settings
  const [settings, setSettings] = useState<LLMSettings>(
    persisted?.settings || DEFAULT_SETTINGS
  );

  // State for presets
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(persisted?.presetId || '');

  // State for top-level tabs
  const [activeTab, setActiveTab] = useState<'chat' | 'templates' | 'llamacpp'>(persisted?.activeTab || 'chat');

  // State for settings sidebar (only in chat tab)
  const [sidebarExpanded, setSidebarExpanded] = useState(persisted?.sidebarExpanded !== false); // default true

  // State for message input (controlled)
  const [messageInputValue, setMessageInputValue] = useState<string>('');

  // State for variables
  const [userVariables, setUserVariables] = useState<UserVariables>(persisted?.userVariables || {});
  const [automaticVariables, setAutomaticVariables] = useState<AutomaticVariables>({});

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
      activeTab,
      sidebarExpanded,
      userVariables,
    });
  }, [selectedProviderId, selectedModelId, selectedPresetId, systemPrompt, settings, activeTab, sidebarExpanded, userVariables]);

  // Load automatic variables when provider/model/settings change
  useEffect(() => {
    const loadAutomaticVariables = async () => {
      if (!selectedProviderId || !selectedModelId) {
        setAutomaticVariables({});
        return;
      }

      try {
        // Use the template rendering API to get model context
        const response = await renderTemplateAPI({
          template: '<USER>dummy</USER>', // Minimal template just to get context
          variables: {},
          providerId: selectedProviderId,
          modelId: selectedModelId,
          settings,
        });

        if (response.success && response.result?.modelContext) {
          setAutomaticVariables(response.result.modelContext);
        } else {
          setAutomaticVariables({});
        }
      } catch (err) {
        console.warn('Failed to load automatic variables:', err);
        setAutomaticVariables({});
      }
    };

    loadAutomaticVariables();
  }, [selectedProviderId, selectedModelId, settings]);

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
      setError(createErrorInfo(err));
    }
  };

  const loadModels = async (providerId: string) => {
    try {
      setError(null);

      // For llamacpp, use special endpoint that queries the actual running server
      const response = providerId === 'llamacpp'
        ? await getLlamaCppModels()
        : await getModels(providerId);

      setModels(response.models);

      // Auto-select first model only if no persisted model
      if (!persisted?.modelId && response.models.length > 0) {
        setSelectedModelId(response.models[0].id);
      }
    } catch (err) {
      // For llamacpp, treat unavailability as normal state (not an error to show users)
      // This happens when the llama.cpp server isn't running
      if (providerId === 'llamacpp') {
        const errorStr = err instanceof Error ? err.message : String(err);

        // Check if it's a 503 Service Unavailable error
        if (errorStr.includes('503') || errorStr.includes('Service Unavailable')) {
          // Log for debugging but don't show error to user
          console.log('llama.cpp server is not available (not running or unreachable)');
          setModels([]);
          setSelectedModelId('');
          return; // Exit without setting error
        }
      }

      // For all other errors, show them to the user
      setError(createErrorInfo(err, { providerId }));
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
      setError(createSimpleError('Please select a provider and model first'));
      return;
    }

    // Merge automatic and user variables
    const allVariables = { ...automaticVariables, ...userVariables };

    // Apply variable substitution to the user message
    const processedContent = renderTemplate(content, allVariables);

    // Add user message to the list (with processed content)
    const userMessage: Message = {
      role: 'user',
      content: processedContent,
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

      // Apply variable substitution to system prompt if set
      const processedSystemPrompt = systemPrompt
        ? renderTemplate(systemPrompt, allVariables)
        : '';

      // Prepend system message if system prompt is set
      const apiMessages = processedSystemPrompt
        ? [{ role: 'system', content: processedSystemPrompt }, ...conversationMessages]
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

        // Clear input after successful send
        setMessageInputValue('');
      } else if (response.error) {
        setError(createErrorInfo(response.error, { providerId: selectedProviderId, modelId: selectedModelId }));
      }
    } catch (err) {
      setError(createErrorInfo(err, { providerId: selectedProviderId, modelId: selectedModelId }));
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
    setUserVariables({});
  };

  const handleExportJSON = () => {
    if (messages.length === 0) {
      setError(createSimpleError('No messages to export'));
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
      setError(createSimpleError('No messages to copy'));
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
      setError(createSimpleError('Failed to copy to clipboard'));
    }
  };

  const handleOpenInChat = (data: {
    template: string;
    variables: Record<string, any>;
    settings?: Partial<LLMSettings>;
    templateName: string;
  }) => {
    // Extract raw role content from template (without variable substitution)
    const { system, user } = extractRawRoleContent(data.template);

    // Populate fields with RAW content (variables intact)
    if (system) {
      setSystemPrompt(system);
    }
    if (user) {
      setMessageInputValue(user);
    }

    // Set variables
    setUserVariables(data.variables);

    // Reset settings to defaults first to avoid conflicts
    setSettings(DEFAULT_SETTINGS);

    // Then apply template settings from META if provided
    if (data.settings) {
      setSettings(prev => ({ ...prev, ...data.settings }));
    }

    // Clear existing chat
    setMessages([]);
    setError(null);

    // Switch to chat tab
    setActiveTab('chat');
  };

  return (
    <div className="chat-interface">
      {/* Header with title and tabs */}
      <div className="chat-header">
        <div className="title-section">
          <h1>genai-lite Chat Demo</h1>
          <span className="version-badge">v{packageJson.version}</span>
        </div>
        <div className="app-tabs">
          <button
            className={`app-tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={`app-tab ${activeTab === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveTab('templates')}
          >
            Templates
          </button>
          <button
            className={`app-tab ${activeTab === 'llamacpp' ? 'active' : ''}`}
            onClick={() => setActiveTab('llamacpp')}
          >
            llama.cpp Tools
          </button>
        </div>
      </div>

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div className="chat-tab">
          <div className="chat-top-bar">
            <ProviderSelector
              providers={providers}
              selectedProviderId={selectedProviderId}
              onProviderChange={setSelectedProviderId}
              models={models}
              selectedModelId={selectedModelId}
              onModelChange={setSelectedModelId}
              disabled={isLoading}
            />
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

          <div className="chat-with-sidebar">
            {/* Settings Sidebar */}
            <SettingsPanel
              settings={settings}
              onSettingsChange={setSettings}
              systemPrompt={systemPrompt}
              onSystemPromptChange={setSystemPrompt}
              onResetSettings={handleResetSettings}
              disabled={isLoading}
              isExpanded={sidebarExpanded}
              onToggle={() => setSidebarExpanded(!sidebarExpanded)}
              userVariables={userVariables}
              onUserVariablesChange={setUserVariables}
              automaticVariables={automaticVariables}
            />

            {/* Chat Content */}
            <div className="chat-main">
              {error && (
                <ErrorDisplay userMessage={error.userMessage} rawError={error.rawError} />
              )}

              <div className="chat-container">
                <MessageList messages={messages} />
                <MessageInput
                  value={messageInputValue}
                  onChange={setMessageInputValue}
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
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="templates-tab">
          <TemplateExamples
            presets={presets}
            selectedPresetId={selectedPresetId}
            onSelectPreset={setSelectedPresetId}
            onOpenInChat={handleOpenInChat}
          />
        </div>
      )}

      {/* llama.cpp Tools Tab */}
      {activeTab === 'llamacpp' && (
        <div className="llamacpp-tab">
          <LlamaCppTools />
        </div>
      )}
    </div>
  );
}
