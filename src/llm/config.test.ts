import {
  isProviderSupported,
  getProviderById,
  getModelById,
  getModelsByProvider,
  isModelSupported,
  getDefaultSettingsForModel,
  validateLLMSettings,
  detectGgufCapabilities,
  createFallbackModelInfo,
  KNOWN_GGUF_MODELS
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

    it('should validate topK', () => {
      expect(validateLLMSettings({ topK: -1 })).toContain('topK must be a non-negative integer');
      expect(validateLLMSettings({ topK: 1.5 })).toContain('topK must be a non-negative integer');
      expect(validateLLMSettings({ topK: 'invalid' as any })).toContain('topK must be a non-negative integer');
      expect(validateLLMSettings({ topK: 0 })).toEqual([]);
      expect(validateLLMSettings({ topK: 64 })).toEqual([]);
    });

    it('should validate minP bounds', () => {
      expect(validateLLMSettings({ minP: -0.1 })).toContain('minP must be a number between 0 and 1');
      expect(validateLLMSettings({ minP: 1.1 })).toContain('minP must be a number between 0 and 1');
      expect(validateLLMSettings({ minP: 0 })).toEqual([]);
      expect(validateLLMSettings({ minP: 0.05 })).toEqual([]);
    });

    it('should validate repeatPenalty', () => {
      expect(validateLLMSettings({ repeatPenalty: 0 })).toContain('repeatPenalty must be a positive number');
      expect(validateLLMSettings({ repeatPenalty: -1 })).toContain('repeatPenalty must be a positive number');
      expect(validateLLMSettings({ repeatPenalty: 'invalid' as any })).toContain('repeatPenalty must be a positive number');
      expect(validateLLMSettings({ repeatPenalty: 1.0 })).toEqual([]);
      expect(validateLLMSettings({ repeatPenalty: 1.3 })).toEqual([]);
    });

    it('should validate seed', () => {
      expect(validateLLMSettings({ seed: 1.5 })).toContain('seed must be an integer');
      expect(validateLLMSettings({ seed: 'invalid' as any })).toContain('seed must be an integer');
      expect(validateLLMSettings({ seed: -1 })).toEqual([]); // llama.cpp uses -1 for random
      expect(validateLLMSettings({ seed: 42 })).toEqual([]);
    });

    it('should validate logprobs and topLogprobs', () => {
      expect(validateLLMSettings({ logprobs: 'yes' as any })).toContain('logprobs must be a boolean');
      expect(validateLLMSettings({ logprobs: true })).toEqual([]);
      expect(validateLLMSettings({ topLogprobs: -1 })).toContain('topLogprobs must be an integer between 0 and 20');
      expect(validateLLMSettings({ topLogprobs: 21 })).toContain('topLogprobs must be an integer between 0 and 20');
      expect(validateLLMSettings({ topLogprobs: 2.5 })).toContain('topLogprobs must be an integer between 0 and 20');
      expect(validateLLMSettings({ topLogprobs: 20 })).toEqual([]);
    });

    it('should validate the llamacpp namespace', () => {
      expect(validateLLMSettings({ llamacpp: 'invalid' as any })).toContain('llamacpp must be an object');
      expect(validateLLMSettings({ llamacpp: { grammar: 123 as any } })).toContain('llamacpp.grammar must be a string (GBNF grammar)');
      expect(validateLLMSettings({ llamacpp: { chatTemplateKwargs: 'nope' as any } })).toContain('llamacpp.chatTemplateKwargs must be an object');
      expect(validateLLMSettings({ llamacpp: { chatTemplateKwargs: { bad: { nested: true } } as any } })).toContain('llamacpp.chatTemplateKwargs values must be strings, numbers, or booleans');
      expect(validateLLMSettings({
        llamacpp: { grammar: 'root ::= "yes"', chatTemplateKwargs: { enable_thinking: false } }
      })).toEqual([]);
    });

    it('should reject grammar together with structuredOutput', () => {
      const errors = validateLLMSettings({
        llamacpp: { grammar: 'root ::= "yes"' },
        structuredOutput: {
          name: 'answer',
          schema: { type: 'object', properties: {} },
        },
      });
      expect(errors.some((e) => e.includes('mutually exclusive'))).toBe(true);

      // Disabled structured output does not conflict
      const noConflict = validateLLMSettings({
        llamacpp: { grammar: 'root ::= "yes"' },
        structuredOutput: {
          enabled: false,
          name: 'answer',
          schema: { type: 'object', properties: {} },
        },
      });
      expect(noConflict.some((e) => e.includes('mutually exclusive'))).toBe(false);
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

    describe('structuredOutput validation', () => {
      it('should accept valid structuredOutput settings', () => {
        const validSettings = {
          structuredOutput: {
            name: 'person_info',
            schema: {
              type: 'object' as const,
              properties: {
                name: { type: 'string' as const },
                age: { type: 'integer' as const }
              },
              required: ['name', 'age']
            }
          }
        };
        expect(validateLLMSettings(validSettings)).toEqual([]);
      });

      it('should accept structuredOutput with all optional fields', () => {
        const validSettings = {
          structuredOutput: {
            name: 'test_schema',
            schema: {
              type: 'object' as const,
              properties: {
                value: { type: 'string' as const }
              }
            },
            enabled: true,
            strict: true,
            autoParse: false
          }
        };
        expect(validateLLMSettings(validSettings)).toEqual([]);
      });

      it('should reject non-object structuredOutput', () => {
        expect(validateLLMSettings({ structuredOutput: 'invalid' as any }))
          .toContain('structuredOutput must be an object');
        expect(validateLLMSettings({ structuredOutput: null as any }))
          .toContain('structuredOutput must be an object');
      });

      it('should require name field', () => {
        const missingName = {
          structuredOutput: {
            schema: { type: 'object' as const }
          } as any
        };
        expect(validateLLMSettings(missingName))
          .toContain('structuredOutput.name is required and must be a non-empty string');
      });

      it('should reject empty name', () => {
        const emptyName = {
          structuredOutput: {
            name: '   ',
            schema: { type: 'object' as const }
          }
        };
        expect(validateLLMSettings(emptyName))
          .toContain('structuredOutput.name is required and must be a non-empty string');
      });

      it('should reject non-string name', () => {
        const invalidName = {
          structuredOutput: {
            name: 123 as any,
            schema: { type: 'object' as const }
          }
        };
        expect(validateLLMSettings(invalidName))
          .toContain('structuredOutput.name is required and must be a non-empty string');
      });

      it('should require schema field', () => {
        const missingSchema = {
          structuredOutput: {
            name: 'test'
          } as any
        };
        expect(validateLLMSettings(missingSchema))
          .toContain('structuredOutput.schema is required and must be an object');
      });

      it('should reject non-object schema', () => {
        const invalidSchema = {
          structuredOutput: {
            name: 'test',
            schema: 'invalid' as any
          }
        };
        expect(validateLLMSettings(invalidSchema))
          .toContain('structuredOutput.schema is required and must be an object');
      });

      it('should require valid schema type', () => {
        const invalidType = {
          structuredOutput: {
            name: 'test',
            schema: { type: 'invalid' as any }
          }
        };
        expect(validateLLMSettings(invalidType))
          .toContain('structuredOutput.schema.type must be one of: object, array, string, number, boolean');
      });

      it('should accept all valid schema types', () => {
        const validTypes = ['object', 'array', 'string', 'number', 'boolean'] as const;
        for (const type of validTypes) {
          const settings = {
            structuredOutput: {
              name: 'test',
              schema: { type }
            }
          };
          expect(validateLLMSettings(settings)).toEqual([]);
        }
      });

      it('should reject non-boolean enabled', () => {
        const invalidEnabled = {
          structuredOutput: {
            name: 'test',
            schema: { type: 'object' as const },
            enabled: 'yes' as any
          }
        };
        expect(validateLLMSettings(invalidEnabled))
          .toContain('structuredOutput.enabled must be a boolean');
      });

      it('should reject non-boolean strict', () => {
        const invalidStrict = {
          structuredOutput: {
            name: 'test',
            schema: { type: 'object' as const },
            strict: 'yes' as any
          }
        };
        expect(validateLLMSettings(invalidStrict))
          .toContain('structuredOutput.strict must be a boolean');
      });

      it('should reject non-boolean autoParse', () => {
        const invalidAutoParse = {
          structuredOutput: {
            name: 'test',
            schema: { type: 'object' as const },
            autoParse: 'yes' as any
          }
        };
        expect(validateLLMSettings(invalidAutoParse))
          .toContain('structuredOutput.autoParse must be a boolean');
      });

      it('should return multiple errors for multiple invalid structuredOutput fields', () => {
        const multipleErrors = {
          structuredOutput: {
            name: '',
            schema: 'invalid' as any,
            enabled: 'yes' as any
          }
        };
        const errors = validateLLMSettings(multipleErrors);
        expect(errors.length).toBeGreaterThanOrEqual(3);
        expect(errors).toContain('structuredOutput.name is required and must be a non-empty string');
        expect(errors).toContain('structuredOutput.schema is required and must be an object');
        expect(errors).toContain('structuredOutput.enabled must be a boolean');
      });
    });
  });

  describe('Model structuredOutput capabilities', () => {
    it('should have structuredOutput capability on OpenAI models', () => {
      const model = getModelById('gpt-4.1', 'openai');
      expect(model?.structuredOutput).toBeDefined();
      expect(model?.structuredOutput?.supported).toBe(true);
      expect(model?.structuredOutput?.strictMode).toBe(true);
    });

    it('should have structuredOutput capability on Gemini models', () => {
      const model = getModelById('gemini-2.5-pro', 'gemini');
      expect(model?.structuredOutput).toBeDefined();
      expect(model?.structuredOutput?.supported).toBe(true);
    });

    it('should have structuredOutput capability on llama.cpp', () => {
      const model = getModelById('llamacpp', 'llamacpp');
      expect(model?.structuredOutput).toBeDefined();
      expect(model?.structuredOutput?.supported).toBe(true);
      expect(model?.structuredOutput?.notes).toContain('grammar support');
    });

    it('should have partial structuredOutput capability on Mistral (no strict mode)', () => {
      const model = getModelById('mistral-small-latest', 'mistral');
      expect(model?.structuredOutput).toBeDefined();
      expect(model?.structuredOutput?.supported).toBe(true);
      expect(model?.structuredOutput?.strictMode).toBe(false);
      expect(model?.structuredOutput?.notes).toContain('JSON mode only');
    });
  });

  describe('detectGgufCapabilities', () => {
    // Real GGUF filenames (unsloth/vendor releases) exercised end-to-end
    it('detects Qwen 3.5 models (hybrid thinking + vendor sampling)', () => {
      const caps = detectGgufCapabilities('Qwen3.5-4B-Q4_K_M.gguf');
      expect(caps).not.toBeNull();
      expect(caps?.reasoning?.supported).toBe(true);
      expect(caps?.reasoning?.canDisable).toBe(true);
      expect(caps?.localReasoning?.toggleKwarg).toBe('enable_thinking');
      expect(caps?.localReasoning?.nothinkPrefix).toBe('<think>\n\n</think>\n\n');
      expect(caps?.defaultSettings).toMatchObject({
        temperature: 0.7, topP: 0.8, topK: 20, minP: 0, repeatPenalty: 1.0,
      });
      expect(caps?.reasoningDefaultSettings).toMatchObject({
        temperature: 1.0, topP: 0.95,
      });
    });

    it('detects Qwen 3.5 9B and Qwen 3.6 models', () => {
      expect(detectGgufCapabilities('Qwen3.5-9B-Q4_K_M.gguf')?.maxTokens).toBe(16384);
      expect(detectGgufCapabilities('Qwen3.6-27B-UD-Q6_K_XL.gguf')?.reasoning?.supported).toBe(true);
      expect(detectGgufCapabilities('Qwen3.6-35B-A3B-UD-IQ4_NL.gguf')?.reasoning?.canDisable).toBe(true);
    });

    it('does not mis-detect Qwen 3.5 as Qwen 3', () => {
      const caps = detectGgufCapabilities('Qwen3.5-4B-Q4_K_M.gguf');
      // The qwen3-4b pattern must not shadow qwen3.5-4b
      expect(caps?.reasoningDefaultSettings?.temperature).toBe(1.0); // 3.5 thinking profile, not 0.6
    });

    it('detects Instruct-2507 as non-thinking (not shadowed by the hybrid qwen3-4b pattern)', () => {
      const caps = detectGgufCapabilities('Qwen3-4B-Instruct-2507-Q4_K_M.gguf');
      expect(caps).not.toBeNull();
      expect(caps?.reasoning).toBeUndefined();
      // Safe no-op toggle metadata is still present
      expect(caps?.localReasoning?.toggleKwarg).toBe('enable_thinking');
    });

    it('detects Thinking-2507 as always-on reasoning without a toggle', () => {
      const caps = detectGgufCapabilities('Qwen3-4B-Thinking-2507-Q4_K_M.gguf');
      expect(caps?.reasoning?.enabledByDefault).toBe(true);
      expect(caps?.reasoning?.canDisable).toBe(false);
      expect(caps?.localReasoning?.toggleKwarg).toBeUndefined();
      expect(caps?.localReasoning?.markers).toEqual(['<think>', '</think>']);
    });

    it('still detects original hybrid Qwen 3 checkpoints', () => {
      const caps = detectGgufCapabilities('Qwen3-14B-UD-IQ3_XXS.gguf');
      expect(caps?.reasoning?.supported).toBe(true);
      expect(caps?.reasoning?.canDisable).toBe(true);
      expect(caps?.reasoningDefaultSettings?.temperature).toBe(0.6); // Qwen 3 thinking profile
    });

    it('detects Gemma 4 models (hybrid thinking, system messages, channel markers)', () => {
      const caps = detectGgufCapabilities('gemma-4-E4B-it-Q4_K_M.gguf');
      expect(caps).not.toBeNull();
      expect(caps?.supportsSystemMessage).toBe(true);
      expect(caps?.reasoning?.supported).toBe(true);
      expect(caps?.localReasoning?.toggleKwarg).toBe('enable_thinking');
      expect(caps?.localReasoning?.nothinkPrefix).toBe('<|channel>thought\n<channel|>');
      expect(caps?.localReasoning?.markers).toEqual(['<|channel>thought', '<channel|>']);
      expect(caps?.defaultSettings).toMatchObject({ temperature: 1.0, topK: 64 });
    });

    it('detects Gemma 4 12B, MoE and 31B variants', () => {
      expect(detectGgufCapabilities('gemma-4-12B-it-Q4_K_M.gguf')?.contextWindow).toBe(262144);
      expect(detectGgufCapabilities('gemma-4-26B-A4B-it-UD-IQ4_NL.gguf')?.contextWindow).toBe(262144);
      expect(detectGgufCapabilities('gemma-4-31B-it-UD-Q6_K_XL.gguf')?.contextWindow).toBe(262144);
    });

    it('detects Gemma 3 models (no thinking, no system role)', () => {
      const caps = detectGgufCapabilities('gemma-3-12b-it-IQ4_NL.gguf');
      expect(caps).not.toBeNull();
      expect(caps?.supportsSystemMessage).toBe(false);
      expect(caps?.reasoning).toBeUndefined();
      expect(caps?.defaultSettings).toMatchObject({ temperature: 1.0, topK: 64 });
    });

    it('detects GPT-OSS as always-on reasoning without a toggle', () => {
      const caps = detectGgufCapabilities('gpt-oss-20b-mxfp4.gguf');
      expect(caps?.reasoning?.enabledByDefault).toBe(true);
      expect(caps?.reasoning?.canDisable).toBe(false);
      expect(caps?.localReasoning).toBeUndefined();
      expect(caps?.defaultSettings).toMatchObject({ temperature: 1.0, topP: 1.0, topK: 0 });

      const large = detectGgufCapabilities('gpt-oss-120b-mxfp4-00001-of-00003.gguf');
      expect(large?.reasoning?.enabledByDefault).toBe(true);
    });

    it('detects Ministral 3 Instruct vs Reasoning variants', () => {
      const instruct = detectGgufCapabilities('Ministral-3-8B-Instruct-2512-Q4_K_M.gguf');
      expect(instruct?.reasoning).toBeUndefined();
      expect(instruct?.defaultSettings?.temperature).toBe(0.15);
      expect(instruct?.localReasoning?.toggleKwarg).toBe('enable_thinking');

      const reasoning = detectGgufCapabilities('Ministral-3-8B-Reasoning-2512-Q4_K_M.gguf');
      expect(reasoning?.reasoning?.enabledByDefault).toBe(true);
      expect(reasoning?.reasoning?.canDisable).toBe(false);
      expect(reasoning?.defaultSettings?.temperature).toBe(0.7);
    });

    it('detects Granite 4.1, DeepSeek R1 and Llama 3.2', () => {
      const granite = detectGgufCapabilities('granite-4.1-8b-Q4_K_M.gguf');
      expect(granite?.reasoning).toBeUndefined();
      expect(granite?.defaultSettings?.temperature).toBe(0.7);

      const r1 = detectGgufCapabilities('DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf');
      expect(r1?.reasoning?.enabledByDefault).toBe(true);
      expect(r1?.localReasoning?.markers).toEqual(['<think>', '</think>']);

      const llama = detectGgufCapabilities('Llama-3.2-3B-Instruct-Q8_0.gguf');
      expect(llama?.reasoning).toBeUndefined();
      expect(llama?.defaultSettings?.temperature).toBe(0.6);
    });

    it('is case-insensitive and quantization-agnostic', () => {
      expect(detectGgufCapabilities('QWEN3.5-4B-Q8_0.GGUF')).not.toBeNull();
      expect(detectGgufCapabilities('gemma-4-e2b-it-Q8_0.gguf')).not.toBeNull();
    });

    it('returns null for unknown models', () => {
      expect(detectGgufCapabilities('mistral-7b-instruct-v0.2.Q4_K_M.gguf')).toBeNull();
      expect(detectGgufCapabilities('some-custom-model.gguf')).toBeNull();
    });

    it('keeps specific patterns before generic ones in KNOWN_GGUF_MODELS', () => {
      const patterns = KNOWN_GGUF_MODELS.map((m) => m.pattern);
      // For every pair (a, b) where b is a substring of a, a must come first
      for (let i = 0; i < patterns.length; i++) {
        for (let j = 0; j < i; j++) {
          expect(patterns[i].includes(patterns[j])).toBe(false);
        }
      }
    });
  });

  describe('getDefaultSettingsForModel with resolved ModelInfo', () => {
    it('applies detected vendor defaultSettings for GGUF models', () => {
      const caps = detectGgufCapabilities('gemma-4-E4B-it-Q4_K_M.gguf');
      const modelInfo = createFallbackModelInfo('llamacpp', 'llamacpp', caps ?? undefined);

      const settings = getDefaultSettingsForModel('llamacpp', 'llamacpp', modelInfo);

      expect(settings.temperature).toBe(1.0);
      expect(settings.topP).toBe(0.95);
      expect(settings.topK).toBe(64);
      expect(settings.minP).toBe(0);
      expect(settings.repeatPenalty).toBe(1.0);
      // maxTokens flows from the detected ModelInfo
      expect(settings.maxTokens).toBe(8192);
      // Gemma 4 supports system messages
      expect(settings.supportsSystemMessage).toBe(true);
    });

    it('auto-enables reasoning for always-on detected models', () => {
      const caps = detectGgufCapabilities('gpt-oss-20b-mxfp4.gguf');
      const modelInfo = createFallbackModelInfo('llamacpp', 'llamacpp', caps ?? undefined);

      const settings = getDefaultSettingsForModel('llamacpp', 'llamacpp', modelInfo);

      expect(settings.reasoning?.enabled).toBe(true);
    });

    it('does not change behavior when no ModelInfo is passed', () => {
      const withInfo = getDefaultSettingsForModel('gpt-4.1', 'openai');
      expect(withInfo.temperature).toBe(0.5); // global default, no vendor override
    });
  });
});