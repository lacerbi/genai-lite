import { MistralClientAdapter } from './MistralClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type { LLMResponse, LLMFailureResponse } from '../types';

// Mock complete function
let mockComplete: jest.Mock;

// Mock the entire '@mistralai/mistralai' module
jest.mock('@mistralai/mistralai', () => {
  return {
    Mistral: jest.fn().mockImplementation(() => ({
      chat: {
        complete: (...args: any[]) => mockComplete(...args),
      },
    })),
  };
});

// Import after mock setup
import { Mistral } from '@mistralai/mistralai';
const MockMistral = Mistral as jest.MockedClass<typeof Mistral>;

describe('MistralClientAdapter', () => {
  let adapter: MistralClientAdapter;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    // Reset mocks before each test
    MockMistral.mockClear();
    mockComplete = jest.fn();

    adapter = new MistralClientAdapter();
    basicRequest = {
      providerId: 'mistral',
      modelId: 'mistral-small-latest',
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
    it('should format the request correctly and call the Mistral API', async () => {
      // Setup mock response
      mockComplete.mockResolvedValueOnce({
        id: 'chat-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you today?'
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      });

      const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      // Verify Mistral was instantiated with the API key
      expect(MockMistral).toHaveBeenCalledWith({
        apiKey: 'test-api-key-12345678901234567890',
        serverURL: undefined
      });

      // Verify the complete method was called with correct parameters
      expect(mockComplete).toHaveBeenCalledWith({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 100,
        topP: 1
      });

      // Verify the response
      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.id).toBe('chat-123');
      expect(successResponse.provider).toBe('mistral');
      expect(successResponse.model).toBe('mistral-small-latest');
      expect(successResponse.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(successResponse.usage?.total_tokens).toBe(30);
    });

    it('should handle system messages correctly', async () => {
      basicRequest.messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' }
      ];

      mockComplete.mockResolvedValueOnce({
        id: 'chat-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finishReason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' }
        ]
      }));
    });

    it('should handle stop sequences correctly', async () => {
      basicRequest.settings.stopSequences = ['END', 'STOP'];

      mockComplete.mockResolvedValueOnce({
        id: 'chat-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finishReason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
        stop: ['END', 'STOP']
      }));
    });

    it('should use custom baseURL when provided', async () => {
      const customAdapter = new MistralClientAdapter({ baseURL: 'https://custom.mistral.api.com' });

      mockComplete.mockResolvedValueOnce({
        id: 'chat-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finishReason: 'stop'
        }]
      });

      await customAdapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      expect(MockMistral).toHaveBeenCalledWith(expect.objectContaining({
        serverURL: 'https://custom.mistral.api.com'
      }));
    });

    it('should not include frequency_penalty or presence_penalty (not supported by Mistral)', async () => {
      basicRequest.settings.frequencyPenalty = 0.5;
      basicRequest.settings.presencePenalty = 0.5;

      mockComplete.mockResolvedValueOnce({
        id: 'chat-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finishReason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      // Verify that frequency_penalty and presence_penalty are NOT included
      const callArgs = mockComplete.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('frequency_penalty');
      expect(callArgs).not.toHaveProperty('presence_penalty');
      expect(callArgs).not.toHaveProperty('frequencyPenalty');
      expect(callArgs).not.toHaveProperty('presencePenalty');
    });

    describe('error handling', () => {
      it('should handle authentication errors (401)', async () => {
        const apiError = new Error('Invalid API key');
        (apiError as any).status = 401;
        mockComplete.mockRejectedValueOnce(apiError);

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
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle insufficient credits errors (402)', async () => {
        const apiError = new Error('Insufficient credits');
        (apiError as any).status = 402;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INSUFFICIENT_CREDITS);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle model not found errors (404)', async () => {
        const apiError = new Error('The model does not exist');
        (apiError as any).status = 404;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle model not available errors (400)', async () => {
        const apiError = new Error('Model not available for this request');
        (apiError as any).status = 400;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
      });

      it('should handle context length exceeded errors', async () => {
        const apiError = new Error('Context length exceeded: maximum token limit');
        (apiError as any).status = 400;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED);
      });

      it('should handle server errors (500)', async () => {
        const apiError = new Error('Internal server error');
        (apiError as any).status = 500;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.PROVIDER_ERROR);
        expect(errorResponse.error.type).toBe('server_error');
      });

      it('should handle network errors', async () => {
        const networkError = new Error('Network error');
        (networkError as any).code = 'ECONNREFUSED';
        mockComplete.mockRejectedValueOnce(networkError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(errorResponse.error.type).toBe('connection_error');
      });

      it('should handle unknown errors', async () => {
        mockComplete.mockRejectedValueOnce(new Error('Unknown error'));

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
        expect(errorResponse.error.message).toContain('Unknown error');
      });
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key format', () => {
      // Valid Mistral API keys (32+ alphanumeric characters)
      expect(adapter.validateApiKey('12345678901234567890123456789012')).toBe(true);
      expect(adapter.validateApiKey('abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
      expect(adapter.validateApiKey('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789012345678')).toBe(true);

      // Invalid API keys
      expect(adapter.validateApiKey('invalid')).toBe(false); // Too short
      expect(adapter.validateApiKey('')).toBe(false); // Empty
      expect(adapter.validateApiKey('1234567890123456789012345678901')).toBe(false); // 31 chars - too short
      expect(adapter.validateApiKey('sk-or-v1-test-key')).toBe(false); // Contains hyphen
      expect(adapter.validateApiKey('key_with_underscore_1234567890')).toBe(false); // Contains underscore
    });
  });

  describe('getAdapterInfo', () => {
    it('should return correct adapter information', () => {
      const info = adapter.getAdapterInfo();

      expect(info.providerId).toBe('mistral');
      expect(info.name).toBe('Mistral Client Adapter');
      expect(info.version).toBeDefined();
      expect(info.baseURL).toBe('https://api.mistral.ai');
    });

    it('should return custom baseURL when configured', () => {
      const customAdapter = new MistralClientAdapter({ baseURL: 'https://custom.api.com' });
      const info = customAdapter.getAdapterInfo();

      expect(info.baseURL).toBe('https://custom.api.com');
    });
  });
});
