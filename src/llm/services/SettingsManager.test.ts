import { SettingsManager } from './SettingsManager';
import type { LLMSettings, ModelInfo, ProviderInfo } from '../types';
import { getDefaultSettingsForModel } from '../config';

jest.mock('../config', () => ({
  getDefaultSettingsForModel: jest.fn().mockReturnValue({
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.9,
    stopSequences: [],
    frequencyPenalty: 0,
    presencePenalty: 0,
    user: '',
    supportsSystemMessage: true,
    geminiSafetySettings: [],
    reasoning: {
      enabled: false,
      effort: undefined,
      maxTokens: undefined,
      exclude: false,
    },
    thinkingExtraction: {
      enabled: true,
      tag: 'thinking',
    },
  }),
}));

describe('SettingsManager', () => {
  let settingsManager: SettingsManager;

  beforeEach(() => {
    settingsManager = new SettingsManager();
    jest.clearAllMocks();
  });

  describe('mergeSettingsForModel', () => {
    it('should return default settings when no request settings provided', () => {
      const result = settingsManager.mergeSettingsForModel('gpt-4.1', 'openai');

      expect(getDefaultSettingsForModel).toHaveBeenCalledWith('gpt-4.1', 'openai');
      expect(result).toEqual({
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9,
        stopSequences: [],
        frequencyPenalty: 0,
        presencePenalty: 0,
        user: '',
        supportsSystemMessage: true,
        geminiSafetySettings: [],
        reasoning: {
          enabled: false,
          effort: undefined,
          maxTokens: undefined,
          exclude: false,
        },
        thinkingExtraction: {
          enabled: true,
          tag: 'thinking',
        },
      });
    });

    it('should merge user settings with defaults', () => {
      const userSettings: Partial<LLMSettings> = {
        temperature: 0.9,
        maxTokens: 500,
      };

      const result = settingsManager.mergeSettingsForModel('gpt-4.1', 'openai', userSettings);

      expect(result.temperature).toBe(0.9);
      expect(result.maxTokens).toBe(500);
      // Other settings should remain as defaults
      expect(result.topP).toBe(0.9);
      expect(result.frequencyPenalty).toBe(0);
    });

    it('should handle reasoning settings override', () => {
      const userSettings: Partial<LLMSettings> = {
        reasoning: {
          enabled: true,
          effort: 'high',
        },
      };

      const result = settingsManager.mergeSettingsForModel('claude-3-7-sonnet-20250219', 'anthropic', userSettings);

      expect(result.reasoning).toEqual({
        enabled: true,
        effort: 'high',
        maxTokens: undefined,
        exclude: false,
      });
    });

    it('should handle complex settings including Gemini safety settings', () => {
      const userSettings: Partial<LLMSettings> = {
        temperature: 0.5,
        geminiSafetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        ],
      };

      const result = settingsManager.mergeSettingsForModel('gemini-2.0-flash', 'gemini', userSettings);

      expect(result.temperature).toBe(0.5);
      expect(result.geminiSafetySettings).toHaveLength(1);
      expect(result.geminiSafetySettings[0]).toEqual({
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE',
      });
    });

    it('should handle all optional fields being provided', () => {
      const userSettings: Partial<LLMSettings> = {
        temperature: 0.8,
        maxTokens: 2000,
        topP: 0.95,
        stopSequences: ['END', 'STOP'],
        frequencyPenalty: 0.5,
        presencePenalty: -0.5,
        user: 'test-user',
        supportsSystemMessage: false,
        geminiSafetySettings: [],
        reasoning: {
          enabled: true,
          effort: 'medium',
          maxTokens: 5000,
          exclude: true,
        },
        thinkingExtraction: {
          enabled: false,
          tag: 'scratchpad',
        },
      };

      const result = settingsManager.mergeSettingsForModel('gpt-4.1', 'openai', userSettings);

      expect(result).toEqual(userSettings);
    });
  });

  describe('filterUnsupportedParameters', () => {
    const baseSettings: Required<LLMSettings> = {
      temperature: 0.7,
      maxTokens: 1000,
      topP: 0.9,
      stopSequences: [],
      frequencyPenalty: 0,
      presencePenalty: 0,
      user: '',
      supportsSystemMessage: true,
      geminiSafetySettings: [],
      reasoning: {
        enabled: false,
        effort: undefined,
        maxTokens: undefined,
        exclude: false,
      },
      thinkingExtraction: {
        enabled: true,
        tag: 'thinking',
      },
    };

    const mockModelInfo: ModelInfo = {
      id: 'test-model',
      providerId: 'test-provider' as any,
      name: 'Test Model',
      supportsPromptCache: false,
      contextWindow: 4096,
      maxTokens: 1000,
      reasoning: { supported: true }, // Add reasoning support to prevent it being stripped
    };

    const mockProviderInfo: ProviderInfo = {
      id: 'test-provider' as any,
      name: 'Test Provider',
    };

    it('should return settings unchanged when no parameters need filtering', () => {
      const result = settingsManager.filterUnsupportedParameters(
        baseSettings,
        mockModelInfo,
        mockProviderInfo
      );

      expect(result).toEqual(baseSettings);
    });

    it('should filter out provider-level unsupported parameters', () => {
      const providerWithExclusions: ProviderInfo = {
        ...mockProviderInfo,
        unsupportedParameters: ['frequencyPenalty', 'presencePenalty'],
      };

      const settingsWithPenalties = {
        ...baseSettings,
        frequencyPenalty: 0.5,
        presencePenalty: -0.5,
      };

      const result = settingsManager.filterUnsupportedParameters(
        settingsWithPenalties,
        mockModelInfo,
        providerWithExclusions
      );

      expect(result.frequencyPenalty).toBeUndefined();
      expect(result.presencePenalty).toBeUndefined();
      expect(result.temperature).toBe(0.7); // Should remain unchanged
    });

    it('should filter out model-level unsupported parameters', () => {
      const modelWithExclusions: ModelInfo = {
        ...mockModelInfo,
        unsupportedParameters: ['stopSequences', 'user'],
      };

      const settingsWithExcluded = {
        ...baseSettings,
        stopSequences: ['END'],
        user: 'test-user',
      };

      const result = settingsManager.filterUnsupportedParameters(
        settingsWithExcluded,
        modelWithExclusions,
        mockProviderInfo
      );

      expect(result.stopSequences).toBeUndefined();
      expect(result.user).toBeUndefined();
    });

    it('should combine provider and model exclusions', () => {
      const providerWithExclusions: ProviderInfo = {
        ...mockProviderInfo,
        unsupportedParameters: ['frequencyPenalty'],
      };

      const modelWithExclusions: ModelInfo = {
        ...mockModelInfo,
        unsupportedParameters: ['presencePenalty', 'stopSequences'],
      };

      const settingsWithAll = {
        ...baseSettings,
        frequencyPenalty: 0.5,
        presencePenalty: -0.5,
        stopSequences: ['END'],
      };

      const result = settingsManager.filterUnsupportedParameters(
        settingsWithAll,
        modelWithExclusions,
        providerWithExclusions
      );

      expect(result.frequencyPenalty).toBeUndefined();
      expect(result.presencePenalty).toBeUndefined();
      expect(result.stopSequences).toBeUndefined();
    });

    it('should remove reasoning settings for non-reasoning models', () => {
      const nonReasoningModel: ModelInfo = {
        ...mockModelInfo,
        reasoning: { supported: false },
      };

      const settingsWithReasoning = {
        ...baseSettings,
        reasoning: {
          enabled: true,
          effort: 'high' as const,
          maxTokens: 5000,
          exclude: false,
        },
      };

      const result = settingsManager.filterUnsupportedParameters(
        settingsWithReasoning,
        nonReasoningModel,
        mockProviderInfo
      );

      expect(result.reasoning).toBeUndefined();
    });

    it('should keep reasoning settings for reasoning-supported models', () => {
      const reasoningModel: ModelInfo = {
        ...mockModelInfo,
        reasoning: { supported: true },
      };

      const settingsWithReasoning = {
        ...baseSettings,
        reasoning: {
          enabled: true,
          effort: 'high' as const,
          maxTokens: 5000,
          exclude: false,
        },
      };

      const result = settingsManager.filterUnsupportedParameters(
        settingsWithReasoning,
        reasoningModel,
        mockProviderInfo
      );

      expect(result.reasoning).toEqual(settingsWithReasoning.reasoning);
    });

    it('should handle geminiSafetySettings appropriately', () => {
      const geminiProvider: ProviderInfo = {
        id: 'gemini' as any,
        name: 'Google Gemini',
      };

      const settingsWithGemini = {
        ...baseSettings,
        geminiSafetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH' as const, threshold: 'BLOCK_NONE' as const },
        ],
      };

      const result = settingsManager.filterUnsupportedParameters(
        settingsWithGemini,
        mockModelInfo,
        geminiProvider
      );

      // Should not be filtered out for Gemini provider
      expect(result.geminiSafetySettings).toEqual(settingsWithGemini.geminiSafetySettings);
    });
  });
});