/**
 * Configuration for image generation providers and models
 *
 * This file defines:
 * - Supported image providers
 * - Default models for each provider
 * - Provider capabilities
 * - Adapter configurations (base URLs, timeouts, etc.)
 */

import type {
  ImageProviderId,
  ImageProviderInfo,
  ImageModelInfo,
  ImageProviderAdapterConfig,
  ImageProviderCapabilities,
} from '../types/image';

/**
 * Supported image generation providers
 */
export const SUPPORTED_IMAGE_PROVIDERS: ImageProviderInfo[] = [
  {
    id: 'openai-images',
    displayName: 'OpenAI Images',
    description: 'DALL-E and GPT-Image models from OpenAI',
    capabilities: {
      supportsMultipleImages: true,
      supportsB64Json: true,
      supportsHostedUrls: true,
      supportsProgressEvents: false,
      supportsNegativePrompt: false,
      defaultModelId: 'gpt-image-1-mini',
    },
    models: [
      {
        id: 'gpt-image-1-mini',
        providerId: 'openai-images',
        displayName: 'GPT-Image 1 Mini',
        description: 'Fast and efficient image generation with GPT-Image (32K char prompts, supports transparency, webp/jpeg output)',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: false, // gpt-image-1 always returns base64
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'gpt-image-1-mini',
        },
        defaultSettings: {
          width: 1024,
          height: 1024,
          quality: 'auto',
          responseFormat: 'buffer',
          openai: {
            outputFormat: 'png',
            background: 'auto',
            moderation: 'auto',
          },
        },
      },
      {
        id: 'gpt-image-1',
        providerId: 'openai-images',
        displayName: 'GPT-Image 1',
        description: 'Most advanced OpenAI image model with highest quality (32K char prompts, supports transparency, compression control)',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: false, // gpt-image-1 always returns base64
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'gpt-image-1',
        },
        defaultSettings: {
          width: 1024,
          height: 1024,
          quality: 'auto',
          responseFormat: 'buffer',
          openai: {
            outputFormat: 'png',
            background: 'auto',
            moderation: 'auto',
          },
        },
      },
      {
        id: 'dall-e-3',
        providerId: 'openai-images',
        displayName: 'DALL-E 3',
        description: 'High-quality DALL-E model with improved prompt adherence (4K char prompts, only n=1)',
        capabilities: {
          supportsMultipleImages: false, // dall-e-3 only supports n=1
          supportsB64Json: true,
          supportsHostedUrls: true,
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'dall-e-3',
        },
        defaultSettings: {
          width: 1024,
          height: 1024,
          quality: 'standard',
          style: 'vivid',
          responseFormat: 'buffer',
        },
      },
      {
        id: 'dall-e-2',
        providerId: 'openai-images',
        displayName: 'DALL-E 2',
        description: 'Previous generation DALL-E model (1K char prompts)',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: true,
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'dall-e-2',
        },
        defaultSettings: {
          width: 1024,
          height: 1024,
          quality: 'standard',
          responseFormat: 'buffer',
        },
      },
    ],
  },
  {
    id: 'genai-electron-images',
    displayName: 'Local Diffusion (genai-electron)',
    description: 'Local stable-diffusion models via genai-electron wrapper',
    capabilities: {
      supportsMultipleImages: true,
      supportsB64Json: true,
      supportsHostedUrls: false,
      supportsProgressEvents: true,
      supportsNegativePrompt: true,
      defaultModelId: 'stable-diffusion',
    },
    models: [
      {
        id: 'stable-diffusion',
        providerId: 'genai-electron-images',
        displayName: 'Stable Diffusion',
        description: 'High-quality local diffusion model',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: false,
          supportsProgressEvents: true,
          supportsNegativePrompt: true,
          defaultModelId: 'stable-diffusion',
        },
        defaultSettings: {
          width: 512,
          height: 512,
          responseFormat: 'buffer',
          diffusion: {
            steps: 20,
            cfgScale: 7.5,
            sampler: 'dpm++2m',
          },
        },
      },
    ],
  },
];

/**
 * Adapter configurations for each provider
 * These define base URLs and other adapter-specific settings
 */
export const IMAGE_ADAPTER_CONFIGS: Record<ImageProviderId, ImageProviderAdapterConfig> = {
  'openai-images': {
    baseURL: process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1',
    timeout: 60000, // 60 seconds for image generation
  },
  'genai-electron-images': {
    baseURL: process.env.GENAI_ELECTRON_IMAGE_BASE_URL || 'http://localhost:8081',
    timeout: 120000, // 120 seconds for local diffusion
    checkHealth: false, // Optional health checks
  },
};

/**
 * Gets provider information by ID
 *
 * @param providerId - The provider ID to look up
 * @returns Provider information or null if not found
 */
export function getImageProviderById(providerId: ImageProviderId): ImageProviderInfo | null {
  return SUPPORTED_IMAGE_PROVIDERS.find(p => p.id === providerId) || null;
}

/**
 * Gets all models for a specific provider
 *
 * @param providerId - The provider ID
 * @returns Array of model information
 */
export function getImageModelsByProvider(providerId: ImageProviderId): ImageModelInfo[] {
  const provider = getImageProviderById(providerId);
  return provider?.models || [];
}

/**
 * Gets model information by provider and model ID
 *
 * @param providerId - The provider ID
 * @param modelId - The model ID
 * @returns Model information or null if not found
 */
export function getImageModelInfo(providerId: ImageProviderId, modelId: string): ImageModelInfo | null {
  const models = getImageModelsByProvider(providerId);
  return models.find(m => m.id === modelId) || null;
}

/**
 * Gets default capabilities for a provider
 *
 * @param providerId - The provider ID
 * @returns Provider capabilities or null if not found
 */
export function getImageProviderCapabilities(providerId: ImageProviderId): ImageProviderCapabilities | null {
  const provider = getImageProviderById(providerId);
  return provider?.capabilities || null;
}
