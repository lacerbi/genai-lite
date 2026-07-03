/**
 * Main service for image generation operations
 *
 * This service orchestrates image generation requests through provider adapters,
 * manages presets, validates requests, and handles settings resolution.
 */

import type { ApiKeyProvider } from '../types';
import type { Logger, LogLevel } from '../logging/types';
import { createDefaultLogger } from '../logging/defaultLogger';
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
  ImageProviderAdapter,
  GenerateImageOptions,
} from '../types/image';
import { ADAPTER_ERROR_CODES } from '../llm/clients/types';
import { withRetry } from '../shared/services/withRetry';
import {
  SUPPORTED_IMAGE_PROVIDERS,
  getImageModelsByProvider,
  getImageProviderById,
  IMAGE_ADAPTER_CONFIGS,
} from './config';
import rawDefaultImagePresets from '../config/image-presets.json';
import { PresetManager } from '../shared/services/PresetManager';
import { AdapterRegistry } from '../shared/services/AdapterRegistry';
import { MockImageAdapter } from '../adapters/image/MockImageAdapter';
import { OpenAIImageAdapter } from '../adapters/image/OpenAIImageAdapter';
import { GenaiElectronImageAdapter } from '../adapters/image/GenaiElectronImageAdapter';
import { ImageRequestValidator } from './services/ImageRequestValidator';
import { ImageSettingsResolver } from './services/ImageSettingsResolver';
import { ImageModelResolver } from './services/ImageModelResolver';

// Type assertion for the imported JSON
const defaultImagePresets = rawDefaultImagePresets as ImagePreset[];

// Error codes adapters stamp on the errors they throw; used to decide whether a
// caught error's classification is safe to surface on the failure envelope
const ADAPTER_ERROR_CODE_VALUES = new Set<string>(Object.values(ADAPTER_ERROR_CODES));

/**
 * Main service for image generation operations
 */
export class ImageService {
  private getApiKey: ApiKeyProvider;
  private logger: Logger;
  private presetManager: PresetManager<ImagePreset>;
  private adapterRegistry: AdapterRegistry<ImageProviderAdapter, ImageProviderId>;
  private requestValidator: ImageRequestValidator;
  private settingsResolver: ImageSettingsResolver;
  private modelResolver: ImageModelResolver;
  private retryOptions: ImageServiceOptions['retry'];

  constructor(getApiKey: ApiKeyProvider, options: ImageServiceOptions = {}) {
    this.getApiKey = getApiKey;
    this.retryOptions = options.retry;

    // Initialize logger - custom logger takes precedence over logLevel
    this.logger = options.logger ?? createDefaultLogger(options.logLevel);

    // Initialize helper services
    this.presetManager = new PresetManager<ImagePreset>(
      defaultImagePresets,
      options.presets,
      options.presetMode
    );

    // Initialize adapter registry with fallback
    this.adapterRegistry = new AdapterRegistry<ImageProviderAdapter, ImageProviderId>({
      supportedProviders: SUPPORTED_IMAGE_PROVIDERS,
      fallbackAdapter: new MockImageAdapter(),
    }, this.logger);

    // Register OpenAI adapter
    const openaiConfig = IMAGE_ADAPTER_CONFIGS['openai-images'];
    const openaiBaseURL = options.baseUrls?.['openai-images'] || openaiConfig.baseURL;
    this.adapterRegistry.registerAdapter(
      'openai-images',
      new OpenAIImageAdapter({
        baseURL: openaiBaseURL,
        timeout: openaiConfig.timeout,
        logger: this.logger,
      })
    );

    // Register genai-electron-images adapter
    const electronConfig = IMAGE_ADAPTER_CONFIGS['genai-electron-images'];
    const electronBaseURL = options.baseUrls?.['genai-electron-images'] || electronConfig.baseURL;
    this.adapterRegistry.registerAdapter(
      'genai-electron-images',
      new GenaiElectronImageAdapter({
        baseURL: electronBaseURL,
        timeout: electronConfig.timeout,
        logger: this.logger,
      })
    );

    // Register custom adapters if provided
    if (options.adapters) {
      for (const [providerId, adapter] of Object.entries(options.adapters)) {
        this.adapterRegistry.registerAdapter(providerId, adapter);
      }
    }

    this.requestValidator = new ImageRequestValidator();
    this.settingsResolver = new ImageSettingsResolver();
    this.modelResolver = new ImageModelResolver(this.presetManager);

    this.logger.debug('ImageService: Initialized with OpenAI Images and genai-electron adapters');
  }

  /**
   * Generates images based on the request
   *
   * @param request - Image generation request
   * @param options - Per-call options (e.g. an AbortSignal for cancellation)
   * @returns Promise resolving to response or error
   */
  async generateImage(
    request: ImageGenerationRequest | ImageGenerationRequestWithPreset,
    options?: GenerateImageOptions
  ): Promise<ImageGenerationResponse | ImageFailureResponse> {
    this.logger.info('ImageService.generateImage called');

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
        // Short-circuit if the caller already aborted — don't touch the adapter
        if (options?.signal?.aborted) {
          return {
            object: 'error',
            providerId: providerId!,
            modelId: modelId!,
            error: {
              message: 'Image generation request was aborted',
              code: ADAPTER_ERROR_CODES.REQUEST_ABORTED,
              type: 'abort_error',
            },
          };
        }

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

        // Generate images. Only providers marked retryable in config are ever
        // retried — genai-electron's POST-then-poll is not idempotent (a blind
        // retry after the POST would start a second GPU generation), and custom
        // adapters without a config entry get the safe default (no retries).
        this.logger.info(`ImageService: Calling adapter for provider: ${providerId}`);
        const providerRetryable = getImageProviderById(providerId!)?.retryable === true;
        const retryOnTimeout = this.retryOptions?.retryOnTimeout ?? true;
        const retryableCodes = new Set<string>([
          ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED,
          ADAPTER_ERROR_CODES.NETWORK_ERROR,
          ...(retryOnTimeout ? [ADAPTER_ERROR_CODES.REQUEST_TIMEOUT] : []),
        ]);

        return await withRetry<ImageGenerationResponse | ImageFailureResponse>(
          async () => {
            try {
              const response = await adapter.generate({
                request: fullRequest,
                resolvedPrompt,
                settings: resolvedSettings,
                apiKey,
                signal: options?.signal,
                timeoutMs: options?.timeoutMs,
              });
              this.logger.info('ImageService: Image generation completed successfully');
              return response;
            } catch (error) {
              this.logger.error('ImageService: Error during image generation:', error);
              return this.buildFailureEnvelope(error, providerId!, modelId!);
            }
          },
          (result) => {
            if (result.object !== 'error' || !providerRetryable) {
              return { retry: false };
            }
            const code = String(result.error.code);
            const status = result.error.status;
            const retry =
              retryableCodes.has(code) ||
              (code === ADAPTER_ERROR_CODES.PROVIDER_ERROR &&
                typeof status === 'number' &&
                (status === 408 || status === 409 || status >= 500));
            return { retry, retryAfterMs: result.error.retryAfterMs };
          },
          {
            ...this.retryOptions,
            ...(options?.maxRetries !== undefined && { maxRetries: options.maxRetries }),
            signal: options?.signal,
            logger: this.logger,
            label: `${providerId}/${modelId}`,
          }
        );
      } catch (error) {
        // Errors thrown outside the adapter call (e.g. a failing ApiKeyProvider)
        this.logger.error('ImageService: Error during image generation:', error);
        return this.buildFailureEnvelope(error, providerId!, modelId!);
      }
    } catch (error) {
      this.logger.error('ImageService: Unexpected error:', error);
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
   * Builds a failure envelope from a thrown error.
   *
   * Adapters throw errors stamped with an ADAPTER_ERROR_CODES code plus
   * type/status/retryAfterMs — that classification is propagated. Anything else
   * (e.g. a failing ApiKeyProvider whose error carries a foreign `.code` like
   * ENOENT) keeps the generic fallback so unrelated codes don't leak into the
   * API surface.
   */
  private buildFailureEnvelope(
    error: unknown,
    providerId: ImageProviderId,
    modelId: string | undefined
  ): ImageFailureResponse {
    const thrown = error as any;
    const isAdapterError =
      typeof thrown?.code === 'string' && ADAPTER_ERROR_CODE_VALUES.has(thrown.code);
    return {
      object: 'error',
      providerId,
      modelId,
      error: {
        message:
          error instanceof Error
            ? error.message
            : 'An unknown error occurred during image generation',
        code: isAdapterError ? thrown.code : 'PROVIDER_ERROR',
        type:
          isAdapterError && typeof thrown.type === 'string'
            ? thrown.type
            : 'server_error',
        ...(isAdapterError &&
          typeof thrown.status === 'number' && { status: thrown.status }),
        ...(isAdapterError &&
          typeof thrown.retryAfterMs === 'number' && { retryAfterMs: thrown.retryAfterMs }),
        providerError: error,
      },
    };
  }

  /**
   * Gets list of supported image providers
   *
   * @returns Promise resolving to array of provider information
   */
  async getProviders(): Promise<ImageProviderInfo[]> {
    this.logger.debug('ImageService.getProviders called');
    return [...SUPPORTED_IMAGE_PROVIDERS];
  }

  /**
   * Gets list of supported models for a specific provider
   *
   * @param providerId - The provider ID to get models for
   * @returns Promise resolving to array of model information
   */
  async getModels(providerId: ImageProviderId): Promise<ImageModelInfo[]> {
    this.logger.debug(`ImageService.getModels called for provider: ${providerId}`);
    const models = getImageModelsByProvider(providerId);
    this.logger.debug(`ImageService: Found ${models.length} models for provider: ${providerId}`);
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
