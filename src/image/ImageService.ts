/**
 * Main service for image generation operations
 *
 * This service orchestrates image generation requests through provider adapters,
 * manages presets, validates requests, and handles settings resolution.
 */

import type { ApiKeyProvider } from '../types';
import type {
  ImageGenerationRequest,
  ImageGenerationRequestWithPreset,
  ImageGenerationResponse,
  ImageFailureResponse,
  ImageProviderInfo,
  ImageModelInfo,
  ImageProviderId,
  ImagePreset,
  ImageServiceOptions,
} from '../types/image';
import { SUPPORTED_IMAGE_PROVIDERS, getImageModelsByProvider } from './config';
import { ImagePresetManager } from './services/ImagePresetManager';
import { ImageAdapterRegistry } from './services/ImageAdapterRegistry';
import { ImageRequestValidator } from './services/ImageRequestValidator';
import { ImageSettingsResolver } from './services/ImageSettingsResolver';
import { ImageModelResolver } from './services/ImageModelResolver';

/**
 * Main service for image generation operations
 */
export class ImageService {
  private getApiKey: ApiKeyProvider;
  private presetManager: ImagePresetManager;
  private adapterRegistry: ImageAdapterRegistry;
  private requestValidator: ImageRequestValidator;
  private settingsResolver: ImageSettingsResolver;
  private modelResolver: ImageModelResolver;

  constructor(getApiKey: ApiKeyProvider, options: ImageServiceOptions = {}) {
    this.getApiKey = getApiKey;

    // Initialize helper services
    this.presetManager = new ImagePresetManager(options.presets, options.presetMode);
    this.adapterRegistry = new ImageAdapterRegistry();
    this.requestValidator = new ImageRequestValidator();
    this.settingsResolver = new ImageSettingsResolver();
    this.modelResolver = new ImageModelResolver(this.presetManager);

    console.log('ImageService: Initialized');
  }

  /**
   * Generates images based on the request
   *
   * @param request - Image generation request
   * @returns Promise resolving to response or error
   */
  async generateImage(
    request: ImageGenerationRequest | ImageGenerationRequestWithPreset
  ): Promise<ImageGenerationResponse | ImageFailureResponse> {
    console.log('ImageService.generateImage called');

    try {
      // Resolve model information
      const resolved = this.modelResolver.resolve(request);
      if (resolved.error) {
        return resolved.error;
      }

      const { providerId, modelId, modelInfo, settings: presetSettings } = resolved;

      // Create full request with resolved IDs
      const fullRequest: ImageGenerationRequest = {
        ...(request as any),
        providerId: providerId!,
        modelId: modelId!,
      };

      // Validate request structure
      const validationError = this.requestValidator.validateRequestStructure(fullRequest);
      if (validationError) {
        return validationError;
      }

      // Resolve settings (defaults < preset < request)
      const resolvedSettings = this.settingsResolver.resolveSettings(
        modelInfo!,
        presetSettings,
        fullRequest.settings
      );

      // Resolve prompt (apply prefix if from preset)
      const preset = (request as ImageGenerationRequestWithPreset).presetId
        ? this.presetManager.resolvePreset((request as ImageGenerationRequestWithPreset).presetId!)
        : null;
      const resolvedPrompt = preset?.promptPrefix
        ? `${preset.promptPrefix} ${fullRequest.prompt}`
        : fullRequest.prompt;

      // Get adapter for provider
      const adapter = this.adapterRegistry.getAdapter(providerId!);

      // Get API key
      try {
        const apiKey = await this.getApiKey(providerId!);

        // Validate API key if adapter supports it
        if (apiKey && adapter.validateApiKey && !adapter.validateApiKey(apiKey)) {
          return {
            object: 'error',
            providerId: providerId!,
            modelId: modelId!,
            error: {
              message: `Invalid API key format for provider '${providerId}'`,
              code: 'INVALID_API_KEY',
              type: 'authentication_error',
            },
          };
        }

        // Generate images
        console.log(`ImageService: Calling adapter for provider: ${providerId}`);
        const response = await adapter.generate({
          request: fullRequest,
          resolvedPrompt,
          settings: resolvedSettings,
          apiKey,
        });

        console.log('ImageService: Image generation completed successfully');
        return response;
      } catch (error) {
        console.error('ImageService: Error during image generation:', error);
        return {
          object: 'error',
          providerId: providerId!,
          modelId: modelId!,
          error: {
            message:
              error instanceof Error
                ? error.message
                : 'An unknown error occurred during image generation',
            code: 'PROVIDER_ERROR',
            type: 'server_error',
            providerError: error,
          },
        };
      }
    } catch (error) {
      console.error('ImageService: Unexpected error:', error);
      const req = request as any;
      return {
        object: 'error',
        providerId: req.providerId || req.presetId || 'unknown',
        modelId: req.modelId,
        error: {
          message:
            error instanceof Error ? error.message : 'An unexpected error occurred',
          code: 'UNEXPECTED_ERROR',
          type: 'server_error',
          providerError: error,
        },
      };
    }
  }

  /**
   * Gets list of supported image providers
   *
   * @returns Promise resolving to array of provider information
   */
  async getProviders(): Promise<ImageProviderInfo[]> {
    console.log('ImageService.getProviders called');
    return [...SUPPORTED_IMAGE_PROVIDERS];
  }

  /**
   * Gets list of supported models for a specific provider
   *
   * @param providerId - The provider ID to get models for
   * @returns Promise resolving to array of model information
   */
  async getModels(providerId: ImageProviderId): Promise<ImageModelInfo[]> {
    console.log(`ImageService.getModels called for provider: ${providerId}`);
    const models = getImageModelsByProvider(providerId);
    console.log(`ImageService: Found ${models.length} models for provider: ${providerId}`);
    return [...models];
  }

  /**
   * Gets all configured image presets
   *
   * @returns Array of image presets
   */
  getPresets(): ImagePreset[] {
    return this.presetManager.getPresets();
  }

  /**
   * Registers a custom image adapter
   *
   * @param providerId - The provider ID
   * @param adapter - The adapter instance
   */
  registerAdapter(providerId: ImageProviderId, adapter: any): void {
    this.adapterRegistry.registerAdapter(providerId, adapter);
  }
}
