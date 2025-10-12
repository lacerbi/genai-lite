// ChatInterface component - Main chat interface that orchestrates all components

import { useState, useEffect } from 'react';
import { ProviderSelector } from './ProviderSelector';
import { SettingsPanel } from './SettingsPanel';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { getProviders, getModels, sendChatMessage } from '../api/client';
import type { Message, Provider, Model, LLMSettings } from '../types';

export function ChatInterface() {
  // State for providers and models
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');

  // State for chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for settings
  const [settings, setSettings] = useState<LLMSettings>({
    temperature: 0.7,
    maxTokens: undefined,
    topP: 1,
    reasoning: { enabled: false },
    thinkingExtraction: { enabled: false },
  });

  // Load providers on mount
  useEffect(() => {
    loadProviders();
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

  const loadProviders = async () => {
    try {
      const response = await getProviders();
      setProviders(response.providers);

      // Auto-select first available provider
      const firstAvailable = response.providers.find((p) => p.available);
      if (firstAvailable) {
        setSelectedProviderId(firstAvailable.id);
      }
    } catch (err) {
      setError(`Failed to load providers: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const loadModels = async (providerId: string) => {
    try {
      setError(null);
      const response = await getModels(providerId);
      setModels(response.models);

      // Auto-select first model
      if (response.models.length > 0) {
        setSelectedModelId(response.models[0].id);
      }
    } catch (err) {
      setError(`Failed to load models: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setModels([]);
      setSelectedModelId('');
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
      const apiMessages = messages
        .concat(userMessage)
        .map((m) => ({ role: m.role, content: m.content }));

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
        setError(`Error: ${response.error.message} (${response.error.code})`);
      }
    } catch (err) {
      setError(`Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h1>genai-lite Chat Demo</h1>
        <button className="clear-button" onClick={handleClearChat} disabled={isLoading}>
          Clear Chat
        </button>
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

      <SettingsPanel settings={settings} onSettingsChange={setSettings} disabled={isLoading} />

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
