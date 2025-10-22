/**
 * genai-electron Image Adapter
 *
 * Adapter for local diffusion models via genai-electron's image generation server.
 * Supports stable-diffusion.cpp through HTTP wrapper with async polling for progress.
 *
 * Provider ID: 'genai-electron-images'
 * Default endpoint: http://localhost:8081
 * Configure via: GENAI_ELECTRON_IMAGE_BASE_URL environment variable
 *
 * This adapter uses genai-electron's async image generation API which:
 * - Returns immediately with a generation ID
 * - Allows polling for progress updates
 * - Supports full diffusion settings (negative prompts, steps, samplers, etc.)
 * - Handles batching via count parameter
 */

import type {
  ImageProviderAdapter,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageProviderCapabilities,
  ResolvedImageGenerationSettings,
  ImageProviderAdapterConfig,
  GeneratedImage,
  ImageProgressCallback,
} from '../../types/image';
import { getCommonMappedErrorDetails } from '../../shared/adapters/errorUtils';

/**
 * genai-electron generation status response
 */
interface GenerationStatusResponse {
  id: string;
  status: 'pending' | 'in_progress' | 'complete' | 'error';
  createdAt: number;
  updatedAt: number;
  progress?: {
    currentStep: number;
    totalSteps: number;
    stage: 'loading' | 'diffusion' | 'decoding';
    percentage?: number;
  };
  result?: {
    images: Array<{
      image: string; // base64
      seed: number;
      width: number;
      height: number;
    }>;
    format: 'png';
    timeTaken: number;
  };
  error?: {
    message: string;
    code: string;
  };
}

/**
 * genai-electron start generation response
 */
interface StartGenerationResponse {
  id: string;
  status: 'pending';
  createdAt: number;
}

/**
 * Adapter for genai-electron's local diffusion image generation
 */
export class GenaiElectronImageAdapter implements ImageProviderAdapter {
  readonly id = 'genai-electron-images';
  readonly supports: ImageProviderCapabilities = {
    supportsMultipleImages: true, // via count parameter
    supportsB64Json: true, // returns base64
    supportsHostedUrls: false, // local generation only
    supportsProgressEvents: true, // via polling
    supportsNegativePrompt: true, // full diffusion support
    defaultModelId: 'sdxl',
  };

  private baseURL: string;
  private timeout: number;
  private pollInterval: number;

  constructor(config?: ImageProviderAdapterConfig) {
    this.baseURL = config?.baseURL || 'http://localhost:8081';
    this.timeout = config?.timeout || 120000; // 120 seconds for diffusion
    this.pollInterval = 500; // Poll every 500ms
  }

  /**
   * Generates images using genai-electron's async API with progress polling
   */
  async generate(config: {
    request: ImageGenerationRequest;
    resolvedPrompt: string;
    settings: ResolvedImageGenerationSettings;
    apiKey: string | null;
  }): Promise<ImageGenerationResponse> {
    const { request, resolvedPrompt, settings } = config;

    try {
      // Build request payload
      const payload = this.buildRequestPayload(resolvedPrompt, request, settings);

      console.log(`GenaiElectron Image API: Starting generation`, {
        prompt: resolvedPrompt.substring(0, 100),
        count: payload.count,
        dimensions: `${payload.width}x${payload.height}`,
        steps: payload.steps,
      });

      // Start generation (returns immediately with ID)
      const generationId = await this.startGeneration(payload);

      console.log(`GenaiElectron Image API: Generation started with ID: ${generationId}`);

      // Poll for completion
      const result = await this.pollForCompletion(
        generationId,
        settings.diffusion?.onProgress
      );

      console.log(`GenaiElectron Image API: Generation complete (${result.timeTaken}ms)`);

      // Convert to ImageGenerationResponse
      return this.convertToResponse(result, request);
    } catch (error) {
      console.error('GenaiElectron Image API error:', error);
      throw this.handleError(error, request);
    }
  }

  /**
   * Builds the request payload for genai-electron
   */
  private buildRequestPayload(
    prompt: string,
    request: ImageGenerationRequest,
    settings: ResolvedImageGenerationSettings
  ): any {
    const diffusion = settings.diffusion;

    // Parse size string into width/height if needed
    let width = diffusion?.width || 512;
    let height = diffusion?.height || 512;

    if (settings.size && !diffusion?.width && !diffusion?.height) {
      // Parse size like "1024x1024" into width/height
      const match = settings.size.match(/^(\d+)x(\d+)$/);
      if (match) {
        width = parseInt(match[1], 10);
        height = parseInt(match[2], 10);
      }
    }

    return {
      prompt,
      negativePrompt: diffusion?.negativePrompt,
      width,
      height,
      steps: diffusion?.steps || 20,
      cfgScale: diffusion?.cfgScale || 7.5,
      seed: diffusion?.seed, // undefined = random
      sampler: diffusion?.sampler || 'euler_a',
      count: request.count || 1,
    };
  }

  /**
   * Starts generation and returns the generation ID
   */
  private async startGeneration(payload: any): Promise<string> {
    const url = `${this.baseURL}/v1/images/generations`;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw this.createHttpError(response.status, errorText, url);
      }

      const data: StartGenerationResponse = await response.json();
      return data.id;
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Handle AbortError
      if (error.name === 'AbortError') {
        throw new Error(
          `Request timeout after ${this.timeout}ms (connecting to ${this.baseURL})`
        );
      }

      throw error;
    }
  }

  /**
   * Polls for generation completion with progress updates
   */
  private async pollForCompletion(
    generationId: string,
    onProgress?: ImageProgressCallback
  ): Promise<NonNullable<GenerationStatusResponse['result']>> {
    const url = `${this.baseURL}/v1/images/generations/${generationId}`;
    const startTime = Date.now();

    while (true) {
      // Check overall timeout
      if (Date.now() - startTime > this.timeout) {
        throw new Error(
          `Generation timeout after ${this.timeout}ms (ID: ${generationId})`
        );
      }

      // Fetch status
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw this.createHttpError(response.status, errorText, url);
      }

      const state: GenerationStatusResponse = await response.json();

      // Handle progress updates
      if (state.status === 'in_progress' && state.progress && onProgress) {
        onProgress({
          currentStep: state.progress.currentStep,
          totalSteps: state.progress.totalSteps,
          stage: state.progress.stage,
          percentage: state.progress.percentage,
        });
      }

      // Handle completion
      if (state.status === 'complete') {
        if (!state.result) {
          throw new Error('Generation marked complete but no result available');
        }
        return state.result;
      }

      // Handle error
      if (state.status === 'error') {
        const error = state.error || { message: 'Unknown error', code: 'UNKNOWN_ERROR' };
        throw this.createGenerationError(error.message, error.code);
      }

      // Wait before next poll
      await this.sleep(this.pollInterval);
    }
  }

  /**
   * Converts genai-electron result to ImageGenerationResponse
   */
  private convertToResponse(
    result: NonNullable<GenerationStatusResponse['result']>,
    request: ImageGenerationRequest
  ): ImageGenerationResponse {
    const images: GeneratedImage[] = result.images.map((img, index) => {
      // Convert base64 to Buffer
      const imageBuffer = Buffer.from(img.image, 'base64');

      return {
        index,
        mimeType: 'image/png',
        data: imageBuffer,
        b64Json: img.image, // Preserve base64
        prompt: request.prompt,
        seed: img.seed,
        metadata: {
          width: img.width,
          height: img.height,
        },
      };
    });

    return {
      object: 'image.result',
      created: Math.floor(Date.now() / 1000),
      providerId: this.id,
      modelId: request.modelId,
      data: images,
      usage: {
        cost: 0, // Local generation is free
        credits: result.timeTaken, // Use timeTaken as credits
      },
    };
  }

  /**
   * Creates an HTTP error with context
   */
  private createHttpError(status: number, errorText: string, url: string): Error {
    let errorMessage = `HTTP ${status} error`;

    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {
      // Not JSON, use raw text
      if (errorText) {
        errorMessage = `HTTP ${status}: ${errorText}`;
      }
    }

    const error = new Error(`${errorMessage} (${url})`);
    (error as any).status = status;
    (error as any).url = url;

    return error;
  }

  /**
   * Creates a generation error from genai-electron error codes
   */
  private createGenerationError(message: string, code: string): Error {
    const error = new Error(`Generation failed: ${message}`);
    (error as any).code = code;

    return error;
  }

  /**
   * Handles errors and converts to standard format
   */
  private handleError(error: any, request: ImageGenerationRequest): Error {
    // Use shared error mapping utility
    const mapped = getCommonMappedErrorDetails(error);

    // Enhance error message with context
    let errorMessage = mapped.errorMessage;

    // Special handling for genai-electron specific errors
    if (error.code === 'SERVER_BUSY') {
      errorMessage = 'Image generation server is busy. Wait for current generation to complete.';
      (error as any).type = 'rate_limit_error';
    } else if (error.code === 'SERVER_NOT_RUNNING') {
      errorMessage = `Image generation server is not running (connecting to ${this.baseURL})`;
      (error as any).type = 'connection_error';
    } else if (error.code === 'BACKEND_ERROR') {
      errorMessage = `Diffusion backend error: ${error.message}`;
      (error as any).type = 'server_error';
    } else if (error.code === 'IO_ERROR') {
      errorMessage = `Image I/O error: ${error.message}`;
      (error as any).type = 'server_error';
    }

    // Add baseURL context for network errors
    if (mapped.errorCode === 'NETWORK_ERROR') {
      errorMessage = `${errorMessage} (connecting to ${this.baseURL})`;
    }

    // Add timeout context
    if (errorMessage.includes('timeout')) {
      errorMessage = `${errorMessage}. Try increasing the timeout or reducing generation steps.`;
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

  /**
   * Sleep helper for polling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
