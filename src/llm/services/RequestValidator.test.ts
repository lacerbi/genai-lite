import { RequestValidator } from './RequestValidator';
import type { LLMChatRequest, LLMFailureResponse, ModelInfo } from '../types';

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
});