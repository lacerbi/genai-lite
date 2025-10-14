// ChatInterface component - Main chat interface that orchestrates all components

import { useState, useEffect } from 'react';
import { ProviderSelector } from './ProviderSelector';
import { SettingsPanel } from './SettingsPanel';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TemplateExamples } from './TemplateExamples';
import { LlamaCppTools } from './LlamaCppTools';
import { getProviders, getModels, getLlamaCppModels, sendChatMessage, getPresets, renderTemplate as renderTemplateAPI } from '../api/client';
import { renderTemplate } from '../../../../src/prompting/template';
import type { Message, Provider, Model, LLMSettings, Preset, UserVariables, AutomaticVariables } from '../types';
import packageJson from '../../package.json';

// Template data for deferred rendering
interface TemplateToSend {
  template: string;
  variables: Record<string, any>;
  settings?: Partial<LLMSettings>;
  templateName: string;
}

// localStorage key for persisted settings
const STORAGE_KEY = 'genai-lite-chat-demo-settings';

// Default settings
const DEFAULT_SETTINGS: LLMSettings = {
  temperature: 0.7,
  maxTokens: undefined,
  topP: 1,
  reasoning: { enabled: false },
  thinkingTagFallback: { enabled: false, enforce: false },
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

  // State for presets
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(persisted?.presetId || '');

  // State for top-level tabs
  const [activeTab, setActiveTab] = useState<'chat' | 'templates' | 'llamacpp'>(persisted?.activeTab || 'chat');

  // State for settings sidebar (only in chat tab)
  const [sidebarExpanded, setSidebarExpanded] = useState(persisted?.sidebarExpanded !== false); // default true

  // State for template to send (deferred rendering)
  const [templateToSend, setTemplateToSend] = useState<TemplateToSend | null>(null);

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
      setError(enhanceErrorMessage(err));
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

    // Merge automatic and user variables
    const allVariables = { ...automaticVariables, ...userVariables };

    // Apply variable substitution to the user message
    const processedContent = renderTemplate(content, allVariables);

    // Add user message to the list (with original content for display)
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
    setUserVariables({});
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

  const handleOpenInChat = (data: TemplateToSend) => {
    // Store template for deferred rendering
    setTemplateToSend(data);

    // Clear existing chat
    setMessages([]);
    setError(null);

    // Apply settings from template META if provided
    if (data.settings) {
      setSettings(prev => ({ ...prev, ...data.settings }));
    }

    // Switch to chat tab
    setActiveTab('chat');
  };

  const handleSendTemplate = async () => {
    if (!templateToSend) return;
    if (!selectedProviderId || !selectedModelId) {
      setError('Please select a provider and model first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Render template with current provider/model
      const renderResponse = await renderTemplate({
        template: templateToSend.template,
        variables: templateToSend.variables,
        providerId: selectedProviderId,
        modelId: selectedModelId,
      });

      if (!renderResponse.success || !renderResponse.result) {
        setError(renderResponse.error?.message || 'Failed to render template');
        setIsLoading(false);
        return;
      }

      const { messages: renderedMessages } = renderResponse.result;

      // Extract SYSTEM message and set as system prompt (if present)
      const systemMsg = renderedMessages.find((m: any) => m.role === 'system');
      if (systemMsg) {
        setSystemPrompt(systemMsg.content);
      }

      // Find USER message to send
      const userMsg = renderedMessages.find((m: any) => m.role === 'user');
      if (!userMsg) {
        setError('Template did not produce a user message');
        setIsLoading(false);
        return;
      }

      // Add user message to chat
      const userMessage: Message = {
        role: 'user',
        content: userMsg.content,
        timestamp: Date.now(),
      };
      setMessages([userMessage]);

      // Prepare API messages (include system if present)
      const apiMessages = systemMsg
        ? [{ role: 'system', content: systemMsg.content }, { role: 'user', content: userMsg.content }]
        : [{ role: 'user', content: userMsg.content }];

      // Send to LLM
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

      // Clear template state after successful send
      setTemplateToSend(null);
    } catch (err) {
      setError(enhanceErrorMessage(err, { providerId: selectedProviderId, modelId: selectedModelId }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelTemplate = () => {
    setTemplateToSend(null);
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
                <div className="error-message">
                  <strong>Error:</strong> {error}
                </div>
              )}

              {/* Template Banner */}
              {templateToSend && (
                <div className="template-banner">
                  <div className="template-banner-content">
                    <span className="template-banner-icon">📋</span>
                    <div className="template-banner-text">
                      <strong>Template ready:</strong> {templateToSend.templateName}
                    </div>
                  </div>
                  <button
                    className="template-banner-cancel"
                    onClick={handleCancelTemplate}
                    title="Cancel template"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="chat-container">
                <MessageList messages={messages} />
                <MessageInput
                  onSendMessage={templateToSend ? handleSendTemplate : handleSendMessage}
                  disabled={isLoading || !selectedProviderId || !selectedModelId}
                  placeholder={
                    templateToSend
                      ? 'Click "Send Template" to render and send...'
                      : isLoading
                      ? 'Waiting for response...'
                      : !selectedProviderId
                      ? 'Select a provider first...'
                      : !selectedModelId
                      ? 'Select a model first...'
                      : 'Type a message...'
                  }
                  buttonLabel={templateToSend ? 'Send Template' : 'Send'}
                  requireInput={!templateToSend}
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
