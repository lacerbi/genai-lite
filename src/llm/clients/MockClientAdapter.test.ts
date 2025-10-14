import { MockClientAdapter } from './MockClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type { LLMResponse, LLMFailureResponse } from '../types';

describe('MockClientAdapter', () => {
  let adapter: MockClientAdapter;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    adapter = new MockClientAdapter('openai');
    basicRequest = {
      providerId: 'openai',
      modelId: 'mock-model',
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
    it('should return a successful response for basic messages', async () => {
      const response = await adapter.sendMessage(basicRequest, 'test-key');
      
      expect(response.object).toBe('chat.completion');
      expect('error' in response).toBe(false);
      
      const successResponse = response as LLMResponse;
      expect(successResponse.provider).toBe('openai');
      expect(successResponse.model).toBe('mock-model');
      expect(successResponse.choices).toHaveLength(1);
      expect(successResponse.choices[0].message.role).toBe('assistant');
      expect(successResponse.choices[0].message.content).toContain('Hello');
      expect(successResponse.usage).toBeDefined();
      expect(successResponse.usage?.total_tokens).toBeGreaterThan(0);
    });

    describe('error simulations', () => {
      it('should simulate invalid API key error', async () => {
        basicRequest.messages[0].content = 'error_invalid_key';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INVALID_API_KEY);
        expect(errorResponse.error.type).toBe('authentication_error');
        expect((errorResponse.error as any).status).toBe(401);
      });

      it('should simulate rate limit error', async () => {
        basicRequest.messages[0].content = 'error_rate_limit';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.type).toBe('rate_limit_error');
        expect((errorResponse.error as any).status).toBe(429);
      });

      it('should simulate insufficient credits error', async () => {
        basicRequest.messages[0].content = 'error_credits';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INSUFFICIENT_CREDITS);
        expect(errorResponse.error.type).toBe('rate_limit_error');
        expect((errorResponse.error as any).status).toBe(402);
      });

      it('should simulate context length exceeded error', async () => {
        basicRequest.messages[0].content = 'error_context_length';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED);
        expect(errorResponse.error.type).toBe('invalid_request_error');
        expect((errorResponse.error as any).status).toBe(400);
      });

      it('should simulate model not found error', async () => {
        basicRequest.messages[0].content = 'error_model_not_found';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
        expect(errorResponse.error.type).toBe('invalid_request_error');
        expect((errorResponse.error as any).status).toBe(404);
      });

      it('should simulate content filter error', async () => {
        basicRequest.messages[0].content = 'error_content_filter';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.CONTENT_FILTER);
        expect(errorResponse.error.type).toBe('content_filter_error');
        expect((errorResponse.error as any).status).toBe(400);
      });

      it('should simulate network error', async () => {
        basicRequest.messages[0].content = 'error_network';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(errorResponse.error.type).toBe('connection_error');
        // Status is not included when it's 0
        expect((errorResponse.error as any).status).toBeUndefined();
      });

      it('should simulate generic provider error', async () => {
        basicRequest.messages[0].content = 'error_generic';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.PROVIDER_ERROR);
        expect(errorResponse.error.type).toBe('server_error');
        expect((errorResponse.error as any).status).toBe(500);
      });
    });

    describe('temperature effects', () => {
      it('should generate low temperature response', async () => {
        basicRequest.messages[0].content = 'test_temperature';
        basicRequest.settings.temperature = 0.2;
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].message.content).toContain('Low temperature');
        expect(successResponse.choices[0].message.content).toContain('deterministic');
      });

      it('should generate high temperature response', async () => {
        basicRequest.messages[0].content = 'test_temperature';
        basicRequest.settings.temperature = 0.9;
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].message.content).toContain('High temperature');
        expect(successResponse.choices[0].message.content).toContain('creative');
      });

      it('should generate moderate temperature response', async () => {
        basicRequest.messages[0].content = 'test_temperature';
        basicRequest.settings.temperature = 0.5;
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].message.content).toContain('Moderate temperature');
        expect(successResponse.choices[0].message.content).toContain('balances');
      });
    });

    describe('settings effects', () => {
      it('should respect maxTokens limit', async () => {
        basicRequest.messages[0].content = 'long detailed response please';
        basicRequest.settings.maxTokens = 10; // Very low limit
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const successResponse = response as LLMResponse;
        const content = successResponse.choices[0].message.content;
        const wordCount = content.split(' ').length;
        expect(wordCount).toBeLessThanOrEqual(10); // Should be truncated
        expect(content).toContain('...');
      });

      it('should respect stop sequences', async () => {
        basicRequest.messages[0].content = 'Hello world! This is a test. STOP More content here.';
        basicRequest.settings.stopSequences = ['STOP'];
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const successResponse = response as LLMResponse;
        const content = successResponse.choices[0].message.content;
        expect(content).not.toContain('More content here');
      });

      it('should generate settings test response', async () => {
        basicRequest.messages[0].content = 'test_settings';
        basicRequest.settings.stopSequences = []; // Empty stop sequences to avoid truncation
        basicRequest.settings.frequencyPenalty = 0.5;
        basicRequest.settings.presencePenalty = -0.5;
        basicRequest.settings.maxTokens = 500;
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const successResponse = response as LLMResponse;
        const content = successResponse.choices[0].message.content;
        expect(content).toContain('Temperature: 0.7');
        expect(content).toContain('Max Tokens: 500');
        expect(content).toContain('Stop Sequences: none'); // When empty, it shows "none"
        expect(content).toContain('Frequency Penalty: 0.5');
        expect(content).toContain('Presence Penalty: -0.5');
      });
    });

    describe('content-based responses', () => {
      it('should generate greeting response', async () => {
        basicRequest.messages[0].content = 'hello';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].message.content).toContain('Hello!');
        expect(successResponse.choices[0].message.content).toContain('mock LLM assistant');
      });

      it('should generate weather response', async () => {
        basicRequest.messages[0].content = 'What is the weather today?';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].message.content).toContain('weather');
        expect(successResponse.choices[0].message.content).toContain('72°F');
      });

      it('should generate code response', async () => {
        basicRequest.messages[0].content = 'Show me some code';
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].message.content).toContain('```javascript');
        expect(successResponse.choices[0].message.content).toContain('mockFunction');
      });

      it('should generate long response', async () => {
        basicRequest.messages[0].content = 'Give me a long detailed explanation';
        basicRequest.settings.maxTokens = 1000; // Allow long response
        const response = await adapter.sendMessage(basicRequest, 'test-key');
        
        const successResponse = response as LLMResponse;
        const content = successResponse.choices[0].message.content;
        expect(content.length).toBeGreaterThan(500);
        expect(content).toContain('Error Simulation');
        expect(content).toContain('Variable Length');
      });
    });

    it('should generate unique IDs for each response', async () => {
      const response1 = await adapter.sendMessage(basicRequest, 'test-key');
      const response2 = await adapter.sendMessage(basicRequest, 'test-key');
      
      expect((response1 as LLMResponse).id).not.toBe((response2 as LLMResponse).id);
    });

    it('should calculate token usage', async () => {
      basicRequest.messages[0].content = 'Calculate tokens for this message';
      const response = await adapter.sendMessage(basicRequest, 'test-key');
      
      const successResponse = response as LLMResponse;
      expect(successResponse.usage?.prompt_tokens).toBeGreaterThan(0);
      expect(successResponse.usage?.completion_tokens).toBeGreaterThan(0);
      expect(successResponse.usage?.total_tokens).toBe(
        (successResponse.usage?.prompt_tokens ?? 0) + (successResponse.usage?.completion_tokens ?? 0)
      );
    });
  });

  describe('validateApiKey', () => {
    it('should return true for non-empty API keys', () => {
      expect(adapter.validateApiKey('valid-key')).toBe(true);
      expect(adapter.validateApiKey('a')).toBe(true);
    });

    it('should return false for empty API keys', () => {
      expect(adapter.validateApiKey('')).toBe(false);
    });
  });

  describe('getAdapterInfo', () => {
    it('should return correct adapter information', () => {
      const info = adapter.getAdapterInfo();
      
      expect(info.providerId).toBe('openai');
      expect(info.name).toBe('Mock Client Adapter');
      expect(info.version).toBe('1.0.0');
      expect(info.supportedModels).toEqual(['mock-model-1', 'mock-model-2']);
    });

    it('should use custom provider ID', () => {
      const customAdapter = new MockClientAdapter('anthropic');
      const info = customAdapter.getAdapterInfo();
      
      expect(info.providerId).toBe('anthropic');
    });
  });
});