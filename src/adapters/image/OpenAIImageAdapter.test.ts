/**
 * Tests for OpenAIImageAdapter
 */

import { OpenAIImageAdapter } from './OpenAIImageAdapter';
import type {
  ImageGenerationRequest,
  ResolvedImageGenerationSettings,
} from '../../types/image';

// Mock the OpenAI SDK
jest.mock('openai');
import OpenAI from 'openai';

// Mock fetch for URL-based responses
global.fetch = jest.fn() as jest.Mock;

describe('OpenAIImageAdapter', () => {
  let adapter: OpenAIImageAdapter;
  let mockOpenAIClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new OpenAIImageAdapter();

    // Mock OpenAI client
    mockOpenAIClient = {
      images: {
        generate: jest.fn(),
      },
    };

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAIClient);
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default settings', () => {
      const adapter = new OpenAIImageAdapter();
      expect(adapter.id).toBe('openai-images');
      expect(adapter.supports.defaultModelId).toBe('gpt-image-1-mini');
    });

    it('should accept custom baseURL', () => {
      const adapter = new OpenAIImageAdapter({
        baseURL: 'https://custom.openai.com/v1',
      });
      expect(adapter).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const adapter = new OpenAIImageAdapter({
        timeout: 120000,
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('API Key Validation', () => {
    it('should validate correct OpenAI API key format', () => {
      expect(adapter.validateApiKey('sk-1234567890abcdefghij')).toBe(true);
      expect(adapter.validateApiKey('sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe(true);
    });

    it('should reject invalid API key formats', () => {
      expect(adapter.validateApiKey('invalid-key')).toBe(false);
      expect(adapter.validateApiKey('sk-short')).toBe(false);
      expect(adapter.validateApiKey('')).toBe(false);
      expect(adapter.validateApiKey('api-1234567890abcdefghij')).toBe(false);
    });
  });

  describe('gpt-image-1-mini Generation', () => {
    it('should generate image with gpt-image-1-mini and base64 response', async () => {
      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [
          {
            b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 50,
        },
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1-mini',
        prompt: 'A cute otter',
        count: 1,
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      const result = await adapter.generate({
        request,
        resolvedPrompt: 'A cute otter',
        settings,
        apiKey: 'sk-test123456789012345',
      });

      expect(result.object).toBe('image.result');
      expect(result.providerId).toBe('openai-images');
      expect(result.modelId).toBe('gpt-image-1-mini');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].mimeType).toBe('image/png');
      expect(Buffer.isBuffer(result.data[0].data)).toBe(true);
      expect(result.usage?.inputTokens).toBe(10);
      expect(result.usage?.outputTokens).toBe(50);
    });

    it('should pass OpenAI-specific settings for gpt-image-1-mini', async () => {
      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: 'test-base64-data' }],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1-mini',
        prompt: 'Test prompt',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1536,
        height: 1024,
        quality: 'high',
        responseFormat: 'buffer',
        style: 'vivid',
        openai: {
          outputFormat: 'webp',
          background: 'transparent',
          moderation: 'low',
          outputCompression: 85,
        },
      } as any;

      await adapter.generate({
        request,
        resolvedPrompt: 'Test prompt',
        settings,
        apiKey: 'sk-test123456789012345',
      });

      const callArgs = mockOpenAIClient.images.generate.mock.calls[0][0];
      expect(callArgs.output_format).toBe('webp');
      expect(callArgs.background).toBe('transparent');
      expect(callArgs.moderation).toBe('low');
      expect(callArgs.output_compression).toBe(85);
    });
  });

  describe('dall-e-3 Generation', () => {
    it('should generate image with dall-e-3 and b64_json response', async () => {
      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [
          {
            b64_json: 'test-base64-image-data',
          },
        ],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A majestic mountain',
        count: 1,
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1792,
        height: 1024,
        quality: 'hd',
        responseFormat: 'buffer',
        style: 'natural',
      };

      const result = await adapter.generate({
        request,
        resolvedPrompt: 'A majestic mountain',
        settings,
        apiKey: 'sk-test123456789012345',
      });

      expect(result.object).toBe('image.result');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].mimeType).toBe('image/png');

      const callArgs = mockOpenAIClient.images.generate.mock.calls[0][0];
      expect(callArgs.model).toBe('dall-e-3');
      expect(callArgs.quality).toBe('hd');
      expect(callArgs.style).toBe('natural');
      expect(callArgs.response_format).toBe('b64_json');
    });

    it('should generate image with dall-e-3 and URL response', async () => {
      const mockImageBuffer = Buffer.from('fake-image-data');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockImageBuffer.buffer,
      });

      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [
          {
            url: 'https://example.com/generated-image.png',
          },
        ],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'Test prompt',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'standard',
        responseFormat: 'url',
        style: 'vivid',
      };

      const result = await adapter.generate({
        request,
        resolvedPrompt: 'Test prompt',
        settings,
        apiKey: 'sk-test123456789012345',
      });

      expect(result.data[0].url).toBe('https://example.com/generated-image.png');
      expect(Buffer.isBuffer(result.data[0].data)).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/generated-image.png');

      const callArgs = mockOpenAIClient.images.generate.mock.calls[0][0];
      expect(callArgs.response_format).toBe('url');
    });

    it('should reject dall-e-3 with n > 1', async () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'Test',
        count: 2,
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'standard',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: 'Test',
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow('dall-e-3 only supports generating 1 image at a time');
    });
  });

  describe('dall-e-2 Generation', () => {
    it('should generate multiple images with dall-e-2', async () => {
      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [
          { b64_json: 'image1-base64' },
          { b64_json: 'image2-base64' },
          { b64_json: 'image3-base64' },
        ],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-2',
        prompt: 'Multiple cats',
        count: 3,
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 512,
        height: 512,
        quality: 'standard',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      const result = await adapter.generate({
        request,
        resolvedPrompt: 'Multiple cats',
        settings,
        apiKey: 'sk-test123456789012345',
      });

      expect(result.data).toHaveLength(3);
      expect(result.data[0].index).toBe(0);
      expect(result.data[1].index).toBe(1);
      expect(result.data[2].index).toBe(2);

      const callArgs = mockOpenAIClient.images.generate.mock.calls[0][0];
      expect(callArgs.model).toBe('dall-e-2');
      expect(callArgs.n).toBe(3);
    });
  });

  describe('Prompt Length Validation', () => {
    it('should accept prompts within gpt-image-1 limit (32K)', async () => {
      const longPrompt = 'a'.repeat(30000);

      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: 'test' }],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1',
        prompt: longPrompt,
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: longPrompt,
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).resolves.toBeDefined();
    });

    it('should reject prompts exceeding gpt-image-1 limit', async () => {
      const tooLongPrompt = 'a'.repeat(33000);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1',
        prompt: tooLongPrompt,
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: tooLongPrompt,
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow('Prompt too long for model gpt-image-1');
    });

    it('should reject prompts exceeding dall-e-3 limit (4K)', async () => {
      const tooLongPrompt = 'a'.repeat(4500);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: tooLongPrompt,
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'standard',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: tooLongPrompt,
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow('Prompt too long for model dall-e-3');
    });

    it('should reject prompts exceeding dall-e-2 limit (1K)', async () => {
      const tooLongPrompt = 'a'.repeat(1100);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-2',
        prompt: tooLongPrompt,
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'standard',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: tooLongPrompt,
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow('Prompt too long for model dall-e-2');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when API key is missing', async () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1-mini',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: 'Test',
          settings,
          apiKey: null,
        })
      ).rejects.toThrow('OpenAI API key is required');
    });

    it('should handle authentication errors (401)', async () => {
      const authError: any = new Error('Invalid API key');
      authError.status = 401;

      mockOpenAIClient.images.generate.mockRejectedValue(authError);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1-mini',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: 'Test',
          settings,
          apiKey: 'sk-invalid',
        })
      ).rejects.toThrow();
    });

    it('should handle rate limit errors (429)', async () => {
      const rateLimitError: any = new Error('Rate limit exceeded');
      rateLimitError.status = 429;

      mockOpenAIClient.images.generate.mockRejectedValue(rateLimitError);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'standard',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: 'Test',
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow();
    });

    it('should handle insufficient credits errors (402)', async () => {
      const creditsError: any = new Error('Insufficient credits');
      creditsError.status = 402;

      mockOpenAIClient.images.generate.mockRejectedValue(creditsError);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: 'Test',
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow();
    });

    it('should handle server errors (500)', async () => {
      const serverError: any = new Error('Internal server error');
      serverError.status = 500;

      mockOpenAIClient.images.generate.mockRejectedValue(serverError);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-2',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 512,
        height: 512,
        quality: 'standard',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: 'Test',
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow();
    });

    it('should handle network connection errors', async () => {
      const networkError: any = new Error('Connection refused');
      networkError.code = 'ECONNREFUSED';

      mockOpenAIClient.images.generate.mockRejectedValue(networkError);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1-mini',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: 'Test',
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow();
    });

    it('should handle empty response data', async () => {
      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1-mini',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: 'Test',
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow('OpenAI API returned no images in response');
    });

    it('should handle URL fetch failures', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [
          {
            url: 'https://example.com/missing-image.png',
          },
        ],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'standard',
        responseFormat: 'url',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: 'Test',
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow('Failed to fetch image from URL');
    });

    it('should handle response with neither url nor b64_json for dall-e models', async () => {
      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [
          {
            // Missing both url and b64_json
          },
        ],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-2',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 512,
        height: 512,
        quality: 'standard',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await expect(
        adapter.generate({
          request,
          resolvedPrompt: 'Test',
          settings,
          apiKey: 'sk-test123456789012345',
        })
      ).rejects.toThrow('OpenAI response contained neither url nor b64_json');
    });
  });

  describe('Response Processing', () => {
    it('should correctly process base64 images', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const mockResponse = {
        created: 1234567890,
        data: [{ b64_json: base64Data }],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      const result = await adapter.generate({
        request,
        resolvedPrompt: 'Test',
        settings,
        apiKey: 'sk-test123456789012345',
      });

      expect(result.created).toBe(1234567890);
      expect(result.data[0].b64Json).toBe(base64Data);
      expect(Buffer.isBuffer(result.data[0].data)).toBe(true);
      expect(result.data[0].data.toString('base64')).toBe(base64Data);
    });

    it('should include prompt in generated images', async () => {
      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: 'test-data' }],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1-mini',
        prompt: 'Original prompt text',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      const result = await adapter.generate({
        request,
        resolvedPrompt: 'Original prompt text',
        settings,
        apiKey: 'sk-test123456789012345',
      });

      expect(result.data[0].prompt).toBe('Original prompt text');
    });

    it('should infer MIME type from URL extension', async () => {
      const mockImageBuffer = Buffer.from('fake-jpeg-data');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockImageBuffer.buffer,
      });

      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [
          { url: 'https://example.com/image.jpeg' },
        ],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'standard',
        responseFormat: 'url',
        style: 'vivid',
      };

      const result = await adapter.generate({
        request,
        resolvedPrompt: 'Test',
        settings,
        apiKey: 'sk-test123456789012345',
      });

      expect(result.data[0].mimeType).toBe('image/jpeg');
    });
  });

  describe('Settings Parameters', () => {
    it('should pass user parameter for tracking', async () => {
      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: 'test' }],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        quality: 'standard',
        responseFormat: 'buffer',
        style: 'vivid',
        user: 'user-12345',
      };

      await adapter.generate({
        request,
        resolvedPrompt: 'Test',
        settings,
        apiKey: 'sk-test123456789012345',
      });

      const callArgs = mockOpenAIClient.images.generate.mock.calls[0][0];
      expect(callArgs.user).toBe('user-12345');
    });

    it('should handle various size formats', async () => {
      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: 'test' }],
      };

      mockOpenAIClient.images.generate.mockResolvedValue(mockResponse);

      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'gpt-image-1-mini',
        prompt: 'Test',
      };

      const settings: ResolvedImageGenerationSettings = {
        width: 1536,
        height: 1024,
        quality: 'auto',
        responseFormat: 'buffer',
        style: 'vivid',
      };

      await adapter.generate({
        request,
        resolvedPrompt: 'Test',
        settings,
        apiKey: 'sk-test123456789012345',
      });

      const callArgs = mockOpenAIClient.images.generate.mock.calls[0][0];
      expect(callArgs.size).toBe('1536x1024');
    });
  });
});
