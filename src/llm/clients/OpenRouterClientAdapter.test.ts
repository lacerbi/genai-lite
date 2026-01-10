import OpenAI from 'openai';
import { OpenRouterClientAdapter } from './OpenRouterClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type { LLMResponse, LLMFailureResponse } from '../types';

// Mock the entire 'openai' module
jest.mock('openai');

// Cast the mocked module to allow setting up mock implementations
const MockOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

describe('OpenRouterClientAdapter', () => {
  let adapter: OpenRouterClientAdapter;
  let mockCreate: jest.Mock;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    // Reset mocks before each test
    MockOpenAI.mockClear();
    mockCreate = jest.fn();

    // Mock the chat.completions.create method
    MockOpenAI.prototype.chat = {
      completions: {
        create: mockCreate,
      },
    } as any;

    adapter = new OpenRouterClientAdapter();
    basicRequest = {
      providerId: 'openrouter',
      modelId: 'google/gemma-3-27b-it:free',
      messages: [{ role: 'user', content: 'Hello' }],
      settings: {
        temperature: 0.7,
        maxTokens: 100,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stopSequences: [],
        user: undefined as any,
        geminiSafetySettings: [],
        supportsSystemMessage: true,
        systemMessageFallback: { format: 'xml', tagName: 'system', separator: '---' },
        reasoning: {
          enabled: false,
          effort: undefined as any,
          maxTokens: undefined as any,
          exclude: false
        },
        thinkingTagFallback: {
          enabled: true,
          tagName: 'thinking'
        },
        openRouterProvider: undefined as any
      }
    };
  });

  describe('sendMessage', () => {
    it('should format the request correctly and call the OpenRouter API', async () => {
      // Setup mock response
      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you today?'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      });

      const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-api-key');

      // Verify OpenAI was instantiated with the API key and OpenRouter base URL
      expect(MockOpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-or-v1-test-api-key',
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {}
      });

      // Verify the create method was called with correct parameters
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'google/gemma-3-27b-it:free',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_tokens: 100,
        top_p: 1
      });

      // Verify the response
      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.id).toBe('gen-123');
      expect(successResponse.provider).toBe('openrouter');
      expect(successResponse.model).toBe('google/gemma-3-27b-it:free');
      expect(successResponse.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(successResponse.usage?.total_tokens).toBe(30);
    });

    it('should handle system messages correctly', async () => {
      basicRequest.messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' }
      ];

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' }
        ]
      }));
    });

    it('should handle stop sequences correctly', async () => {
      basicRequest.settings.stopSequences = ['END', 'STOP'];

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        stop: ['END', 'STOP']
      }));
    });

    it('should use custom baseURL when provided', async () => {
      const customAdapter = new OpenRouterClientAdapter({ baseURL: 'https://custom.openrouter.api.com' });

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await customAdapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(MockOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        baseURL: 'https://custom.openrouter.api.com'
      }));
    });

    it('should include custom headers when httpReferer and siteTitle are provided', async () => {
      const customAdapter = new OpenRouterClientAdapter({
        httpReferer: 'https://myapp.com',
        siteTitle: 'My App'
      });

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await customAdapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(MockOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        defaultHeaders: {
          'HTTP-Referer': 'https://myapp.com',
          'X-Title': 'My App'
        }
      }));
    });

    it('should include provider routing settings when openRouterProvider is set', async () => {
      basicRequest.settings.openRouterProvider = {
        order: ['Together', 'Fireworks'],
        ignore: ['Azure'],
        dataCollection: 'deny',
        requireParameters: true
      };

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        provider: {
          order: ['Together', 'Fireworks'],
          ignore: ['Azure'],
          data_collection: 'deny',
          require_parameters: true
        }
      }));
    });

    it('should handle partial provider routing settings', async () => {
      basicRequest.settings.openRouterProvider = {
        allow: ['Together']
      };

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        provider: {
          allow: ['Together']
        }
      }));
    });

    describe('error handling', () => {
      it('should handle authentication errors (401)', async () => {
        const apiError = new Error('Invalid API key');
        (apiError as any).status = 401;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'invalid-key');

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INVALID_API_KEY);
        expect(errorResponse.error.type).toBe('authentication_error');
        expect(errorResponse.error.message).toContain('Invalid API key');
      });

      it('should handle rate limit errors (429)', async () => {
        const apiError = new Error('Rate limit exceeded');
        (apiError as any).status = 429;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle insufficient credits errors (402)', async () => {
        const apiError = new Error('Insufficient credits');
        (apiError as any).status = 402;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INSUFFICIENT_CREDITS);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle model not found errors (404)', async () => {
        const apiError = new Error('The model does not exist');
        (apiError as any).status = 404;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle model not available errors (400)', async () => {
        const apiError = new Error('Model not available for this request');
        (apiError as any).status = 400;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
      });

      it('should handle server errors (500)', async () => {
        const apiError = new Error('Internal server error');
        (apiError as any).status = 500;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.PROVIDER_ERROR);
        expect(errorResponse.error.type).toBe('server_error');
      });

      it('should handle network errors', async () => {
        const networkError = new Error('Network error');
        (networkError as any).code = 'ECONNREFUSED';
        mockCreate.mockRejectedValueOnce(networkError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(errorResponse.error.type).toBe('connection_error');
      });

      it('should handle unknown errors', async () => {
        mockCreate.mockRejectedValueOnce(new Error('Unknown error'));

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
        expect(errorResponse.error.message).toContain('Unknown error');
      });
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key format', () => {
      // Valid OpenRouter API keys
      expect(adapter.validateApiKey('sk-or-v1-1234567890abcdef1234567890abcdef12345678')).toBe(true);
      expect(adapter.validateApiKey('sk-or-1234567890abcdef1234567890abcdef123456789')).toBe(true);

      // Invalid API keys
      expect(adapter.validateApiKey('invalid')).toBe(false);
      expect(adapter.validateApiKey('')).toBe(false);
      expect(adapter.validateApiKey('sk-test123456789')).toBe(false); // OpenAI format
      expect(adapter.validateApiKey('sk-or-short')).toBe(false); // Too short
    });
  });

  describe('getAdapterInfo', () => {
    it('should return correct adapter information', () => {
      const info = adapter.getAdapterInfo();

      expect(info.providerId).toBe('openrouter');
      expect(info.name).toBe('OpenRouter Client Adapter');
      expect(info.version).toBeDefined();
      expect(info.baseURL).toBe('https://openrouter.ai/api/v1');
    });

    it('should return custom baseURL when configured', () => {
      const customAdapter = new OpenRouterClientAdapter({ baseURL: 'https://custom.api.com' });
      const info = customAdapter.getAdapterInfo();

      expect(info.baseURL).toBe('https://custom.api.com');
    });
  });
});
