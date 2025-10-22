import type { Provider, Model, Preset, GenerateRequest, GenerateResponse } from '../types';

const API_BASE = '/api';

/**
 * Fetch all image providers
 */
export async function fetchProviders(): Promise<Provider[]> {
  const response = await fetch(`${API_BASE}/image-providers`);
  if (!response.ok) {
    throw new Error(`Failed to fetch providers: ${response.statusText}`);
  }
  const data = await response.json();
  return data.providers;
}

/**
 * Fetch models for a specific provider
 */
export async function fetchModels(providerId: string): Promise<Model[]> {
  const response = await fetch(`${API_BASE}/image-models/${providerId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }
  const data = await response.json();
  return data.models;
}

/**
 * Fetch all image generation presets
 */
export async function fetchPresets(): Promise<Preset[]> {
  const response = await fetch(`${API_BASE}/image-presets`);
  if (!response.ok) {
    throw new Error(`Failed to fetch presets: ${response.statusText}`);
  }
  const data = await response.json();
  return data.presets;
}

/**
 * Generate image(s) from prompt
 */
export async function generateImage(request: GenerateRequest): Promise<GenerateResponse> {
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  // Parse the response even for errors
  const data = await response.json();

  // Return the response as-is (includes success field)
  return data;
}

/**
 * Check backend health
 */
export async function checkHealth(): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error('Backend not reachable');
  }
  return await response.json();
}
