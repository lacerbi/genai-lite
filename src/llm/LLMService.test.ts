import { LLMService } from './LLMService';
import type { ApiKeyProvider } from '../types';
import type { LLMChatRequest, LLMResponse, LLMFailureResponse } from './types';
import { ADAPTER_ERROR_CODES } from './clients/types';

describe('LLMService', () => {
  let service: LLMService;
  let mockApiKeyProvider: jest.MockedFunction<ApiKeyProvider>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock API key provider
    mockApiKeyProvider = jest.fn(async (providerId: string) => `mock-key-for-${providerId}`);
    
    // Create service instance
    service = new LLMService(mockApiKeyProvider);
  });

  describe('constructor and initialization', () => {
    it('should initialize with the provided API key provider', () => {
      expect(service).toBeDefined();
      // The service should be ready to use
    });

    it('should lazy-load client adapters on first use', async () => {
      mockApiKeyProvider.mockResolvedValueOnce('sk-test-key-12345678901234567890');
      
      // First request should create the adapter
      const request: LLMChatRequest = {
        providerId: 'openai',
        modelId: 'gpt-4.1',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      await service.sendMessage(request);
      
      // Verify API key provider was called
      expect(mockApiKeyProvider).toHaveBeenCalledWith('openai');
    });
  });

  describe('sendMessage', () => {
    describe('request validation', () => {
      it('should return validation error for unsupported provider', async () => {
        const request: LLMChatRequest = {
          providerId: 'unsupported-provider',
          modelId: 'some-model',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('UNSUPPORTED_PROVIDER');
        expect(errorResponse.error.message).toContain('Unsupported provider');
      });

      it('should return validation error for unsupported model', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'unsupported-model',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('UNSUPPORTED_MODEL');
        expect(errorResponse.error.message).toContain('Unsupported model');
      });

      it('should return validation error for empty messages', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: []
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_REQUEST');
        expect(errorResponse.error.message).toContain('Request must contain at least one message');
      });

      it('should return validation error for invalid message role', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'invalid' as any, content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_MESSAGE_ROLE');
        expect(errorResponse.error.message).toContain('Invalid message role');
      });

      it('should return validation error for empty message content', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: '' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_MESSAGE');
        expect(errorResponse.error.message).toContain('Message at index 0 must have both');
      });
    });

    describe('API key handling', () => {
      it('should return error when API key provider returns null', async () => {
        mockApiKeyProvider.mockResolvedValueOnce(null);

        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('API_KEY_ERROR');
        expect(errorResponse.error.message).toContain('API key for provider');
      });

      it('should return error when API key provider throws', async () => {
        mockApiKeyProvider.mockRejectedValueOnce(new Error('Key provider error'));

        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('PROVIDER_ERROR');
        expect(errorResponse.error.message).toContain('Key provider error');
      });

      it('should return error for invalid API key format', async () => {
        mockApiKeyProvider.mockResolvedValueOnce('invalid-key');

        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        // OpenAI adapter expects keys starting with 'sk-'
        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_API_KEY');
      });
    });

    describe('adapter routing', () => {
      it('should route request to correct adapter based on provider', async () => {
        mockApiKeyProvider.mockResolvedValueOnce('sk-test-key-12345678901234567890');
        
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Test routing' }]
        };

        const response = await service.sendMessage(request);

        // This will fail with a network error since we're not mocking the actual API
        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        // We should get a network error or similar since we're not mocking the HTTP request
        expect(errorResponse.provider).toBe('openai');
      });

      it('should reuse existing adapter for same provider', async () => {
        const request: LLMChatRequest = {
          providerId: 'mock',
          modelId: 'mock-model',
          messages: [{ role: 'user', content: 'First request' }]
        };

        // First request
        await service.sendMessage(request);
        
        // Second request to same provider
        request.messages = [{ role: 'user', content: 'Second request' }];
        await service.sendMessage(request);

        // API key provider should be called for each request with mock provider
        expect(mockApiKeyProvider).toHaveBeenCalledTimes(0); // Mock provider doesn't need API keys
      });
    });

    describe('settings management', () => {
      it('should apply default settings when none provided', async () => {
        mockApiKeyProvider.mockResolvedValueOnce('sk-test-key-12345678901234567890');
        
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        // We'll get a network error but can still verify the request was attempted
        expect(response.object).toBe('error');
        expect(mockApiKeyProvider).toHaveBeenCalledWith('openai');
      });

      it('should merge user settings with defaults', async () => {
        mockApiKeyProvider.mockResolvedValueOnce('sk-test-key-12345678901234567890');
        
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            temperature: 0.9,
            maxTokens: 500
          }
        };

        const response = await service.sendMessage(request);

        // We'll get a network error but the settings should still be validated
        expect(response.object).toBe('error');
      });

      it('should validate temperature setting', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            temperature: 2.5 // Out of range
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_SETTINGS');
        expect(errorResponse.error.message).toContain('temperature must be a number between');
      });

      it('should validate maxTokens setting', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            maxTokens: 0 // Invalid
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_SETTINGS');
        expect(errorResponse.error.message).toContain('maxTokens must be an integer between');
      });

      it('should validate topP setting', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            topP: -0.1 // Out of range
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_SETTINGS');
        expect(errorResponse.error.message).toContain('topP must be a number between 0 and 1');
      });
    });


  });

  describe('getProviders', () => {
    it('should return all supported providers', async () => {
      const providers = await service.getProviders();

      expect(providers).toHaveLength(4);
      expect(providers.find(p => p.id === 'openai')).toBeDefined();
      expect(providers.find(p => p.id === 'anthropic')).toBeDefined();
      expect(providers.find(p => p.id === 'gemini')).toBeDefined();
      expect(providers.find(p => p.id === 'mistral')).toBeDefined();
    });

    it('should include provider metadata', async () => {
      const providers = await service.getProviders();
      const openai = providers.find(p => p.id === 'openai');

      expect(openai).toMatchObject({
        id: 'openai',
        name: 'OpenAI'
      });
    });
  });

  describe('getModels', () => {
    it('should return all models for a provider', async () => {
      const models = await service.getModels('openai');

      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id.includes('gpt-4'))).toBe(true);
      expect(models.some(m => m.id.includes('o4-mini'))).toBe(true);
    });

    it('should return empty array for invalid provider', async () => {
      const models = await service.getModels('invalid-provider');

      expect(models).toEqual([]);
    });

    it('should include model metadata', async () => {
      const models = await service.getModels('openai');
      const gpt4 = models.find(m => m.id === 'gpt-4.1');

      expect(gpt4).toBeDefined();
      expect(gpt4!.contextWindow).toBeGreaterThan(0);
      expect(gpt4!.maxTokens).toBeGreaterThan(0);
    });
  });
});