import OpenAI from 'openai';
import { OpenAIClientAdapter } from './OpenAIClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type { LLMResponse, LLMFailureResponse } from '../types';

// Mock the entire 'openai' module
jest.mock('openai');

// Cast the mocked module to allow setting up mock implementations
const MockOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

describe('OpenAIClientAdapter', () => {
  let adapter: OpenAIClientAdapter;
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

    adapter = new OpenAIClientAdapter();
    basicRequest = {
      providerId: 'openai',
      modelId: 'gpt-4.1',
      messages: [{ role: 'user', content: 'Hello' }],
      settings: {
        temperature: 0.7,
        maxTokens: 100,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stopSequences: [],
        user: 'test-user',
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
        }
      }
    };
  });

  describe('sendMessage', () => {
    it('should format the request correctly and call the OpenAI API', async () => {
      // Setup mock response
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
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

      const response = await adapter.sendMessage(basicRequest, 'test-api-key');

      // Verify OpenAI was instantiated with the API key
      expect(MockOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: undefined
      });

      // Verify the create method was called with correct parameters
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_completion_tokens: 100,
        top_p: 1,
        user: 'test-user'
      });

      // Verify the response
      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.id).toBe('chatcmpl-123');
      expect(successResponse.provider).toBe('openai');
      expect(successResponse.model).toBe('gpt-4.1');
      expect(successResponse.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(successResponse.usage?.total_tokens).toBe(30);
    });

    it('should handle system messages correctly', async () => {
      basicRequest.messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' }
      ];

      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

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
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        stop: ['END', 'STOP']
      }));
    });

    it('should use custom baseURL when provided', async () => {
      const customAdapter = new OpenAIClientAdapter({ baseURL: 'https://custom.api.com' });

      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await customAdapter.sendMessage(basicRequest, 'test-api-key');

      expect(MockOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://custom.api.com'
      });
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

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle insufficient quota errors (429 with specific message)', async () => {
        const apiError = new Error('You exceeded your current quota, please check your plan and billing details');
        (apiError as any).status = 429;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        // Without special handling for quota messages, this is just a rate limit error
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle context length errors (400)', async () => {
        const apiError = new Error("This model's maximum context length is 4096 tokens");
        (apiError as any).status = 400;
        // Mock it as an OpenAI APIError
        Object.setPrototypeOf(apiError, OpenAI.APIError.prototype);
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle model not found errors (404)', async () => {
        const apiError = new Error('The model does not exist');
        (apiError as any).status = 404;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle server errors (500)', async () => {
        const apiError = new Error('Internal server error');
        (apiError as any).status = 500;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.PROVIDER_ERROR);
        expect(errorResponse.error.type).toBe('server_error');
      });

      it('should handle network errors', async () => {
        const networkError = new Error('Network error');
        (networkError as any).code = 'ECONNREFUSED';
        mockCreate.mockRejectedValueOnce(networkError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(errorResponse.error.type).toBe('connection_error');
      });

      it('should handle unknown errors', async () => {
        mockCreate.mockRejectedValueOnce(new Error('Unknown error'));

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
        expect(errorResponse.error.message).toContain('Unknown error');
      });
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key format', () => {
      expect(adapter.validateApiKey('sk-test123456789012345678')).toBe(true);
      expect(adapter.validateApiKey('sk-proj-test123456789012')).toBe(true);
      expect(adapter.validateApiKey('invalid')).toBe(false);
      expect(adapter.validateApiKey('')).toBe(false);
      expect(adapter.validateApiKey('sk-short')).toBe(false); // Too short
    });
  });

  describe('getAdapterInfo', () => {
    it('should return correct adapter information', () => {
      const info = adapter.getAdapterInfo();
      
      expect(info.providerId).toBe('openai');
      expect(info.name).toBe('OpenAI Client Adapter');
      expect(info.version).toBeDefined();
      // supportedModels is not part of the interface
    });
  });
});