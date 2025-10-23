/**
 * Frontend API Client for Image Generation Demo
 *
 * Provides functions to communicate with the backend Express server:
 * - Fetch providers, models, and presets
 * - Generate images via standard endpoint or SSE streaming
 * - Health checking for backend and genai-electron services
 *
 * SSE streaming is used for genai-electron to get real-time progress updates.
 */

import type { Provider, Model, Preset, GenerateRequest, GenerateResponse, HealthStatus } from '../types';

const API_BASE = '/api';

/**
 * Fetch all image providers from the backend
 * @returns Array of providers with availability status (based on API keys or server status)
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
 * @param providerId - The provider ID (e.g., 'openai-images', 'genai-electron-images')
 * @returns Array of available models with their capabilities and default settings
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
export async function getImagePresets(): Promise<Preset[]> {
  const response = await fetch(`${API_BASE}/image-presets`);
  if (!response.ok) {
    throw new Error(`Failed to fetch presets: ${response.statusText}`);
  }
  const data = await response.json();
  return data.presets;
}

/**
 * Generate image(s) from prompt (standard endpoint)
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
 * Progress callback for streaming generation
 */
export interface ProgressUpdate {
  stage: 'loading' | 'diffusion' | 'decoding';
  currentStep: number;
  totalSteps: number;
  percentage?: number;
  currentImage?: number;
  totalImages?: number;
  elapsed: number;
}

export interface StreamCallbacks {
  onProgress?: (progress: ProgressUpdate) => void;
  onStart?: () => void;
}

/**
 * Generate image(s) with real-time progress via Server-Sent Events (SSE)
 *
 * This function uses SSE to receive real-time progress updates from the backend,
 * particularly useful for local diffusion models where generation takes time.
 *
 * @param request - Image generation request with prompt, provider, model, and settings
 * @param callbacks - Optional callbacks for progress and start events
 * @returns Promise that resolves with the final generation result or error
 *
 * @example
 * ```typescript
 * const result = await generateImageStream(
 *   { providerId: 'genai-electron-images', modelId: 'stable-diffusion', prompt: 'A cat' },
 *   { onProgress: (p) => console.log(`${p.percentage}%`) }
 * );
 * ```
 */
export async function generateImageStream(
  request: GenerateRequest,
  callbacks?: StreamCallbacks
): Promise<GenerateResponse> {
  return new Promise((resolve, reject) => {
    // We need to use fetch with streaming response
    fetch(`${API_BASE}/generate-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })
      .then(async (response) => {
        if (!response.ok) {
          // If not OK and not SSE, parse as JSON error
          const error = await response.json();
          reject(new Error(error.error?.message || 'Generation failed'));
          return;
        }

        // Check if response is SSE
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('text/event-stream')) {
          reject(new Error('Expected SSE response'));
          return;
        }

        // Read the SSE stream using ReadableStream API
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        // Buffer to accumulate incomplete lines between chunks
        let buffer = '';

        if (!reader) {
          reject(new Error('No response body'));
          return;
        }

        // SSE parsing state variables (must persist across chunks)
        let isProcessing = true;      // Controls the read loop
        let currentEvent = '';         // Accumulates event type from 'event:' lines
        let currentData = '';          // Accumulates data from 'data:' lines

        const processChunk = async () => {
          try {
            const { done, value } = await reader.read();

            if (done) {
              // Stream ended - process any remaining buffered event
              if (buffer.trim()) {
                const lines = buffer.split('\n');

                for (const line of lines) {
                  if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                  } else if (line.startsWith('data:')) {
                    currentData = line.slice(5).trim();
                  } else if (line === '' || lines.indexOf(line) === lines.length - 1) {
                    // Empty line or last line signals end of event
                    if (currentEvent && currentData) {
                      handleEvent(currentEvent, currentData);
                      currentEvent = '';
                      currentData = '';
                    }
                  }
                }

                // Handle final event if no trailing empty line
                if (currentEvent && currentData) {
                  handleEvent(currentEvent, currentData);
                }
              }
              return;
            }

            // Decode chunk and append to buffer
            buffer += decoder.decode(value, { stream: true });

            // Split into lines and process complete events
            // SSE format: "event: type\ndata: payload\n\n" (double newline ends event)
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer for next chunk

            for (const line of lines) {
              if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                currentData = line.slice(5).trim();
              } else if (line === '') {
                // Empty line signals end of event - dispatch if complete
                if (currentEvent && currentData) {
                  handleEvent(currentEvent, currentData);
                  currentEvent = '';
                  currentData = '';
                }
              }
            }

            // Continue reading if still processing
            if (isProcessing) {
              processChunk();
            }
          } catch (error) {
            reject(error);
          }
        };

        /**
         * Handle a complete SSE event by type
         * Dispatches to appropriate callback or resolves/rejects the promise
         */
        const handleEvent = (eventType: string, dataStr: string) => {
          try {
            const data = JSON.parse(dataStr);

            switch (eventType) {
              case 'start':
                if (callbacks?.onStart) {
                  callbacks.onStart();
                }
                break;

              case 'progress':
                if (callbacks?.onProgress) {
                  callbacks.onProgress(data);
                }
                break;

              case 'complete':
                isProcessing = false; // Stop processing loop
                resolve({
                  success: true,
                  result: data.result,
                });
                break;

              case 'error':
                isProcessing = false; // Stop processing loop
                resolve({
                  success: false,
                  error: data.error,
                });
                break;
            }
          } catch (error) {
            console.error('Failed to parse SSE event:', error);
          }
        };

        // Start processing
        processChunk();
      })
      .catch(reject);
  });
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

/**
 * Check genai-electron diffusion server health
 */
export async function getGenaiElectronHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE}/health/genai-electron`);
  if (!response.ok) {
    throw new Error('Failed to check genai-electron health');
  }
  return await response.json();
}
