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
