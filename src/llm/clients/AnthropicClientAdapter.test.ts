import Anthropic from '@anthropic-ai/sdk';
import { AnthropicClientAdapter } from './AnthropicClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type { LLMResponse, LLMFailureResponse } from '../types';

// Mock the entire '@anthropic-ai/sdk' module
jest.mock('@anthropic-ai/sdk');

// Cast the mocked module to allow setting up mock implementations
const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

describe('AnthropicClientAdapter', () => {
  let adapter: AnthropicClientAdapter;
  let mockCreate: jest.Mock;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    // Reset mocks before each test
    MockAnthropic.mockClear();
    mockCreate = jest.fn();
    
    // Mock the messages.create method
    MockAnthropic.prototype.messages = {
      create: mockCreate,
    } as any;

    adapter = new AnthropicClientAdapter();
    basicRequest = {
      providerId: 'anthropic',
      modelId: 'claude-3-5-sonnet-20241022',
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
    it('should format the request correctly and call the Anthropic API', async () => {
      // Setup mock response
      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{
          type: 'text',
          text: 'Hello! How can I help you today?'
        }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 20
        }
      });

      const response = await adapter.sendMessage(basicRequest, 'test-api-key');

      // Verify Anthropic was instantiated with the API key
      expect(MockAnthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: undefined
      });

      // Verify the create method was called with correct parameters
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
        temperature: 0.7,
        top_p: 1
      });

      // Verify the response
      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.id).toBe('msg_123');
      expect(successResponse.provider).toBe('anthropic');
      expect(successResponse.model).toBe('claude-3-5-sonnet-20241022');
      expect(successResponse.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(successResponse.usage?.total_tokens).toBe(30);
    });

    it('should handle system messages by merging into first user message', async () => {
      basicRequest.messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' }
      ];

      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 15, output_tokens: 5 }
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      // System message should be sent as separate system parameter
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        system: 'You are a helpful assistant.',
        messages: [{
          role: 'user',
          content: 'Hello'
        }]
      }));
    });

    it('should handle stop sequences correctly', async () => {
      basicRequest.settings.stopSequences = ['END', 'STOP'];

      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 10 }
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        stop_sequences: ['END', 'STOP']
      }));
    });

    it('should handle multi-turn conversations', async () => {
      basicRequest.messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' }
      ];

      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: "I'm doing well, thanks!" }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 10 }
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' }
        ]
      }));
    });

    it('should map stop_reason correctly', async () => {
      const stopReasons = [
        { anthropic: 'end_turn', expected: 'stop' },
        { anthropic: 'max_tokens', expected: 'length' },
        { anthropic: 'stop_sequence', expected: 'stop' },
        { anthropic: 'unknown_reason', expected: 'other' }
      ];

      for (const { anthropic, expected } of stopReasons) {
        mockCreate.mockResolvedValueOnce({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-5-sonnet-20241022',
          content: [{ type: 'text', text: 'Response' }],
          stop_reason: anthropic,
          usage: { input_tokens: 10, output_tokens: 10 }
        });

        const response = await adapter.sendMessage(basicRequest, 'test-api-key');
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].finish_reason).toBe(expected);
      }
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

      it('should handle context length errors', async () => {
        // Create a mock error that simulates Anthropic.APIError
        const apiError = Object.assign(new Error('Message is too long'), {
          status: 400,
          constructor: { name: 'APIError' }
        });
        Object.setPrototypeOf(apiError, Anthropic.APIError.prototype);
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle invalid model errors', async () => {
        const apiError = new Error('Model not found');
        (apiError as any).status = 404;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle credit errors', async () => {
        const apiError = new Error('Insufficient credits');
        (apiError as any).status = 402;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INSUFFICIENT_CREDITS);
        expect(errorResponse.error.type).toBe('rate_limit_error');
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
        (networkError as any).code = 'ENOTFOUND';
        mockCreate.mockRejectedValueOnce(networkError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(errorResponse.error.type).toBe('connection_error');
      });
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key format', () => {
      // Valid Anthropic API key format - must start with 'sk-ant-' and be at least 30 chars
      expect(adapter.validateApiKey('sk-ant-api01-test123456789012345')).toBe(true);
      expect(adapter.validateApiKey('sk-ant-api03-test123456789012345')).toBe(true);
      
      // Invalid formats
      expect(adapter.validateApiKey('invalid')).toBe(false);
      expect(adapter.validateApiKey('')).toBe(false);
      expect(adapter.validateApiKey('sk-test')).toBe(false); // OpenAI format
      expect(adapter.validateApiKey('sk-ant-test123')).toBe(false); // Too short
    });
  });

  describe('getAdapterInfo', () => {
    it('should return correct adapter information', () => {
      const info = adapter.getAdapterInfo();
      
      expect(info.providerId).toBe('anthropic');
      expect(info.name).toBe('Anthropic Client Adapter');
      expect(info.version).toBeDefined();
      // supportedModels is not part of the interface
    });
  });
});