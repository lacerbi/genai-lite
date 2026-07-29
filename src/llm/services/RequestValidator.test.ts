import { RequestValidator } from './RequestValidator';
import type { LLMChatRequest, LLMFailureResponse, ModelInfo, StructuredOutputSettings } from '../types';

describe('RequestValidator', () => {
  let validator: RequestValidator;

  beforeEach(() => {
    validator = new RequestValidator();
  });

  describe('validateRequestStructure', () => {
    it('should return validation error for empty messages', () => {
      const request: LLMChatRequest = {
        providerId: 'openai',
        modelId: 'gpt-4.1',
        messages: []
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('INVALID_REQUEST');
      expect(result?.error.message).toContain('Request must contain at least one message');
    });

    it('should return validation error for invalid message role', () => {
      const request: LLMChatRequest = {
        providerId: 'openai',
        modelId: 'gpt-4.1',
        messages: [{ role: 'invalid' as any, content: 'Hello' }]
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('INVALID_MESSAGE_ROLE');
      expect(result?.error.message).toContain('Invalid message role');
    });

    it('should return validation error for empty message content', () => {
      const request: LLMChatRequest = {
        providerId: 'openai',
        modelId: 'gpt-4.1',
        messages: [{ role: 'user', content: '' }]
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('INVALID_MESSAGE');
      expect(result?.error.message).toContain('Message at index 0 must have both');
    });

    it('should pass validation for valid request', () => {
      const request: LLMChatRequest = {
        providerId: 'openai',
        modelId: 'gpt-4.1',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const result = validator.validateRequestStructure(request);

      expect(result).toBeNull();
    });

    it('should handle preset requests correctly', () => {
      const request = {
        presetId: 'test-preset',
        messages: []
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.provider).toBe('test-preset');
      expect(result?.model).toBe('test-preset');
    });
  });

  describe('validateSettings', () => {
    it('should return error for invalid temperature', () => {
      const settings = { temperature: 2.5 };
      
      const result = validator.validateSettings(settings, 'openai', 'gpt-4.1');

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('INVALID_SETTINGS');
      expect(result?.error.message).toContain('temperature must be a number between');
    });

    it('should return error for invalid maxTokens', () => {
      const settings = { maxTokens: 0 };
      
      const result = validator.validateSettings(settings, 'openai', 'gpt-4.1');

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('INVALID_SETTINGS');
      expect(result?.error.message).toContain('maxTokens must be an integer between');
    });

    it('should return error for invalid topP', () => {
      const settings = { topP: -0.1 };
      
      const result = validator.validateSettings(settings, 'openai', 'gpt-4.1');

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('INVALID_SETTINGS');
      expect(result?.error.message).toContain('topP must be a number between 0 and 1');
    });

    it('should pass validation for valid settings', () => {
      const settings = {
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9
      };
      
      const result = validator.validateSettings(settings, 'openai', 'gpt-4.1');

      expect(result).toBeNull();
    });

    it('should reject explicitly conflicting Anthropic samplers', () => {
      const result = validator.validateSettings(
        { temperature: 0.7, topP: 0.9 },
        'anthropic',
        'claude-haiku-4-5-20251001'
      );

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('INVALID_SETTINGS');
      expect(result?.error.type).toBe('validation_error');
      expect(result?.error.message).toContain('temperature');
      expect(result?.error.message).toContain('topP');
    });
  });

  describe('validateReasoningSettings', () => {
    const mockModelWithReasoning: ModelInfo = {
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      providerId: 'openai' as any,
      supportsPromptCache: false,
      reasoning: { supported: true }
    };

    const mockModelWithoutReasoning: ModelInfo = {
      id: 'gpt-4.1',
      name: 'GPT-4.1', 
      providerId: 'openai' as any,
      supportsPromptCache: false,
      reasoning: { supported: false }
    };

    const baseRequest: LLMChatRequest = {
      providerId: 'openai',
      modelId: 'gpt-4.1',
      messages: [{ role: 'user', content: 'Hello' }]
    };

    it('should pass validation when no reasoning settings provided', () => {
      const result = validator.validateReasoningSettings(
        mockModelWithoutReasoning,
        undefined,
        baseRequest
      );

      expect(result).toBeNull();
    });

    it('should reject reasoning settings for non-reasoning models', () => {
      const reasoning = { enabled: true };
      
      const result = validator.validateReasoningSettings(
        mockModelWithoutReasoning,
        reasoning,
        baseRequest
      );

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('reasoning_not_supported');
      expect(result?.error.message).toContain('does not support reasoning/thinking');
    });

    it('should reject reasoning with effort for non-reasoning models', () => {
      const reasoning = { effort: 'high' as const };
      
      const result = validator.validateReasoningSettings(
        mockModelWithoutReasoning,
        reasoning,
        baseRequest
      );

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('reasoning_not_supported');
    });

    it('should reject reasoning with maxTokens for non-reasoning models', () => {
      const reasoning = { maxTokens: 5000 };
      
      const result = validator.validateReasoningSettings(
        mockModelWithoutReasoning,
        reasoning,
        baseRequest
      );

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('reasoning_not_supported');
    });

    it('should allow disabled reasoning for non-reasoning models', () => {
      const reasoning = { enabled: false };
      
      const result = validator.validateReasoningSettings(
        mockModelWithoutReasoning,
        reasoning,
        baseRequest
      );

      expect(result).toBeNull();
    });

    it('should allow reasoning with exclude=true for non-reasoning models', () => {
      const reasoning = { exclude: true };
      
      const result = validator.validateReasoningSettings(
        mockModelWithoutReasoning,
        reasoning,
        baseRequest
      );

      expect(result).toBeNull();
    });

    it('should allow all reasoning settings for models that support reasoning', () => {
      const reasoning = {
        enabled: true,
        effort: 'high' as const,
        maxTokens: 5000,
        exclude: false
      };

      const result = validator.validateReasoningSettings(
        mockModelWithReasoning,
        reasoning,
        baseRequest
      );

      expect(result).toBeNull();
    });
  });

  describe('validateStructuredOutputSettings', () => {
    const mockModelWithStructuredOutput: ModelInfo = {
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      providerId: 'openai' as any,
      supportsPromptCache: false,
      structuredOutput: { supported: true, strictMode: true }
    };

    const mockModelWithoutStructuredOutput: ModelInfo = {
      id: 'old-model',
      name: 'Old Model',
      providerId: 'openai' as any,
      supportsPromptCache: false,
      structuredOutput: { supported: false }
    };

    const mockModelWithPartialSupport: ModelInfo = {
      id: 'mistral-small',
      name: 'Mistral Small',
      providerId: 'mistral' as any,
      supportsPromptCache: false,
      structuredOutput: { supported: true, strictMode: false }
    };

    const baseRequest: LLMChatRequest = {
      providerId: 'openai',
      modelId: 'gpt-4.1',
      messages: [{ role: 'user', content: 'Hello' }]
    };

    const validStructuredOutput: StructuredOutputSettings = {
      name: 'test_schema',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' }
        },
        required: ['name', 'age']
      }
    };

    it('should pass validation when no structuredOutput settings provided', () => {
      const result = validator.validateStructuredOutputSettings(
        mockModelWithoutStructuredOutput,
        undefined,
        baseRequest
      );

      expect(result).toBeNull();
    });

    it('should pass validation when structuredOutput is explicitly disabled', () => {
      const result = validator.validateStructuredOutputSettings(
        mockModelWithoutStructuredOutput,
        { ...validStructuredOutput, enabled: false },
        baseRequest
      );

      expect(result).toBeNull();
    });

    it('should reject structuredOutput for models that do not support it', () => {
      const result = validator.validateStructuredOutputSettings(
        mockModelWithoutStructuredOutput,
        validStructuredOutput,
        baseRequest
      );

      expect(result).not.toBeNull();
      expect(result?.error.code).toBe('structured_output_not_supported');
      expect(result?.error.message).toContain('Structured output is not available for');
    });

    it('should pass validation for models that support structuredOutput', () => {
      const result = validator.validateStructuredOutputSettings(
        mockModelWithStructuredOutput,
        validStructuredOutput,
        baseRequest
      );

      expect(result).toBeNull();
    });

    it("allows explicit prompt delivery without native provider support", () => {
      const result = validator.validateStructuredOutputSettings(
        mockModelWithoutStructuredOutput,
        { ...validStructuredOutput, delivery: "prompt" },
        baseRequest
      );

      expect(result).toBeNull();
    });

    it("rejects an invalid structured-output delivery value at runtime", () => {
      const result = validator.validateStructuredOutputSettings(
        mockModelWithStructuredOutput,
        { ...validStructuredOutput, delivery: "invalid" as any },
        baseRequest
      );

      expect(result?.error.code).toBe(
        "structured_output_invalid_delivery"
      );
    });

    it('should pass validation for models with partial support (no strict mode)', () => {
      const result = validator.validateStructuredOutputSettings(
        mockModelWithPartialSupport,
        validStructuredOutput,
        baseRequest
      );

      // Should pass but with warning (warning is logged, not returned as error)
      expect(result).toBeNull();
    });

    it('should pass validation when strict is explicitly set to false', () => {
      const result = validator.validateStructuredOutputSettings(
        mockModelWithPartialSupport,
        { ...validStructuredOutput, strict: false },
        baseRequest
      );

      expect(result).toBeNull();
    });

    it('should allow structuredOutput for models without explicit capability (unknown models)', () => {
      // When structuredOutput capability is undefined (not explicitly set),
      // we allow the request to proceed. This supports unknown models on
      // providers that allow them (like mock, llamacpp, openrouter).
      const modelWithNoCapability: ModelInfo = {
        id: 'unknown-model',
        name: 'Unknown Model',
        providerId: 'openai' as any,
        supportsPromptCache: false,
        // No structuredOutput property at all (undefined)
      };

      const result = validator.validateStructuredOutputSettings(
        modelWithNoCapability,
        validStructuredOutput,
        baseRequest
      );

      // Should pass - we don't block unknown models
      expect(result).toBeNull();
    });
  });
});
