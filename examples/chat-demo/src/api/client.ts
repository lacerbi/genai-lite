// API client for communicating with the backend

import type {
  ChatRequest,
  ChatResponse,
  ProvidersResponse,
  ModelsResponse,
  PresetsResponse,
  TemplateRenderRequest,
  TemplateRenderResponse,
  TokenizeRequest,
  TokenizeResponse,
  LlamaCppHealthResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from '../types';

const API_BASE = '/api';

/**
 * Fetches the list of available AI providers
 */
export async function getProviders(): Promise<ProvidersResponse> {
  const response = await fetch(`${API_BASE}/providers`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetches the list of models for a specific provider
 */
export async function getModels(providerId: string): Promise<ModelsResponse> {
  const response = await fetch(`${API_BASE}/models/${providerId}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetches the currently loaded model from llama.cpp server
 * This is a special endpoint that queries the actual running server
 */
export async function getLlamaCppModels(): Promise<ModelsResponse> {
  const response = await fetch(`${API_BASE}/llamacpp/models`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Sends a chat message to the LLM
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Checks if the backend is healthy
 */
export async function checkHealth(): Promise<{ status: string; message: string; timestamp: string }> {
  const response = await fetch(`${API_BASE}/health`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetches all configured presets
 */
export async function getPresets(): Promise<PresetsResponse> {
  const response = await fetch(`${API_BASE}/presets`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Renders a template with variables and model context
 */
export async function renderTemplate(request: TemplateRenderRequest): Promise<TemplateRenderResponse> {
  const response = await fetch(`${API_BASE}/templates/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Tokenizes text using llama.cpp server
 */
export async function tokenizeText(request: TokenizeRequest): Promise<TokenizeResponse> {
  const response = await fetch(`${API_BASE}/llamacpp/tokenize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Checks llama.cpp server health
 */
export async function checkLlamaCppHealth(): Promise<LlamaCppHealthResponse> {
  const response = await fetch(`${API_BASE}/llamacpp/health`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Generates embeddings using llama.cpp server
 */
export async function generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
  const response = await fetch(`${API_BASE}/llamacpp/embedding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}
