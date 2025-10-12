// API client for communicating with the backend

import type {
  ChatRequest,
  ChatResponse,
  ProvidersResponse,
  ModelsResponse,
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
