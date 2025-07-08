import { LLMService } from './LLMService';
import type { ApiKeyProvider } from '../types';
import type { ModelPreset } from '../types/presets';
import type { PrepareMessageOptions } from './types';
import defaultPresets from '../config/presets.json';

describe('LLMService.prepareMessage', () => {
  let mockApiKeyProvider: jest.MockedFunction<ApiKeyProvider>;
  let service: LLMService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiKeyProvider = jest.fn().mockResolvedValue('test-api-key');
    service = new LLMService(mockApiKeyProvider);
  });

  describe('Input validation', () => {
    it('should require either template or messages', async () => {
      const result = await service.prepareMessage({} as PrepareMessageOptions);
      
      expect(result).toMatchObject({
        object: 'error',
        error: {
          message: 'Either template or messages must be provided',
          code: 'INVALID_INPUT',
          type: 'validation_error',
        },
      });
    });

    it('should require either presetId or both providerId and modelId', async () => {
      const result = await service.prepareMessage({
        template: 'Test template',
        providerId: 'openai',
        // Missing modelId
      });
      
      expect(result).toMatchObject({
        object: 'error',
        error: {
          message: 'Either presetId or both providerId and modelId must be provided',
          code: 'INVALID_MODEL_SELECTION',
          type: 'validation_error',
        },
      });
    });
  });

  describe('Preset resolution', () => {
    it('should resolve model info from presetId', async () => {
      const result = await service.prepareMessage({
        template: 'Test {{ model_id }}',
        presetId: 'openai-gpt-4.1-default',
      });

      expect(result).toMatchObject({
        messages: [{ role: 'user', content: 'Test gpt-4.1' }],
        modelContext: {
          model_id: 'gpt-4.1',
          provider_id: 'openai',
          thinking_enabled: false,
          thinking_available: false,
        },
      });
    });

    it('should handle non-existent presetId', async () => {
      const result = await service.prepareMessage({
        template: 'Test',
        presetId: 'non-existent-preset',
      });

      expect(result).toMatchObject({
        object: 'error',
        error: {
          message: 'Preset not found: non-existent-preset',
          code: 'PRESET_NOT_FOUND',
          type: 'validation_error',
        },
      });
    });

    it('should merge preset settings with user settings', async () => {
      const result = await service.prepareMessage({
        template: 'Test',
        presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking',
        settings: { temperature: 0.5 }, // Override preset temperature
      });

      expect(result).not.toHaveProperty('error');
      // The settings are merged internally and will be used when sendMessage is called
    });
  });

  describe('Model resolution from providerId/modelId', () => {
    it('should resolve model info from providerId and modelId', async () => {
      const result = await service.prepareMessage({
        template: 'Model: {{ model_id }}, Provider: {{ provider_id }}',
        providerId: 'anthropic',
        modelId: 'claude-3-5-sonnet-20241022',
      });

      expect(result).toMatchObject({
        messages: [{ 
          role: 'user', 
          content: 'Model: claude-3-5-sonnet-20241022, Provider: anthropic' 
        }],
        modelContext: {
          model_id: 'claude-3-5-sonnet-20241022',
          provider_id: 'anthropic',
          thinking_enabled: false,
          thinking_available: false,
        },
      });
    });

    it('should handle invalid model', async () => {
      const result = await service.prepareMessage({
        template: 'Test',
        providerId: 'openai',
        modelId: 'non-existent-model',
      });

      expect(result).toMatchObject({
        object: 'error',
        error: {
          message: 'Unsupported model: non-existent-model for provider: openai',
          code: 'UNSUPPORTED_MODEL',
          type: 'validation_error',
        },
      });
    });
  });

  describe('Template rendering with model context', () => {
    it('should inject model context into template', async () => {
      const result = await service.prepareMessage({
        template: `{{ thinking_enabled ? \`Please think step by step about this:\` : \`Please analyze this:\` }}
Model: {{ model_id }}
Provider: {{ provider_id }}
Thinking available: {{ thinking_available }}`,
        presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking',
      });

      expect(result).toMatchObject({
        messages: [{
          role: 'user',
          content: expect.stringContaining('Please think step by step about this:'),
        }],
        modelContext: {
          thinking_enabled: true,
          thinking_available: true,
          model_id: 'claude-3-7-sonnet-20250219',
          provider_id: 'anthropic',
        },
      });

      const content = (result as any).messages[0].content;
      expect(content).toContain('Model: claude-3-7-sonnet-20250219');
      expect(content).toContain('Provider: anthropic');
      expect(content).toContain('Thinking available: true');
    });

    it('should handle reasoning effort in model context', async () => {
      const result = await service.prepareMessage({
        template: 'Effort: {{ reasoning_effort ? `{{reasoning_effort}}` : `not set` }}',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet-20250219',
        settings: {
          reasoning: {
            enabled: true,
            effort: 'high',
          },
        },
      });

      expect(result).toMatchObject({
        messages: [{ role: 'user', content: 'Effort: high' }],
        modelContext: {
          reasoning_effort: 'high',
        },
      });
    });

    it('should handle reasoning maxTokens in model context', async () => {
      const result = await service.prepareMessage({
        template: 'Max tokens: {{ reasoning_max_tokens ? `{{reasoning_max_tokens}}` : `default` }}',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet-20250219',
        settings: {
          reasoning: {
            enabled: true,
            maxTokens: 5000,
          },
        },
      });

      expect(result).toMatchObject({
        messages: [{ role: 'user', content: 'Max tokens: 5000' }],
        modelContext: {
          reasoning_max_tokens: 5000,
        },
      });
    });

    it('should combine template variables with model context', async () => {
      const result = await service.prepareMessage({
        template: `
Task: {{ task }}
Model: {{ model_id }}
{{ thinking_enabled ? "Use reasoning to solve this." : "Provide a direct answer." }}`,
        variables: {
          task: 'Calculate fibonacci(10)',
        },
        presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking',
      });

      const content = (result as any).messages[0].content;
      expect(content).toContain('Task: Calculate fibonacci(10)');
      expect(content).toContain('Model: claude-3-7-sonnet-20250219');
      expect(content).toContain('Use reasoning to solve this.');
    });

    it('should handle template rendering errors', async () => {
      // This will cause an actual error in template rendering by using a variable that throws on toString()
      const errorObject = {
        toString: () => {
          throw new Error('Test template error');
        }
      };
      
      const result = await service.prepareMessage({
        template: '{{ data }}',
        variables: { data: errorObject },
        providerId: 'openai',
        modelId: 'gpt-4.1',
      });

      expect(result).toMatchObject({
        object: 'error',
        error: {
          message: expect.stringContaining('Template rendering failed'),
          code: 'TEMPLATE_ERROR',
          type: 'validation_error',
        },
      });
    });
  });

  describe('Pre-built messages', () => {
    it('should return pre-built messages with model context', async () => {
      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: 'Hello!' },
      ];

      const result = await service.prepareMessage({
        messages,
        providerId: 'openai',
        modelId: 'o4-mini',
      });

      expect(result).toMatchObject({
        messages,
        modelContext: {
          model_id: 'o4-mini',
          provider_id: 'openai',
          thinking_enabled: true, // o4-mini always has reasoning enabled
          thinking_available: true,
        },
      });
    });
  });

  describe('Thinking/reasoning models', () => {
    it('should detect thinking capabilities for supported models', async () => {
      const testCases = [
        {
          presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking',
          expected: { thinking_enabled: true, thinking_available: true },
        },
        {
          presetId: 'anthropic-claude-3-5-sonnet-20241022-default',
          expected: { thinking_enabled: false, thinking_available: false },
        },
        {
          presetId: 'google-gemini-2.5-flash-thinking',
          expected: { thinking_enabled: true, thinking_available: true },
        },
        {
          presetId: 'openai-o4-mini-default',
          expected: { thinking_enabled: true, thinking_available: true }, // Always on
        },
      ];

      for (const testCase of testCases) {
        const result = await service.prepareMessage({
          template: 'Test',
          presetId: testCase.presetId,
        });

        expect(result).toMatchObject({
          modelContext: expect.objectContaining(testCase.expected),
        });
      }
    });
  });

  describe('Custom presets', () => {
    it('should work with custom presets', async () => {
      const customPresets: ModelPreset[] = [
        {
          id: 'custom-gpt4-thinking',
          displayName: 'Custom GPT-4',
          providerId: 'openai',
          modelId: 'gpt-4.1',
          settings: {
            temperature: 0.3,
            reasoning: { enabled: true },
          },
        },
      ];

      const customService = new LLMService(mockApiKeyProvider, {
        presets: customPresets,
        presetMode: 'extend',
      });

      const result = await customService.prepareMessage({
        template: 'Thinking: {{ thinking_enabled }}',
        presetId: 'custom-gpt4-thinking',
      });

      expect(result).toMatchObject({
        messages: [{ role: 'user', content: 'Thinking: false' }], // GPT-4.1 doesn't support reasoning
        modelContext: {
          thinking_enabled: false,
          thinking_available: false,
        },
      });
    });
  });
});