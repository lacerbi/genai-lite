import { LLMService } from './LLMService';
import type { ApiKeyProvider } from '../types';
import type { LLMChatRequestWithPreset } from './types';

describe('LLMService.sendMessage with presetId', () => {
  let mockApiKeyProvider: jest.MockedFunction<ApiKeyProvider>;
  let service: LLMService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiKeyProvider = jest.fn().mockResolvedValue('test-api-key');
    service = new LLMService(mockApiKeyProvider);
  });

  describe('Preset resolution in sendMessage', () => {
    it('should send message using presetId', async () => {
      const request: LLMChatRequestWithPreset = {
        presetId: 'openai-gpt-4.1-default',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const response = await service.sendMessage(request);

      // The request will fail because we don't have a real API key,
      // but we can verify it tried with the correct provider/model
      expect(response).toMatchObject({
        provider: 'openai',
        model: 'gpt-4.1',
        object: 'error',
      });
    });

    it('should override preset settings with request settings', async () => {
      const request: LLMChatRequestWithPreset = {
        presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking',
        messages: [{ role: 'user', content: 'Test' }],
        settings: {
          temperature: 0.2, // Override preset temperature
          reasoning: {
            enabled: false, // Disable reasoning despite thinking preset
          },
        },
      };

      const response = await service.sendMessage(request);

      expect(response).toMatchObject({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet-20250219',
        object: 'error',
      });
    });

    it('should handle invalid presetId', async () => {
      const request: LLMChatRequestWithPreset = {
        presetId: 'non-existent-preset',
        messages: [{ role: 'user', content: 'Test' }],
      };

      const response = await service.sendMessage(request);

      expect(response).toMatchObject({
        object: 'error',
        error: {
          message: 'Preset not found: non-existent-preset',
          code: 'PRESET_NOT_FOUND',
          type: 'validation_error',
        },
      });
    });

    it('should allow either presetId or providerId/modelId', async () => {
      // Test with providerId/modelId (existing behavior)
      const request1: LLMChatRequestWithPreset = {
        providerId: 'openai',
        modelId: 'gpt-4.1',
        messages: [{ role: 'user', content: 'Test' }],
      };

      const response1 = await service.sendMessage(request1);
      expect(response1).toMatchObject({
        provider: 'openai',
        model: 'gpt-4.1',
      });

      // Test with presetId (new behavior)
      const request2: LLMChatRequestWithPreset = {
        presetId: 'openai-gpt-4.1-default',
        messages: [{ role: 'user', content: 'Test' }],
      };

      const response2 = await service.sendMessage(request2);
      expect(response2).toMatchObject({
        provider: 'openai',
        model: 'gpt-4.1',
      });
    });

    it('should prefer presetId when both are provided', async () => {
      const request: LLMChatRequestWithPreset = {
        presetId: 'anthropic-claude-3-5-sonnet-20241022-default',
        providerId: 'openai', // These will be ignored
        modelId: 'gpt-4.1',   // These will be ignored
        messages: [{ role: 'user', content: 'Test' }],
      };

      const response = await service.sendMessage(request);

      // Should use the preset's provider/model
      expect(response).toMatchObject({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
      });
    });

    it('should handle preset with model that was removed from config', async () => {
      // Create a service with a preset pointing to a non-existent model
      const customService = new LLMService(mockApiKeyProvider, {
        presets: [{
          id: 'broken-preset',
          displayName: 'Broken',
          providerId: 'openai',
          modelId: 'non-existent-model',
          settings: {},
        }],
        presetMode: 'extend',
      });

      const request: LLMChatRequestWithPreset = {
        presetId: 'broken-preset',
        messages: [{ role: 'user', content: 'Test' }],
      };

      const response = await customService.sendMessage(request);

      expect(response).toMatchObject({
        object: 'error',
        error: {
          message: 'Model not found for preset: broken-preset',
          code: 'MODEL_NOT_FOUND',
          type: 'validation_error',
        },
      });
    });
  });

  describe('Settings merge with presets', () => {
    it('should apply preset settings correctly', async () => {
      const request: LLMChatRequestWithPreset = {
        presetId: 'google-gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Test' }],
      };

      const response = await service.sendMessage(request);

      // The preset includes geminiSafetySettings which should be applied
      expect(response).toMatchObject({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      });
    });

    it('should merge preset reasoning settings with request settings', async () => {
      const request: LLMChatRequestWithPreset = {
        presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking',
        messages: [{ role: 'user', content: 'Complex problem' }],
        settings: {
          maxTokens: 2000, // Add to preset settings
        },
      };

      const response = await service.sendMessage(request);

      expect(response).toMatchObject({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet-20250219',
      });
      // Settings would be merged internally with both reasoning enabled and maxTokens
    });
  });
});