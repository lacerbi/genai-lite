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
  thinkingTagFallback?: {
    enabled?: boolean;
    tagName?: string;
    enforce?: boolean;
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

// Presets
export interface Preset {
  id: string;
  displayName: string;
  providerId: string;
  modelId: string;
  settings?: LLMSettings;
  description?: string;
}

export interface PresetsResponse {
  presets: Preset[];
}

// Templates
export interface TemplateRenderRequest {
  template: string;
  variables?: Record<string, any>;
  providerId?: string;
  modelId?: string;
  presetId?: string;
  settings?: LLMSettings;
}

export interface TemplateRenderResponse {
  success: boolean;
  result?: {
    messages: Array<{ role: string; content: string }>;
    modelContext?: Record<string, any>;
    settings?: LLMSettings;
  };
  error?: {
    message: string;
    code: string;
  };
}

// llama.cpp utilities
export interface TokenizeRequest {
  content: string;
}

export interface TokenizeResponse {
  success: boolean;
  tokens?: number[];
  tokenCount?: number;
  error?: {
    message: string;
    code: string;
  };
}

export interface LlamaCppHealthResponse {
  success: boolean;
  health?: {
    status: string;
    slotsIdle: number;
    slotsProcessing: number;
  };
  error?: {
    message: string;
    code: string;
  };
}

export interface EmbeddingRequest {
  content: string;
}

export interface EmbeddingResponse {
  success: boolean;
  embedding?: number[];
  dimension?: number;
  error?: {
    message: string;
    code: string;
  };
}

// Variables
export type UserVariables = Record<string, string>;
export type AutomaticVariables = Record<string, any>;
