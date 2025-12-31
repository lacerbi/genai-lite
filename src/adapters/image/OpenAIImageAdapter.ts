/**
 * OpenAI Images API Adapter
 *
 * Adapter for OpenAI's image generation API (DALL-E and GPT-Image models).
 * Supports the /v1/images/generations endpoint.
 *
 * Supported models:
 * - gpt-image-1-mini (default): Fast, efficient, 32K char prompts
 * - gpt-image-1: Highest quality, 32K char prompts, advanced features
 * - dall-e-3: High quality, 4K char prompts, only n=1
 * - dall-e-2: Standard quality, 1K char prompts
 *
 * Based on: https://platform.openai.com/docs/api-reference/images/create
 */

import OpenAI from 'openai';
import type {
  ImageProviderAdapter,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageProviderCapabilities,
  ResolvedImageGenerationSettings,
  ImageProviderAdapterConfig,
  GeneratedImage,
} from '../../types/image';
import { getCommonMappedErrorDetails } from '../../shared/adapters/errorUtils';
import { createDefaultLogger } from '../../logging/defaultLogger';

const logger = createDefaultLogger();

/**
 * Prompt length limits per model
 */
const PROMPT_LIMITS: Record<string, number> = {
  'gpt-image-1': 32000,
  'gpt-image-1-mini': 32000,
  'dall-e-3': 4000,
  'dall-e-2': 1000,
};

/**
 * Adapter for OpenAI's image generation API
 */
export class OpenAIImageAdapter implements ImageProviderAdapter {
  readonly id = 'openai-images';
  readonly supports: ImageProviderCapabilities = {
    supportsMultipleImages: true,
    supportsB64Json: true,
    supportsHostedUrls: true,
    supportsProgressEvents: false,
    supportsNegativePrompt: false,
    defaultModelId: 'gpt-image-1-mini',
  };

  private baseURL?: string;
  private timeout: number;

  constructor(config?: ImageProviderAdapterConfig) {
    this.baseURL = config?.baseURL;
    this.timeout = config?.timeout || 60000;
  }

  /**
   * Validates OpenAI API key format
   */
  validateApiKey(apiKey: string): boolean {
    // OpenAI API keys typically start with 'sk-' and are at least 20 characters
    return apiKey.startsWith('sk-') && apiKey.length >= 20;
  }

  /**
   * Generates images using OpenAI's API
   */
  async generate(config: {
    request: ImageGenerationRequest;
    resolvedPrompt: string;
    settings: ResolvedImageGenerationSettings;
    apiKey: string | null;
  }): Promise<ImageGenerationResponse> {
    const { request, resolvedPrompt, settings, apiKey } = config;

    if (!apiKey) {
      throw new Error('OpenAI API key is required but was not provided');
    }

    try {
      // Validate prompt length
      this.validatePromptLength(resolvedPrompt, request.modelId);

      // Validate dall-e-3 constraints
      if (request.modelId === 'dall-e-3') {
        const count = request.count || settings.n || 1;
        if (count > 1) {
          throw new Error('dall-e-3 only supports generating 1 image at a time (n=1)');
        }
      }

      // Initialize OpenAI client
      const client = new OpenAI({
        apiKey,
        ...(this.baseURL && { baseURL: this.baseURL }),
        timeout: this.timeout,
      });

      // Determine if this is a gpt-image-1 model
      const isGptImageModel = request.modelId.startsWith('gpt-image-1');

      // Build request parameters
      const params: any = {
        model: request.modelId,
        prompt: resolvedPrompt,
        n: request.count || settings.n || 1,
      };

      // Add model-specific parameters
      if (isGptImageModel) {
        // gpt-image-1 models: use new parameter format
        this.addGptImageParams(params, settings);
      } else {
        // dall-e-2/dall-e-3: use traditional parameters
        this.addDalleParams(params, settings);
      }

      logger.debug(`OpenAI Image API call for model: ${request.modelId}`, {
        model: params.model,
        promptLength: resolvedPrompt.length,
        n: params.n,
        isGptImageModel,
      });

      // Make API call
      const response = await client.images.generate(params);

      if (!response.data || response.data.length === 0) {
        throw new Error('OpenAI API returned no images in response');
      }

      logger.info(`OpenAI Image API call successful, generated ${response.data.length} images`);

      // Process response
      return await this.processResponse(response, request, isGptImageModel);
    } catch (error) {
      logger.error('OpenAI Image API error:', error);
      throw this.handleError(error, request);
    }
  }

  /**
   * Validates prompt length for the given model
   */
  private validatePromptLength(prompt: string, modelId: string): void {
    const limit = PROMPT_LIMITS[modelId];
    if (limit && prompt.length > limit) {
      throw new Error(
        `Prompt too long for model ${modelId}: ${prompt.length} characters (max: ${limit})`
      );
    }
  }

  /**
   * Converts width and height to OpenAI size format (e.g., "1024x1024")
   */
  private toSizeString(width: number, height: number): string {
    return `${width}x${height}`;
  }

  /**
   * Adds gpt-image-1 specific parameters to the request
   */
  private addGptImageParams(params: any, settings: ResolvedImageGenerationSettings): void {
    // Size (supports auto, 1024x1024, 1536x1024, 1024x1536)
    // Convert width/height to OpenAI's size format
    params.size = this.toSizeString(settings.width, settings.height);

    // Quality (auto, high, medium, low)
    if (settings.quality) {
      params.quality = settings.quality;
    }

    // For gpt-image-1, use settings.openai namespace
    const openaiSettings = (settings as any).openai;
    if (openaiSettings) {
      if (openaiSettings.outputFormat) {
        params.output_format = openaiSettings.outputFormat;
      }
      if (openaiSettings.background) {
        params.background = openaiSettings.background;
      }
      if (openaiSettings.moderation) {
        params.moderation = openaiSettings.moderation;
      }
      if (openaiSettings.outputCompression !== undefined) {
        params.output_compression = openaiSettings.outputCompression;
      }
    }

    // User tracking
    if (settings.user) {
      params.user = settings.user;
    }

    // Note: gpt-image-1 always returns base64, no response_format parameter needed
  }

  /**
   * Adds dall-e-2/dall-e-3 specific parameters to the request
   */
  private addDalleParams(params: any, settings: ResolvedImageGenerationSettings): void {
    // Size (model-specific options)
    // Convert width/height to OpenAI's size format
    params.size = this.toSizeString(settings.width, settings.height);

    // Quality and Style are only supported by dall-e-3
    const isDallE3 = params.model === 'dall-e-3';

    if (isDallE3) {
      // Quality (hd or standard for dall-e-3 only)
      if (settings.quality) {
        params.quality = settings.quality;
      }

      // Style (vivid or natural for dall-e-3 only)
      if (settings.style) {
        params.style = settings.style;
      }
    }

    // Response format (url or b64_json)
    // Default to b64_json for consistency (gpt-image-1 only returns base64)
    if (settings.responseFormat === 'url') {
      params.response_format = 'url';
    } else {
      params.response_format = 'b64_json';
    }

    // User tracking
    if (settings.user) {
      params.user = settings.user;
    }
  }

  /**
   * Processes the OpenAI API response and converts to ImageGenerationResponse
   */
  private async processResponse(
    response: any,
    request: ImageGenerationRequest,
    isGptImageModel: boolean
  ): Promise<ImageGenerationResponse> {
    const images: GeneratedImage[] = [];

    for (let i = 0; i < response.data.length; i++) {
      const item = response.data[i];
      let imageBuffer: Buffer;
      let mimeType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png';
      let imageUrl: string | undefined;
      let b64String: string | undefined;

      if (isGptImageModel) {
        // gpt-image-1 models always return base64
        if (!item.b64_json) {
          throw new Error(`Expected b64_json in response for gpt-image-1 model, but got: ${JSON.stringify(item)}`);
        }
        const b64Data = item.b64_json;
        b64String = b64Data;
        imageBuffer = Buffer.from(b64Data, 'base64');

        // Determine mime type from output_format parameter (if we have access to it)
        // For now, default to PNG (most common)
        mimeType = 'image/png';
      } else {
        // dall-e-2/dall-e-3: can be url or b64_json
        if (item.url) {
          // Fetch image from URL
          imageUrl = item.url;
          const imageResponse = await fetch(item.url);
          if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image from URL: ${imageResponse.statusText}`);
          }
          const arrayBuffer = await imageResponse.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);

          // Infer mime type from URL or default to PNG
          if (item.url.includes('.jpeg') || item.url.includes('.jpg')) {
            mimeType = 'image/jpeg';
          } else if (item.url.includes('.webp')) {
            mimeType = 'image/webp';
          }
        } else if (item.b64_json) {
          // Base64 encoded
          const b64Data = item.b64_json;
          b64String = b64Data;
          imageBuffer = Buffer.from(b64Data, 'base64');
          mimeType = 'image/png';
        } else {
          throw new Error('OpenAI response contained neither url nor b64_json');
        }
      }

      images.push({
        index: i,
        mimeType,
        data: imageBuffer,
        ...(imageUrl && { url: imageUrl }),
        ...(b64String && { b64Json: b64String }),
        prompt: request.prompt,
        // OpenAI doesn't return seed in the response
      });
    }

    // Extract usage data if available
    const usage = response.usage
      ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        }
      : undefined;

    return {
      object: 'image.result',
      created: response.created || Math.floor(Date.now() / 1000),
      providerId: this.id,
      modelId: request.modelId,
      data: images,
      ...(usage && { usage }),
    };
  }

  /**
   * Handles errors from OpenAI API and converts to standard format
   */
  private handleError(error: any, request: ImageGenerationRequest): Error {
    // Use shared error mapping utility
    const mapped = getCommonMappedErrorDetails(error);

    // Enhance error message with context
    let errorMessage = mapped.errorMessage;

    // Add baseURL context for network errors
    if (mapped.errorCode === 'NETWORK_ERROR') {
      const baseUrl = this.baseURL || 'https://api.openai.com/v1';
      errorMessage = `${errorMessage} (connecting to ${baseUrl})`;
    }

    // Add model-specific context for validation errors
    if (mapped.errorType === 'invalid_request_error' && error.message) {
      errorMessage = error.message;
    }

    // Create enhanced error with all details
    const enhancedError = new Error(errorMessage);
    (enhancedError as any).code = mapped.errorCode;
    (enhancedError as any).type = mapped.errorType;
    (enhancedError as any).status = mapped.status;
    (enhancedError as any).providerId = this.id;
    (enhancedError as any).modelId = request.modelId;

    return enhancedError;
  }
}
