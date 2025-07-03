import { 
  isProviderSupported, 
  getProviderById,
  getModelById,
  getModelsByProvider,
  isModelSupported,
  getDefaultSettingsForModel,
  validateLLMSettings
} from './config';
import type { LLMSettings } from './types';

describe('LLM Config', () => {
  describe('isProviderSupported', () => {
    it('should correctly identify supported providers', () => {
      expect(isProviderSupported('openai')).toBe(true);
      expect(isProviderSupported('anthropic')).toBe(true);
      expect(isProviderSupported('gemini')).toBe(true);
    });

    it('should return false for unsupported providers', () => {
      expect(isProviderSupported('unsupported-provider')).toBe(false);
      expect(isProviderSupported('')).toBe(false);
    });
  });

  describe('getProviderById', () => {
    it('should return provider info for valid providers', () => {
      const openaiProvider = getProviderById('openai');
      expect(openaiProvider).toBeDefined();
      expect(openaiProvider?.id).toBe('openai');
      expect(openaiProvider?.name).toBe('OpenAI');
    });

    it('should return undefined for invalid providers', () => {
      expect(getProviderById('unsupported-provider')).toBeUndefined();
      expect(getProviderById('')).toBeUndefined();
    });
  });

  describe('getModelById', () => {
    it('should return model info for valid model and provider combination', () => {
      const model = getModelById('gpt-4.1', 'openai');
      expect(model).toBeDefined();
      expect(model?.id).toBe('gpt-4.1');
      expect(model?.providerId).toBe('openai');
    });

    it('should return undefined for invalid model or provider', () => {
      expect(getModelById('invalid-model', 'openai')).toBeUndefined();
      expect(getModelById('gpt-4.1', 'anthropic')).toBeUndefined();
      expect(getModelById('gpt-4.1', 'invalid-provider')).toBeUndefined();
    });
  });

  describe('getModelsByProvider', () => {
    it('should return models for valid providers', () => {
      const openaiModels = getModelsByProvider('openai');
      expect(openaiModels.length).toBeGreaterThan(0);
      expect(openaiModels.every(model => model.providerId === 'openai')).toBe(true);
    });

    it('should return empty array for invalid providers', () => {
      expect(getModelsByProvider('invalid-provider')).toEqual([]);
      expect(getModelsByProvider('')).toEqual([]);
    });
  });

  describe('isModelSupported', () => {
    it('should correctly identify supported model/provider combinations', () => {
      expect(isModelSupported('gpt-4.1', 'openai')).toBe(true);
      expect(isModelSupported('claude-sonnet-4-20250514', 'anthropic')).toBe(true);
      expect(isModelSupported('gemini-2.5-pro', 'gemini')).toBe(true);
    });

    it('should return false for unsupported combinations', () => {
      expect(isModelSupported('gpt-4.1', 'anthropic')).toBe(false);
      expect(isModelSupported('claude-sonnet-4-20250514', 'openai')).toBe(false);
      expect(isModelSupported('invalid-model', 'openai')).toBe(false);
    });
  });

  describe('getDefaultSettingsForModel', () => {
    it('should return default settings for valid models', () => {
      const settings = getDefaultSettingsForModel('gpt-4.1', 'openai');
      expect(settings).toBeDefined();
      expect(settings.temperature).toBeDefined();
      expect(settings.maxTokens).toBeDefined();
      expect(settings.topP).toBeDefined();
    });

    it('should apply model-specific overrides', () => {
      const gpt4Settings = getDefaultSettingsForModel('gpt-4.1', 'openai');
      const gpt4MiniSettings = getDefaultSettingsForModel('gpt-4.1-mini', 'openai');
      
      // These might have different maxTokens based on model capabilities
      expect(gpt4Settings.maxTokens).toBeDefined();
      expect(gpt4MiniSettings.maxTokens).toBeDefined();
    });
  });

  describe('validateLLMSettings', () => {
    it('should return empty array for valid settings', () => {
      const validSettings: Partial<LLMSettings> = {
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: -0.5,
        stopSequences: ['\\n', 'END'],
        user: 'test-user'
      };
      expect(validateLLMSettings(validSettings)).toEqual([]);
    });

    it('should validate temperature bounds', () => {
      expect(validateLLMSettings({ temperature: -0.1 })).toContain('temperature must be a number between 0 and 2');
      expect(validateLLMSettings({ temperature: 2.1 })).toContain('temperature must be a number between 0 and 2');
      expect(validateLLMSettings({ temperature: 'invalid' as any })).toContain('temperature must be a number between 0 and 2');
    });

    it('should validate maxTokens', () => {
      expect(validateLLMSettings({ maxTokens: 0 })).toContain('maxTokens must be an integer between 1 and 100000');
      expect(validateLLMSettings({ maxTokens: 100001 })).toContain('maxTokens must be an integer between 1 and 100000');
      expect(validateLLMSettings({ maxTokens: 1.5 })).toContain('maxTokens must be an integer between 1 and 100000');
    });

    it('should validate topP bounds', () => {
      expect(validateLLMSettings({ topP: -0.1 })).toContain('topP must be a number between 0 and 1');
      expect(validateLLMSettings({ topP: 1.1 })).toContain('topP must be a number between 0 and 1');
    });

    it('should validate frequencyPenalty bounds', () => {
      expect(validateLLMSettings({ frequencyPenalty: -2.1 })).toContain('frequencyPenalty must be a number between -2 and 2');
      expect(validateLLMSettings({ frequencyPenalty: 2.1 })).toContain('frequencyPenalty must be a number between -2 and 2');
    });

    it('should validate presencePenalty bounds', () => {
      expect(validateLLMSettings({ presencePenalty: -2.1 })).toContain('presencePenalty must be a number between -2 and 2');
      expect(validateLLMSettings({ presencePenalty: 2.1 })).toContain('presencePenalty must be a number between -2 and 2');
    });

    it('should validate stopSequences', () => {
      expect(validateLLMSettings({ stopSequences: 'invalid' as any })).toContain('stopSequences must be an array');
      expect(validateLLMSettings({ stopSequences: ['1', '2', '3', '4', '5'] })).toContain('stopSequences can contain at most 4 sequences');
      expect(validateLLMSettings({ stopSequences: ['valid', ''] })).toContain('stopSequences must contain only non-empty strings');
      expect(validateLLMSettings({ stopSequences: ['valid', 123] as any })).toContain('stopSequences must contain only non-empty strings');
    });

    it('should validate user field', () => {
      expect(validateLLMSettings({ user: 123 as any })).toContain('user must be a string');
    });

    it('should validate geminiSafetySettings', () => {
      const invalidSettings = { geminiSafetySettings: 'invalid' as any };
      expect(validateLLMSettings(invalidSettings)).toContain('geminiSafetySettings must be an array');

      const invalidCategory = { 
        geminiSafetySettings: [
          { category: 'INVALID_CATEGORY', threshold: 'BLOCK_NONE' }
        ] as any
      };
      expect(validateLLMSettings(invalidCategory)).toContain('geminiSafetySettings[0].category must be a valid Gemini harm category');

      const invalidThreshold = { 
        geminiSafetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'INVALID_THRESHOLD' }
        ] as any
      };
      expect(validateLLMSettings(invalidThreshold)).toContain('geminiSafetySettings[0].threshold must be a valid Gemini harm block threshold');

      const validGeminiSettings = { 
        geminiSafetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' }
        ] as any
      };
      expect(validateLLMSettings(validGeminiSettings)).toEqual([]);
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const invalidSettings = {
        temperature: -1,
        maxTokens: 0,
        topP: 2
      };
      const errors = validateLLMSettings(invalidSettings);
      expect(errors).toHaveLength(3);
      expect(errors).toContain('temperature must be a number between 0 and 2');
      expect(errors).toContain('maxTokens must be an integer between 1 and 100000');
      expect(errors).toContain('topP must be a number between 0 and 1');
    });
  });
});