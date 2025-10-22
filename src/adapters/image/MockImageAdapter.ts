/**
 * Mock Image Adapter for testing and fallback
 *
 * This adapter provides a simple mock implementation for testing purposes
 * and serves as a fallback for unsupported providers during development.
 */

import type {
  ImageProviderAdapter,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageProviderCapabilities,
  ResolvedImageGenerationSettings,
} from '../../types/image';

/**
 * Mock adapter for testing image generation
 */
export class MockImageAdapter implements ImageProviderAdapter {
  readonly id = 'mock-image-provider';
  readonly supports: ImageProviderCapabilities = {
    supportsMultipleImages: true,
    supportsB64Json: true,
    supportsHostedUrls: false,
    supportsProgressEvents: false,
    supportsNegativePrompt: true,
    defaultModelId: 'mock-model',
  };

  /**
   * Generates mock images
   */
  async generate(config: {
    request: ImageGenerationRequest;
    resolvedPrompt: string;
    settings: ResolvedImageGenerationSettings;
    apiKey: string | null;
  }): Promise<ImageGenerationResponse> {
    const { request, resolvedPrompt } = config;
    const count = request.count || 1;

    // Create mock image data (1x1 PNG)
    const mockImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    // Generate mock images based on count
    const images = Array.from({ length: count }, (_, index) => ({
      index,
      mimeType: 'image/png' as const,
      data: mockImageBuffer,
      prompt: resolvedPrompt,
      seed: Math.floor(Math.random() * 1000000),
      width: 1,
      height: 1,
    }));

    return {
      object: 'image.result',
      created: Math.floor(Date.now() / 1000),
      providerId: request.providerId,
      modelId: request.modelId,
      data: images,
      usage: {
        timeTaken: 100, // Mock timing
      },
    };
  }
}
