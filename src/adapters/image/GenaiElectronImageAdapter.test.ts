/**
 * Unit tests for GenaiElectronImageAdapter
 */

import { GenaiElectronImageAdapter } from './GenaiElectronImageAdapter';
import type {
  ImageGenerationRequest,
  ResolvedImageGenerationSettings,
  ImageProgressCallback,
} from '../../types/image';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('GenaiElectronImageAdapter', () => {
  let adapter: GenaiElectronImageAdapter;
  const defaultRequest: ImageGenerationRequest = {
    providerId: 'genai-electron-images',
    modelId: 'stable-diffusion',
    prompt: 'A serene mountain lake',
  };

  const defaultSettings: ResolvedImageGenerationSettings = {
    width: 512,
    height: 512,
    responseFormat: 'buffer',
    quality: 'standard',
    style: 'natural',
    diffusion: {
      steps: 20,
      cfgScale: 7.5,
      sampler: 'euler_a',
    },
  };

  beforeEach(() => {
    adapter = new GenaiElectronImageAdapter({
      baseURL: 'http://localhost:8081',
      timeout: 10000,
    });
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should use default configuration', () => {
      const defaultAdapter = new GenaiElectronImageAdapter();
      expect(defaultAdapter.id).toBe('genai-electron-images');
      expect(defaultAdapter.supports.supportsMultipleImages).toBe(true);
      expect(defaultAdapter.supports.supportsProgressEvents).toBe(true);
      expect(defaultAdapter.supports.supportsNegativePrompt).toBe(true);
    });

    it('should accept custom baseURL', () => {
      const customAdapter = new GenaiElectronImageAdapter({
        baseURL: 'http://custom:9000',
      });
      expect(customAdapter).toBeDefined();
      // baseURL is private, but we can test it via error messages
    });

    it('should accept custom timeout', () => {
      const customAdapter = new GenaiElectronImageAdapter({
        timeout: 60000,
      });
      expect(customAdapter).toBeDefined();
    });
  });

  describe('Request Building', () => {
    it('should build basic request payload with defaults', async () => {
      // Mock successful generation
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            result: {
              images: [
                {
                  image: Buffer.from('test').toString('base64'),
                  seed: 42,
                  width: 512,
                  height: 512,
                },
              ],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: defaultSettings,
        apiKey: null,
      });

      // Check POST request
      const postCall = mockFetch.mock.calls[0];
      expect(postCall[0]).toBe('http://localhost:8081/v1/images/generations');
      expect(postCall[1].method).toBe('POST');

      const body = JSON.parse(postCall[1].body);
      expect(body.prompt).toBe('Test prompt');
      expect(body.width).toBe(512);
      expect(body.height).toBe(512);
      expect(body.steps).toBe(20);
      expect(body.cfgScale).toBe(7.5);
      expect(body.sampler).toBe('euler_a');
      expect(body.count).toBe(1);
    });

    it('should include all diffusion settings', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 1024, height: 1024 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const settingsWithAll: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        responseFormat: 'buffer',
        quality: 'standard',
        style: 'natural',
        diffusion: {
          negativePrompt: 'blurry, low quality',
          steps: 30,
          cfgScale: 8.5,
          seed: 12345,
          sampler: 'dpm++2m',
        },
      };

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: settingsWithAll,
        apiKey: null,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.negativePrompt).toBe('blurry, low quality');
      expect(body.width).toBe(1024);
      expect(body.height).toBe(1024);
      expect(body.steps).toBe(30);
      expect(body.cfgScale).toBe(8.5);
      expect(body.seed).toBe(12345);
      expect(body.sampler).toBe('dpm++2m');
    });

    it('should parse size string into width/height', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 768, height: 768 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const settingsWithSize: ResolvedImageGenerationSettings = {
        width: 768,
        height: 768,
        responseFormat: 'buffer',
        quality: 'standard',
        style: 'natural',
        diffusion: {
          steps: 20,
          cfgScale: 7.5,
          sampler: 'euler_a',
        },
      };

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: settingsWithSize,
        apiKey: null,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.width).toBe(768);
      expect(body.height).toBe(768);
    });

    it('should handle count parameter for batching', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [
                { image: 'dGVzdA==', seed: 42, width: 512, height: 512 },
                { image: 'dGVzdDI=', seed: 43, width: 512, height: 512 },
                { image: 'dGVzdDM=', seed: 44, width: 512, height: 512 },
              ],
              format: 'png',
              timeTaken: 15000,
            },
          }),
        });

      await adapter.generate({
        request: { ...defaultRequest, count: 3 },
        resolvedPrompt: 'Test prompt',
        settings: defaultSettings,
        apiKey: null,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.count).toBe(3);
    });

    it('should use explicit width/height over parsed size', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 1024, height: 768 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const settingsWithBoth: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 768,
        responseFormat: 'buffer',
        quality: 'standard',
        style: 'natural',
        diffusion: {
          steps: 20,
          cfgScale: 7.5,
          sampler: 'euler_a',
        },
      };

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: settingsWithBoth,
        apiKey: null,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.width).toBe(1024);
      expect(body.height).toBe(768);
    });
  });

  describe('Async Polling Flow', () => {
    it('should handle immediate completion (no polling needed)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 512, height: 512 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const result = await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: defaultSettings,
        apiKey: null,
      });

      expect(result.object).toBe('image.result');
      expect(result.data.length).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2); // POST + 1 GET
    });

    it('should poll multiple times before completion', async () => {
      mockFetch
        // POST - start generation
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        // GET - pending
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        })
        // GET - in_progress
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'in_progress',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            progress: {
              currentStep: 10,
              totalSteps: 20,
              stage: 'diffusion',
              percentage: 50,
            },
          }),
        })
        // GET - complete
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 512, height: 512 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const result = await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: defaultSettings,
        apiKey: null,
      });

      expect(result.object).toBe('image.result');
      expect(mockFetch).toHaveBeenCalledTimes(4); // POST + 3 GETs
    });

    it('should invoke progress callback during polling', async () => {
      const progressCallback = jest.fn();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'in_progress',
            progress: {
              currentStep: 5,
              totalSteps: 20,
              stage: 'loading',
              percentage: 15,
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'in_progress',
            progress: {
              currentStep: 15,
              totalSteps: 20,
              stage: 'diffusion',
              percentage: 65,
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 512, height: 512 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const settingsWithProgress: ResolvedImageGenerationSettings = {
        ...defaultSettings,
        diffusion: {
          ...defaultSettings.diffusion!,
          onProgress: progressCallback,
        },
      };

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: settingsWithProgress,
        apiKey: null,
      });

      expect(progressCallback).toHaveBeenCalledTimes(2);
      expect(progressCallback).toHaveBeenNthCalledWith(1, {
        currentStep: 5,
        totalSteps: 20,
        stage: 'loading',
        percentage: 15,
      });
      expect(progressCallback).toHaveBeenNthCalledWith(2, {
        currentStep: 15,
        totalSteps: 20,
        stage: 'diffusion',
        percentage: 65,
      });
    });

    it('should handle all progress stages', async () => {
      const progressCallback = jest.fn();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'in_progress',
            progress: { currentStep: 3, totalSteps: 10, stage: 'loading', percentage: 10 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'in_progress',
            progress: { currentStep: 10, totalSteps: 20, stage: 'diffusion', percentage: 55 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'in_progress',
            progress: { currentStep: 0, totalSteps: 0, stage: 'decoding', percentage: 95 },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 512, height: 512 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const settingsWithProgress: ResolvedImageGenerationSettings = {
        ...defaultSettings,
        diffusion: {
          ...defaultSettings.diffusion!,
          onProgress: progressCallback,
        },
      };

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: settingsWithProgress,
        apiKey: null,
      });

      expect(progressCallback).toHaveBeenCalledTimes(3);

      // Verify all stages were reported
      const stages = progressCallback.mock.calls.map((call) => call[0].stage);
      expect(stages).toEqual(['loading', 'diffusion', 'decoding']);
    });
  });

  describe('Response Processing', () => {
    it('should convert single image result correctly', async () => {
      const imageBase64 = Buffer.from('fake-image-data').toString('base64');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: imageBase64, seed: 42, width: 1024, height: 768 }],
              format: 'png',
              timeTaken: 5823,
            },
          }),
        });

      const result = await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: defaultSettings,
        apiKey: null,
      });

      expect(result.object).toBe('image.result');
      expect(result.providerId).toBe('genai-electron-images');
      expect(result.modelId).toBe('stable-diffusion');
      expect(result.data.length).toBe(1);

      const image = result.data[0];
      expect(image.index).toBe(0);
      expect(image.mimeType).toBe('image/png');
      expect(image.data).toBeInstanceOf(Buffer);
      expect(image.data.toString()).toBe('fake-image-data');
      expect(image.b64Json).toBe(imageBase64);
      expect(image.seed).toBe(42);
      expect(image.metadata).toEqual({ width: 1024, height: 768 });

      expect(result.usage).toEqual({
        cost: 0,
        credits: 5823,
      });
    });

    it('should handle multiple images correctly', async () => {
      const image1 = Buffer.from('image1').toString('base64');
      const image2 = Buffer.from('image2').toString('base64');
      const image3 = Buffer.from('image3').toString('base64');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [
                { image: image1, seed: 42, width: 512, height: 512 },
                { image: image2, seed: 43, width: 512, height: 512 },
                { image: image3, seed: 44, width: 512, height: 512 },
              ],
              format: 'png',
              timeTaken: 15000,
            },
          }),
        });

      const result = await adapter.generate({
        request: { ...defaultRequest, count: 3 },
        resolvedPrompt: 'Test prompt',
        settings: defaultSettings,
        apiKey: null,
      });

      expect(result.data.length).toBe(3);

      expect(result.data[0].index).toBe(0);
      expect(result.data[0].seed).toBe(42);
      expect(result.data[0].data.toString()).toBe('image1');

      expect(result.data[1].index).toBe(1);
      expect(result.data[1].seed).toBe(43);
      expect(result.data[1].data.toString()).toBe('image2');

      expect(result.data[2].index).toBe(2);
      expect(result.data[2].seed).toBe(44);
      expect(result.data[2].data.toString()).toBe('image3');
    });

    it('should preserve prompt in response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 512, height: 512 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const result = await adapter.generate({
        request: { ...defaultRequest, prompt: 'Original prompt text' },
        resolvedPrompt: 'Test prompt',
        settings: defaultSettings,
        apiKey: null,
      });

      expect(result.data[0].prompt).toBe('Original prompt text');
    });
  });

  describe('Error Handling', () => {
    it('should handle POST request failure (start generation)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: { message: 'Server error', code: 'SERVER_ERROR' } }),
      });

      await expect(
        adapter.generate({
          request: defaultRequest,
          resolvedPrompt: 'Test prompt',
          settings: defaultSettings,
          apiKey: null,
        })
      ).rejects.toThrow(/Server error/);
    });

    it('should handle GET request failure (polling)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () =>
            JSON.stringify({ error: { message: 'Generation not found', code: 'NOT_FOUND' } }),
        });

      await expect(
        adapter.generate({
          request: defaultRequest,
          resolvedPrompt: 'Test prompt',
          settings: defaultSettings,
          apiKey: null,
        })
      ).rejects.toThrow(/Generation not found/);
    });

    it('should handle server busy error (503)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () =>
          JSON.stringify({
            error: {
              message: 'Server is busy generating another image',
              code: 'SERVER_BUSY',
            },
          }),
      });

      await expect(
        adapter.generate({
          request: defaultRequest,
          resolvedPrompt: 'Test prompt',
          settings: defaultSettings,
          apiKey: null,
        })
      ).rejects.toThrow(/busy/);
    });

    it('should handle generation error status', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'error',
            error: {
              message: 'Failed to spawn stable-diffusion.cpp',
              code: 'BACKEND_ERROR',
            },
          }),
        });

      await expect(
        adapter.generate({
          request: defaultRequest,
          resolvedPrompt: 'Test prompt',
          settings: defaultSettings,
          apiKey: null,
        })
      ).rejects.toThrow(/Failed to spawn/);
    });

    it('should handle network errors (ECONNREFUSED)', async () => {
      const networkError: any = new Error('connect ECONNREFUSED');
      networkError.code = 'ECONNREFUSED';
      mockFetch.mockRejectedValueOnce(networkError);

      await expect(
        adapter.generate({
          request: defaultRequest,
          resolvedPrompt: 'Test prompt',
          settings: defaultSettings,
          apiKey: null,
        })
      ).rejects.toThrow(/ECONNREFUSED/);
    });

    it('should handle timeout errors', async () => {
      const timeoutError: any = new Error('Request timeout');
      timeoutError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(timeoutError);

      await expect(
        adapter.generate({
          request: defaultRequest,
          resolvedPrompt: 'Test prompt',
          settings: defaultSettings,
          apiKey: null,
        })
      ).rejects.toThrow(/timeout/i);
    });

    it('should handle polling timeout', async () => {
      // Create adapter with very short timeout
      const shortTimeoutAdapter = new GenaiElectronImageAdapter({
        baseURL: 'http://localhost:8081',
        timeout: 100, // 100ms
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        // Keep returning in_progress forever
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'in_progress',
            progress: { currentStep: 1, totalSteps: 20, stage: 'diffusion', percentage: 5 },
          }),
        });

      await expect(
        shortTimeoutAdapter.generate({
          request: defaultRequest,
          resolvedPrompt: 'Test prompt',
          settings: defaultSettings,
          apiKey: null,
        })
      ).rejects.toThrow(/timeout/i);
    });

    it('should include baseURL in error messages for network errors', async () => {
      const customAdapter = new GenaiElectronImageAdapter({
        baseURL: 'http://custom-server:9999',
      });

      const networkError: any = new Error('connect ECONNREFUSED');
      networkError.code = 'ECONNREFUSED';
      mockFetch.mockRejectedValueOnce(networkError);

      await expect(
        customAdapter.generate({
          request: defaultRequest,
          resolvedPrompt: 'Test prompt',
          settings: defaultSettings,
          apiKey: null,
        })
      ).rejects.toThrow(/custom-server:9999/);
    });

    it('should handle missing result in complete status', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            // Missing result field
          }),
        });

      await expect(
        adapter.generate({
          request: defaultRequest,
          resolvedPrompt: 'Test prompt',
          settings: defaultSettings,
          apiKey: null,
        })
      ).rejects.toThrow(/no result available/);
    });
  });

  describe('Sampler Options', () => {
    it('should support euler_a sampler', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 512, height: 512 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const settingsWithSampler: ResolvedImageGenerationSettings = {
        ...defaultSettings,
        diffusion: {
          ...defaultSettings.diffusion!,
          sampler: 'euler_a',
        },
      };

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: settingsWithSampler,
        apiKey: null,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sampler).toBe('euler_a');
    });

    it('should support dpm++2m sampler', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 512, height: 512 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const settingsWithSampler: ResolvedImageGenerationSettings = {
        ...defaultSettings,
        diffusion: {
          ...defaultSettings.diffusion!,
          sampler: 'dpm++2m',
        },
      };

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: settingsWithSampler,
        apiKey: null,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sampler).toBe('dpm++2m');
    });
  });

  describe('Seed Handling', () => {
    it('should pass seed when specified', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 12345, width: 512, height: 512 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const settingsWithSeed: ResolvedImageGenerationSettings = {
        ...defaultSettings,
        diffusion: {
          ...defaultSettings.diffusion!,
          seed: 12345,
        },
      };

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: settingsWithSeed,
        apiKey: null,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.seed).toBe(12345);
    });

    it('should not include seed when undefined (random)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 98765, width: 512, height: 512 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: defaultSettings,
        apiKey: null,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.seed).toBeUndefined();
    });
  });

  describe('Negative Prompt', () => {
    it('should include negative prompt when specified', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'gen_123', status: 'pending', createdAt: Date.now() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'gen_123',
            status: 'complete',
            result: {
              images: [{ image: 'dGVzdA==', seed: 42, width: 512, height: 512 }],
              format: 'png',
              timeTaken: 5000,
            },
          }),
        });

      const settingsWithNegative: ResolvedImageGenerationSettings = {
        ...defaultSettings,
        diffusion: {
          ...defaultSettings.diffusion!,
          negativePrompt: 'blurry, low quality, distorted',
        },
      };

      await adapter.generate({
        request: defaultRequest,
        resolvedPrompt: 'Test prompt',
        settings: settingsWithNegative,
        apiKey: null,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.negativePrompt).toBe('blurry, low quality, distorted');
    });
  });
});
