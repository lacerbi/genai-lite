/**
 * Image Service - Backend wrapper for genai-lite ImageService
 *
 * Initializes and exposes the genai-lite ImageService with helper functions for:
 * - Provider availability checking (API keys, server health)
 * - Model retrieval
 * - Preset management
 * - Image generation with progress callbacks
 *
 * Note: Buffer to base64 conversion happens here for JSON transport to frontend.
 */

import { ImageService, fromEnvironment } from 'genai-lite';
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageFailureResponse,
  ImageProviderInfo,
  ImageModelInfo,
  ImagePreset,
  ImageProgressCallback
} from 'genai-lite';

/**
 * Initialize the ImageService with environment variable API key provider
 */
export const imageService = new ImageService(fromEnvironment);

/**
 * Get all available image providers with API key availability check
 */
export async function getImageProviders(): Promise<Array<ImageProviderInfo & { available: boolean }>> {
  const providers = await imageService.getProviders();

  // Check availability for each provider
  const providersWithAvailability = await Promise.all(
    providers.map(async (provider) => ({
      ...provider,
      available: await checkProviderAvailable(provider.id)
    }))
  );

  return providersWithAvailability;
}

/**
 * Check if a provider is available (API key set or server running)
 */
async function checkProviderAvailable(providerId: string): Promise<boolean> {
  // For genai-electron, check if the server is running
  if (providerId === 'genai-electron-images') {
    try {
      const baseURL = process.env.GENAI_ELECTRON_IMAGE_BASE_URL || 'http://localhost:8081';
      const response = await fetch(`${baseURL}/health`, {
        signal: AbortSignal.timeout(2000) // 2 second timeout
      });
      return response.ok;
    } catch (error) {
      // Server not running or not reachable
      return false;
    }
  }

  // For cloud providers, check environment variable
  // OpenAI Images uses OPENAI_API_KEY
  if (providerId === 'openai-images') {
    return !!process.env.OPENAI_API_KEY;
  }

  // Default: assume not available
  return false;
}

/**
 * Get models for a specific provider
 */
export async function getImageModels(providerId: string): Promise<ImageModelInfo[]> {
  return await imageService.getModels(providerId);
}

/**
 * Get all configured image presets
 */
export function getImagePresets(): ImagePreset[] {
  return imageService.getPresets();
}

/**
 * Generate image(s) from a prompt using genai-lite ImageService
 *
 * @param request - Generation request configuration
 * @param request.providerId - Provider ID ('openai-images' or 'genai-electron-images')
 * @param request.modelId - Model ID (e.g., 'gpt-image-1-mini', 'stable-diffusion')
 * @param request.prompt - Text prompt describing the desired image
 * @param request.count - Number of images to generate (1-4)
 * @param request.settings - Universal and provider-specific settings
 * @param request.onProgress - Optional callback for real-time progress (diffusion only)
 * @returns Success/failure response with base64-encoded images or error details
 *
 * Note: Image Buffers are converted to base64 strings for JSON transport
 */
export async function generateImage(request: {
  providerId: string;
  modelId: string;
  prompt: string;
  count?: number;
  settings?: any;
  onProgress?: ImageProgressCallback;
}): Promise<{ success: boolean; result?: any; error?: any }> {
  try {
    // Build the image generation request
    const imageRequest: ImageGenerationRequest = {
      providerId: request.providerId as any,
      modelId: request.modelId,
      prompt: request.prompt,
      count: request.count,
      settings: {
        ...request.settings,
        diffusion: {
          ...request.settings?.diffusion,
          onProgress: request.onProgress
        }
      }
    };

    // Generate the image(s)
    const response = await imageService.generateImage(imageRequest);

    if (response.object === 'image.result') {
      // Success - convert Buffers to base64 for JSON transport
      return {
        success: true,
        result: {
          images: response.data.map(img => ({
            index: img.index,
            data: img.data.toString('base64'),  // Convert Buffer to base64
            seed: img.seed,
            width: img.metadata?.width || request.settings?.width,
            height: img.metadata?.height || request.settings?.height
          })),
          created: response.created,
          providerId: response.providerId,
          modelId: response.modelId,
          usage: response.usage
        }
      };
    } else {
      // Error response
      return {
        success: false,
        error: {
          message: response.error.message,
          code: response.error.code,
          type: response.error.type
        }
      };
    }
  } catch (error) {
    // Unexpected error
    console.error('Image generation error:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'SERVER_ERROR',
        type: 'server_error'
      }
    };
  }
}
