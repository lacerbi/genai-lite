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

    it('should merge supportsSystemMessage from ModelInfo', () => {
      // Gemma model has supportsSystemMessage: false in its ModelInfo
      const gemmaSettings = getDefaultSettingsForModel('gemma-3-27b-it', 'gemini');
      expect(gemmaSettings.supportsSystemMessage).toBe(false);

      // GPT-4 model should have default supportsSystemMessage: true
      const gpt4Settings = getDefaultSettingsForModel('gpt-4.1', 'openai');
      expect(gpt4Settings.supportsSystemMessage).toBe(true);
    });

    it('should merge all ModelInfo fields that have LLMSettings equivalents', () => {
      // This test ensures that when a model has specific settings in its ModelInfo,
      // those settings are properly merged into the returned LLMSettings.
      // This prevents bugs where model-level config doesn't flow to request settings.

      // Get a model that we know has specific overrides
      const gemmaSettings = getDefaultSettingsForModel('gemma-3-27b-it', 'gemini');
      const modelInfo = getModelById('gemma-3-27b-it', 'gemini');

      // Verify maxTokens from ModelInfo flows through
      if (modelInfo?.maxTokens !== undefined) {
        expect(gemmaSettings.maxTokens).toBe(modelInfo.maxTokens);
      }

      // Verify supportsSystemMessage from ModelInfo flows through
      if (modelInfo?.supportsSystemMessage !== undefined) {
        expect(gemmaSettings.supportsSystemMessage).toBe(modelInfo.supportsSystemMessage);
      }

      // Verify reasoning settings from ModelInfo flow through for reasoning models
      const claudeSettings = getDefaultSettingsForModel('claude-sonnet-4-20250514', 'anthropic');
      const claudeInfo = getModelById('claude-sonnet-4-20250514', 'anthropic');

      if (claudeInfo?.reasoning?.supported && claudeInfo.reasoning.enabledByDefault) {
        expect(claudeSettings.reasoning.enabled).toBe(true);
      }
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

    it('should validate reasoning settings', () => {
      // Invalid reasoning object
      expect(validateLLMSettings({ reasoning: 'invalid' as any })).toContain('reasoning must be an object');
      
      // Invalid enabled value
      expect(validateLLMSettings({ reasoning: { enabled: 'yes' as any } })).toContain('reasoning.enabled must be a boolean');
      
      // Invalid effort value
      expect(validateLLMSettings({ reasoning: { effort: 'maximum' as any } })).toContain("reasoning.effort must be 'high', 'medium', or 'low'");
      expect(validateLLMSettings({ reasoning: { effort: 'high' } })).toEqual([]);
      
      // Invalid maxTokens value
      expect(validateLLMSettings({ reasoning: { maxTokens: -100 } })).toContain('reasoning.maxTokens must be a non-negative integer');
      expect(validateLLMSettings({ reasoning: { maxTokens: 1.5 } })).toContain('reasoning.maxTokens must be a non-negative integer');
      expect(validateLLMSettings({ reasoning: { maxTokens: 5000 } })).toEqual([]);
      
      // Invalid exclude value
      expect(validateLLMSettings({ reasoning: { exclude: 'yes' as any } })).toContain('reasoning.exclude must be a boolean');
      
      // Valid reasoning settings
      expect(validateLLMSettings({ reasoning: { enabled: true, effort: 'medium', maxTokens: 10000, exclude: false } })).toEqual([]);
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