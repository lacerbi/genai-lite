/**
 * genai-electron Image Adapter
 *
 * Adapter for local diffusion models via genai-electron's image generation server.
 * Supports stable-diffusion.cpp through HTTP wrapper with async polling for progress.
 *
 * Provider ID: 'genai-electron-images'
 * Default endpoint: http://127.0.0.1:8081
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
import { ADAPTER_ERROR_CODES } from '../../llm/clients/types';
import type { Logger } from '../../logging/types';
import { createDefaultLogger } from '../../logging/defaultLogger';

/**
 * genai-electron generation status response
 */
interface GenerationStatusResponse {
  id: string;
  status: 'pending' | 'in_progress' | 'complete' | 'error' | 'cancelled';
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
  private logger: Logger;

  constructor(config?: ImageProviderAdapterConfig) {
    this.baseURL = config?.baseURL || 'http://127.0.0.1:8081';
    this.timeout = config?.timeout || 120000; // 120 seconds for diffusion
    this.pollInterval = 500; // Poll every 500ms
    this.logger = config?.logger ?? createDefaultLogger();
  }

  /**
   * Generates images using genai-electron's async API with progress polling
   */
  async generate(config: {
    request: ImageGenerationRequest;
    resolvedPrompt: string;
    settings: ResolvedImageGenerationSettings;
    apiKey: string | null;
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<ImageGenerationResponse> {
    const { request, resolvedPrompt, settings, signal, timeoutMs } = config;
    // Per-request override of the construction-time timeout; applies to both
    // the POST and the poll-loop budget
    const effectiveTimeout = timeoutMs ?? this.timeout;
    let generationId: string | undefined;

    try {
      if (signal?.aborted) {
        throw this.createAbortError(
          'Image generation request was aborted before it started'
        );
      }

      // Build request payload
      const payload = this.buildRequestPayload(resolvedPrompt, request, settings);

      this.logger.debug(`GenaiElectron Image API: Starting generation`, {
        prompt: resolvedPrompt.substring(0, 100),
        count: payload.count,
        dimensions: `${payload.width}x${payload.height}`,
        steps: payload.steps,
      });

      // Start generation (returns immediately with ID)
      generationId = await this.startGeneration(payload, signal, effectiveTimeout);

      this.logger.info(`GenaiElectron Image API: Generation started with ID: ${generationId}`);

      // Poll for completion
      const result = await this.pollForCompletion(
        generationId,
        settings.diffusion?.onProgress,
        signal,
        effectiveTimeout
      );

      this.logger.info(`GenaiElectron Image API: Generation complete (${result.timeTaken}ms)`);

      // Convert to ImageGenerationResponse
      return this.convertToResponse(result, request);
    } catch (error: any) {
      this.logger.error('GenaiElectron Image API error:', error);

      // Best-effort server-side cancellation when a started generation is being
      // abandoned (caller abort, or client-side poll timeout — cancel frees the
      // GPU; the DELETE is cleanup, not a reclassification)
      if (generationId && (signal?.aborted || error?.name === 'TimeoutError')) {
        await this.cancelGeneration(generationId);
      }

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

    // Use dimensions from base settings (universal for all providers)
    const width = settings.width;
    const height = settings.height;

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
   *
   * The adapter's timeout and the caller's abort signal share one controller,
   * so both surface as AbortError — classification comes from adapter-side
   * state (timer-fired flag vs signal.aborted), with the caller's abort winning.
   */
  private async startGeneration(
    payload: any,
    signal: AbortSignal | undefined,
    effectiveTimeout: number
  ): Promise<string> {
    const url = `${this.baseURL}/v1/images/generations`;

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', abortFromCaller, { once: true });
      }
    }
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, effectiveTimeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw this.createHttpError(response.status, errorText, url);
      }

      const data: StartGenerationResponse = await response.json();
      return data.id;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        if (signal?.aborted) {
          throw this.createAbortError(
            'Image generation request was aborted before it started'
          );
        }
        if (timedOut) {
          throw this.createTimeoutError(
            `Request timeout after ${effectiveTimeout}ms (connecting to ${this.baseURL})`
          );
        }
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  /**
   * Polls for generation completion with progress updates
   */
  private async pollForCompletion(
    generationId: string,
    onProgress: ImageProgressCallback | undefined,
    signal: AbortSignal | undefined,
    effectiveTimeout: number
  ): Promise<NonNullable<GenerationStatusResponse['result']>> {
    const url = `${this.baseURL}/v1/images/generations/${generationId}`;
    const startTime = Date.now();

    while (true) {
      // Check caller abort (before timeout — user intent wins)
      if (signal?.aborted) {
        throw this.createAbortError(
          `Image generation request was aborted (ID: ${generationId})`
        );
      }

      // Check overall timeout
      if (Date.now() - startTime > effectiveTimeout) {
        throw this.createTimeoutError(
          `Generation timeout after ${effectiveTimeout}ms (ID: ${generationId})`
        );
      }

      // Fetch status
      let response: Response;
      try {
        response = await fetch(url, signal ? { signal } : undefined);
      } catch (error: any) {
        if (error.name === 'AbortError' && signal?.aborted) {
          throw this.createAbortError(
            `Image generation request was aborted (ID: ${generationId})`
          );
        }
        throw error;
      }

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

      // Handle out-of-band cancellation (terminal status since genai-electron 0.6.0)
      if (state.status === 'cancelled') {
        const cancelError = new Error(
          `Image generation was cancelled on the server (ID: ${generationId})`
        );
        (cancelError as any).code = 'GENERATION_CANCELLED';
        throw cancelError;
      }

      // Wait before next poll
      await this.sleep(this.pollInterval, signal);
    }
  }

  /**
   * Best-effort cancellation of a server-side generation
   * (DELETE /v1/images/generations/:id, available since genai-electron 0.6.0).
   *
   * All failures are swallowed: 404/409 just mean there is nothing left to
   * cancel, and cleanup must never mask the caller's primary error.
   */
  private async cancelGeneration(generationId: string): Promise<void> {
    const url = `${this.baseURL}/v1/images/generations/${generationId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(url, { method: 'DELETE', signal: controller.signal });
      this.logger.debug(
        `GenaiElectron Image API: Requested cancellation of generation ${generationId}`
      );
    } catch (error) {
      this.logger.debug(
        `GenaiElectron Image API: Best-effort cancellation failed for ${generationId}:`,
        error
      );
    } finally {
      clearTimeout(timeoutId);
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
    let serverCode: string | undefined;

    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
      if (typeof errorData.error?.code === 'string') {
        serverCode = errorData.error.code;
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
    if (serverCode) {
      (error as any).code = serverCode;
    }

    return error;
  }

  /**
   * Creates a timeout-typed error: name 'TimeoutError' is recognized by the
   * shared error mapping and classified as REQUEST_TIMEOUT / timeout_error
   */
  private createTimeoutError(message: string): Error {
    const error = new Error(message);
    error.name = 'TimeoutError';
    return error;
  }

  /**
   * Creates an abort-typed error: name 'AbortError' is recognized by the
   * shared error mapping and classified as REQUEST_ABORTED / abort_error
   */
  private createAbortError(message: string): Error {
    const error = new Error(message);
    error.name = 'AbortError';
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
    let errorCode: string = mapped.errorCode;
    let errorType = mapped.errorType;

    // Special handling for genai-electron specific errors
    if (error.code === 'GENERATION_CANCELLED') {
      errorMessage = error.message;
      errorCode = ADAPTER_ERROR_CODES.REQUEST_ABORTED;
      errorType = 'abort_error';
    } else if (error.code === 'SERVER_BUSY') {
      errorMessage = 'Image generation server is busy. Wait for current generation to complete.';
      errorCode = ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED;
      errorType = 'rate_limit_error';
    } else if (error.code === 'NOT_FOUND') {
      // Server JSON code from a poll GET/DELETE whose generation is gone —
      // typically expired from the registry (default TTL 300s). Without this
      // branch the 404 status maps to MODEL_NOT_FOUND ("model not found"),
      // which is misleading for an expired generation.
      errorMessage =
        'Generation not found on the server — it likely expired from the ' +
        `registry before polling completed. ${error.message}`;
      errorCode = ADAPTER_ERROR_CODES.PROVIDER_ERROR;
      errorType = 'server_error';
    } else if (error.code === 'SERVER_NOT_RUNNING') {
      errorMessage = `Image generation server is not running (connecting to ${this.baseURL})`;
      errorCode = ADAPTER_ERROR_CODES.NETWORK_ERROR;
      errorType = 'connection_error';
    } else if (error.code === 'BACKEND_ERROR') {
      errorMessage = `Diffusion backend error: ${error.message}`;
      errorCode = ADAPTER_ERROR_CODES.PROVIDER_ERROR;
      errorType = 'server_error';
    } else if (error.code === 'IO_ERROR') {
      errorMessage = `Image I/O error: ${error.message}`;
      errorCode = ADAPTER_ERROR_CODES.PROVIDER_ERROR;
      errorType = 'server_error';
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
    (enhancedError as any).code = errorCode;
    (enhancedError as any).type = errorType;
    (enhancedError as any).status = mapped.status;
    if (mapped.retryAfterMs !== undefined) {
      (enhancedError as any).retryAfterMs = mapped.retryAfterMs;
    }
    (enhancedError as any).providerId = this.id;
    (enhancedError as any).modelId = request.modelId;

    return enhancedError;
  }

  /**
   * Sleep helper for polling; rejects immediately when the signal aborts
   */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(this.createAbortError('Image generation request was aborted'));
        return;
      }

      const onAbort = () => {
        clearTimeout(timer);
        reject(this.createAbortError('Image generation request was aborted'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
