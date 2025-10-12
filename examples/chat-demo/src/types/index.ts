// Type definitions for the chat demo frontend

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  timestamp: number;
}

export interface Provider {
  id: string;
  name: string;
  available: boolean;
}

export interface Model {
  id: string;
  name: string;
  description?: string;
  defaultSettings?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  capabilities?: {
    reasoning?: boolean;
    thinkingExtraction?: boolean;
  };
  pricing?: {
    inputTokensPerMillion?: number;
    outputTokensPerMillion?: number;
  };
}

export interface LLMSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  reasoning?: {
    enabled: boolean;
    effort?: 'low' | 'medium' | 'high';
  };
  thinkingExtraction?: {
    enabled: boolean;
    onMissing?: 'ignore' | 'warn' | 'error';
    tags?: string[];
  };
}

export interface ChatRequest {
  providerId: string;
  modelId: string;
  messages: Array<{ role: string; content: string }>;
  settings?: LLMSettings;
}

export interface ChatResponse {
  success: boolean;
  response?: {
    content: string;
    reasoning?: string;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens?: number;
    };
  };
  error?: {
    message: string;
    code: string;
  };
}

export interface ProvidersResponse {
  providers: Provider[];
}

export interface ModelsResponse {
  models: Model[];
}
