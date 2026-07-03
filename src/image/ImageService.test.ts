/**
 * Unit tests for ImageService
 *
 * Focus: failure-envelope propagation (adapter error code/type/status must
 * survive to the ImageFailureResponse) and request-side cancellation.
 */

import { ImageService } from './ImageService';
import { MockImageAdapter } from '../adapters/image/MockImageAdapter';
import type {
  ImageProviderAdapter,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageFailureResponse,
} from '../types/image';

const defaultRequest: ImageGenerationRequest = {
  providerId: 'genai-electron-images',
  modelId: 'stable-diffusion',
  prompt: 'A serene mountain lake',
};

/**
 * Builds a stub adapter registered under the genai-electron provider ID so it
 * passes model resolution against the built-in config.
 */
function makeAdapter(
  generate: ImageProviderAdapter['generate']
): ImageProviderAdapter {
  return {
    id: 'genai-electron-images',
    supports: {
      supportsMultipleImages: true,
      supportsB64Json: true,
      supportsHostedUrls: false,
      supportsProgressEvents: true,
      supportsNegativePrompt: true,
      defaultModelId: 'stable-diffusion',
    },
    generate,
  };
}

function makeService(
  adapter: ImageProviderAdapter,
  getApiKey: (providerId: string) => Promise<string | null> = async () => null
): ImageService {
  return new ImageService(getApiKey, {
    adapters: { 'genai-electron-images': adapter },
    logLevel: 'silent',
  });
}

const successResponse: ImageGenerationResponse = {
  object: 'image.result',
  created: Math.floor(Date.now() / 1000),
  providerId: 'genai-electron-images',
  modelId: 'stable-diffusion',
  data: [
    {
      index: 0,
      mimeType: 'image/png',
      data: Buffer.from('fake'),
      prompt: 'A serene mountain lake',
    },
  ],
};

describe('ImageService', () => {
  describe('failure envelope propagation', () => {
    it('propagates adapter-mapped code/type/status to the failure envelope', async () => {
      const adapterError: any = new Error('Image generation server is busy.');
      adapterError.code = 'RATE_LIMIT_EXCEEDED';
      adapterError.type = 'rate_limit_error';
      adapterError.status = 503;

      const service = makeService(
        makeAdapter(async () => {
          throw adapterError;
        })
      );

      const result = (await service.generateImage(defaultRequest)) as ImageFailureResponse;

      expect(result.object).toBe('error');
      expect(result.error).toMatchObject({
        message: 'Image generation server is busy.',
        code: 'RATE_LIMIT_EXCEEDED',
        type: 'rate_limit_error',
        status: 503,
      });
      expect(result.error.providerError).toBe(adapterError);
    });

    it('propagates abort classification from the adapter', async () => {
      const adapterError: any = new Error('Image generation was cancelled on the server');
      adapterError.code = 'REQUEST_ABORTED';
      adapterError.type = 'abort_error';

      const service = makeService(
        makeAdapter(async () => {
          throw adapterError;
        })
      );

      const result = (await service.generateImage(defaultRequest)) as ImageFailureResponse;

      expect(result.error).toMatchObject({
        code: 'REQUEST_ABORTED',
        type: 'abort_error',
      });
      expect(result.error.status).toBeUndefined();
    });

    it('falls back to PROVIDER_ERROR/server_error for untyped errors', async () => {
      const service = makeService(
        makeAdapter(async () => {
          throw new Error('something broke');
        })
      );

      const result = (await service.generateImage(defaultRequest)) as ImageFailureResponse;

      expect(result.error).toMatchObject({
        message: 'something broke',
        code: 'PROVIDER_ERROR',
        type: 'server_error',
      });
    });

    it('does not leak foreign error codes (e.g. from an ApiKeyProvider) into the envelope', async () => {
      const keyError: any = new Error('ENOENT: no such file or directory, open key.txt');
      keyError.code = 'ENOENT';

      const service = makeService(
        makeAdapter(async () => successResponse),
        async () => {
          throw keyError;
        }
      );

      const result = (await service.generateImage(defaultRequest)) as ImageFailureResponse;

      expect(result.object).toBe('error');
      expect(result.error).toMatchObject({
        code: 'PROVIDER_ERROR',
        type: 'server_error',
      });
      expect(result.error.providerError).toBe(keyError);
    });

    it('returns the adapter response unchanged on success', async () => {
      const service = makeService(makeAdapter(async () => successResponse));

      const result = await service.generateImage(defaultRequest);

      expect(result).toBe(successResponse);
    });
  });

  describe('retry layer', () => {
    const openaiRequest: ImageGenerationRequest = {
      providerId: 'openai-images',
      modelId: 'gpt-image-1-mini',
      prompt: 'A serene mountain lake',
    };

    const openaiSuccess: ImageGenerationResponse = {
      ...successResponse,
      providerId: 'openai-images',
      modelId: 'gpt-image-1-mini',
    };

    function makeOpenAIAdapter(
      generate: ImageProviderAdapter['generate']
    ): ImageProviderAdapter {
      return {
        id: 'openai-images',
        supports: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: true,
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'gpt-image-1-mini',
        },
        generate,
      };
    }

    function makeOpenAIService(
      adapter: ImageProviderAdapter,
      retry?: Record<string, unknown>
    ): ImageService {
      return new ImageService(async () => null, {
        adapters: { 'openai-images': adapter },
        logLevel: 'silent',
        // Tiny delays keep the tests fast with real timers
        retry: { initialDelayMs: 1, maxDelayMs: 20, ...retry },
      });
    }

    function transientError(code: string, extra?: Record<string, unknown>): any {
      return Object.assign(new Error(`transient ${code}`), {
        code,
        type: 'server_error',
        ...extra,
      });
    }

    it('retries transient failures for retry-safe providers and returns the eventual success', async () => {
      const generateMock = jest
        .fn<Promise<ImageGenerationResponse>, any[]>()
        .mockRejectedValueOnce(transientError('NETWORK_ERROR'))
        .mockResolvedValueOnce(openaiSuccess);

      const service = makeOpenAIService(makeOpenAIAdapter(generateMock));
      const result = await service.generateImage(openaiRequest);

      expect(generateMock).toHaveBeenCalledTimes(2);
      expect(result).toBe(openaiSuccess);
    });

    it('retries PROVIDER_ERROR only for transient HTTP statuses', async () => {
      const retried = jest
        .fn<Promise<ImageGenerationResponse>, any[]>()
        .mockRejectedValueOnce(transientError('PROVIDER_ERROR', { status: 503 }))
        .mockResolvedValueOnce(openaiSuccess);
      await makeOpenAIService(makeOpenAIAdapter(retried)).generateImage(openaiRequest);
      expect(retried).toHaveBeenCalledTimes(2);

      const notRetried = jest
        .fn<Promise<ImageGenerationResponse>, any[]>()
        .mockRejectedValue(transientError('PROVIDER_ERROR', { status: 400 }));
      const result = (await makeOpenAIService(makeOpenAIAdapter(notRetried)).generateImage(
        openaiRequest
      )) as ImageFailureResponse;
      expect(notRetried).toHaveBeenCalledTimes(1);
      expect(result.object).toBe('error');
    });

    it('never retries non-retryable codes', async () => {
      const generateMock = jest
        .fn<Promise<ImageGenerationResponse>, any[]>()
        .mockRejectedValue(
          Object.assign(new Error('bad key'), {
            code: 'INVALID_API_KEY',
            type: 'authentication_error',
          })
        );

      const service = makeOpenAIService(makeOpenAIAdapter(generateMock));
      const result = (await service.generateImage(openaiRequest)) as ImageFailureResponse;

      expect(generateMock).toHaveBeenCalledTimes(1);
      expect(result.error.code).toBe('INVALID_API_KEY');
    });

    it('never retries providers marked retryable: false (genai-electron)', async () => {
      const generateMock = jest
        .fn<Promise<ImageGenerationResponse>, any[]>()
        .mockRejectedValue(transientError('RATE_LIMIT_EXCEEDED'));

      const service = new ImageService(async () => null, {
        adapters: { 'genai-electron-images': makeAdapter(generateMock) },
        logLevel: 'silent',
        retry: { initialDelayMs: 1 },
      });
      const result = (await service.generateImage(defaultRequest)) as ImageFailureResponse;

      expect(generateMock).toHaveBeenCalledTimes(1);
      expect(result.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('honors a per-call maxRetries: 0 override', async () => {
      const generateMock = jest
        .fn<Promise<ImageGenerationResponse>, any[]>()
        .mockRejectedValue(transientError('NETWORK_ERROR'));

      const service = makeOpenAIService(makeOpenAIAdapter(generateMock));
      await service.generateImage(openaiRequest, { maxRetries: 0 });

      expect(generateMock).toHaveBeenCalledTimes(1);
    });

    it('honors retryAfterMs from the failure envelope', async () => {
      const generateMock = jest
        .fn<Promise<ImageGenerationResponse>, any[]>()
        .mockRejectedValueOnce(transientError('RATE_LIMIT_EXCEEDED', { retryAfterMs: 60 }))
        .mockResolvedValueOnce(openaiSuccess);

      const service = makeOpenAIService(makeOpenAIAdapter(generateMock), {
        initialDelayMs: 1,
        maxDelayMs: 500,
      });
      const started = Date.now();
      const result = await service.generateImage(openaiRequest);

      expect(result).toBe(openaiSuccess);
      expect(generateMock).toHaveBeenCalledTimes(2);
      expect(Date.now() - started).toBeGreaterThanOrEqual(50);
    });

    it('never retries aborts', async () => {
      const generateMock = jest
        .fn<Promise<ImageGenerationResponse>, any[]>()
        .mockRejectedValue(
          Object.assign(new Error('aborted'), {
            code: 'REQUEST_ABORTED',
            type: 'abort_error',
          })
        );

      const service = makeOpenAIService(makeOpenAIAdapter(generateMock));
      const result = (await service.generateImage(openaiRequest)) as ImageFailureResponse;

      expect(generateMock).toHaveBeenCalledTimes(1);
      expect(result.error.code).toBe('REQUEST_ABORTED');
    });

    it('propagates retryAfterMs onto the failure envelope', async () => {
      const generateMock = jest
        .fn<Promise<ImageGenerationResponse>, any[]>()
        .mockRejectedValue(transientError('RATE_LIMIT_EXCEEDED', { retryAfterMs: 3000 }));

      const service = makeOpenAIService(makeOpenAIAdapter(generateMock), { maxRetries: 0 });
      const result = (await service.generateImage(openaiRequest)) as ImageFailureResponse;

      expect(result.error.retryAfterMs).toBe(3000);
    });
  });

  describe('per-call timeoutMs', () => {
    it('threads timeoutMs into the adapter generate config', async () => {
      let receivedTimeout: number | undefined = -1;
      const service = makeService(
        makeAdapter(async (config) => {
          receivedTimeout = config.timeoutMs;
          return successResponse;
        })
      );

      await service.generateImage(defaultRequest, { timeoutMs: 12345 });
      expect(receivedTimeout).toBe(12345);

      await service.generateImage(defaultRequest);
      expect(receivedTimeout).toBeUndefined();
    });
  });

  describe('cancellation', () => {
    it('short-circuits with REQUEST_ABORTED when the signal is already aborted', async () => {
      const generateMock = jest.fn(async () => successResponse);
      const service = makeService(makeAdapter(generateMock));

      const controller = new AbortController();
      controller.abort();

      const result = (await service.generateImage(defaultRequest, {
        signal: controller.signal,
      })) as ImageFailureResponse;

      expect(result.object).toBe('error');
      expect(result.error).toMatchObject({
        code: 'REQUEST_ABORTED',
        type: 'abort_error',
      });
      expect(generateMock).not.toHaveBeenCalled();
    });

    it('passes the signal through to the adapter', async () => {
      let receivedSignal: AbortSignal | undefined;
      const service = makeService(
        makeAdapter(async (config) => {
          receivedSignal = config.signal;
          return successResponse;
        })
      );

      const controller = new AbortController();
      await service.generateImage(defaultRequest, { signal: controller.signal });

      expect(receivedSignal).toBe(controller.signal);
    });

    it('MockImageAdapter throws an abort-typed error for an aborted signal', async () => {
      const adapter = new MockImageAdapter();
      const controller = new AbortController();
      controller.abort();

      await expect(
        adapter.generate({
          request: defaultRequest,
          resolvedPrompt: 'A serene mountain lake',
          settings: { width: 512, height: 512, responseFormat: 'buffer' } as any,
          apiKey: null,
          signal: controller.signal,
        })
      ).rejects.toMatchObject({
        code: 'REQUEST_ABORTED',
        type: 'abort_error',
      });
    });
  });
});
