/**
 * Tests for LLMService.createMessages method
 */

import { LLMService } from './LLMService';
import type { ApiKeyProvider } from '../types';
import type { LLMMessage } from './types';

// Create a mock API key provider
const mockApiKeyProvider: ApiKeyProvider = async () => 'test-api-key';

describe('LLMService.createMessages', () => {
  let service: LLMService;

  beforeEach(() => {
    service = new LLMService(mockApiKeyProvider);
  });

  describe('Basic template parsing', () => {
    it('should parse simple template without model context', async () => {
      const result = await service.createMessages({
        template: 'Hello, how can I help you?'
      });

      expect(result.messages).toEqual([
        { role: 'user', content: 'Hello, how can I help you?' }
      ]);
      expect(result.modelContext).toBeNull();
    });

    it('should parse multi-turn template without model context', async () => {
      const result = await service.createMessages({
        template: `
          <SYSTEM>You are a helpful assistant.</SYSTEM>
          <USER>Hello</USER>
          <ASSISTANT>Hi! How can I help you today?</ASSISTANT>
          <USER>Can you explain {{topic}}?</USER>
        `,
        variables: { topic: 'promises in JavaScript' }
      });

      expect(result.messages).toEqual([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi! How can I help you today?' },
        { role: 'user', content: 'Can you explain promises in JavaScript?' }
      ]);
      expect(result.modelContext).toBeNull();
    });
  });

  describe('Model-aware templates', () => {
    it('should inject model context for valid preset', async () => {
      const result = await service.createMessages({
        template: `
          <SYSTEM>You are a {{ thinking_enabled ? "thoughtful" : "standard" }} assistant.</SYSTEM>
          <USER>Help me understand {{concept}}</USER>
        `,
        variables: { concept: 'recursion' },
        presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
      });

      expect(result.modelContext).not.toBeNull();
      expect(result.modelContext?.thinking_enabled).toBe(true);
      expect(result.modelContext?.thinking_available).toBe(true);
      expect(result.modelContext?.model_id).toBe('claude-3-7-sonnet-20250219');
      expect(result.modelContext?.provider_id).toBe('anthropic');

      expect(result.messages).toEqual([
        { role: 'system', content: 'You are a thoughtful assistant.' },
        { role: 'user', content: 'Help me understand recursion' }
      ]);
    });

    it('should inject model context for valid provider/model combo', async () => {
      const result = await service.createMessages({
        template: 'Model: {{model_id}}, Provider: {{provider_id}}',
        providerId: 'openai',
        modelId: 'gpt-4.1'
      });

      expect(result.modelContext).not.toBeNull();
      expect(result.modelContext?.model_id).toBe('gpt-4.1');
      expect(result.modelContext?.provider_id).toBe('openai');

      expect(result.messages).toEqual([
        { role: 'user', content: 'Model: gpt-4.1, Provider: openai' }
      ]);
    });

    it('should handle model without reasoning support', async () => {
      const result = await service.createMessages({
        template: 'Thinking available: {{thinking_available}}, enabled: {{thinking_enabled}}',
        presetId: 'openai-gpt-4.1-default'
      });

      expect(result.modelContext?.thinking_available).toBe(false);
      expect(result.modelContext?.thinking_enabled).toBe(false);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle variables that inject role tags', async () => {
      const result = await service.createMessages({
        template: `
          <SYSTEM>Base system prompt</SYSTEM>
          {{extraMessages}}
          <USER>Final question</USER>
        `,
        variables: {
          extraMessages: '<USER>First question</USER>\n<ASSISTANT>First answer</ASSISTANT>'
        }
      });

      expect(result.messages).toEqual([
        { role: 'system', content: 'Base system prompt' },
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Final question' }
      ]);
    });

    it('should handle conditional role injection based on model context', async () => {
      const result = await service.createMessages({
        template: `
          {{ thinking_enabled ? '<SYSTEM>Think step-by-step before answering.</SYSTEM>' : '' }}
          <USER>Solve: {{problem}}</USER>
        `,
        variables: { problem: 'What is 15% of 240?' },
        presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
      });

      expect(result.messages).toEqual([
        { role: 'system', content: 'Think step-by-step before answering.' },
        { role: 'user', content: 'Solve: What is 15% of 240?' }
      ]);
    });

    it('should handle nested conditionals with model context', async () => {
      const result = await service.createMessages({
        template: `
          <SYSTEM>
            You are using {{ model_id || "no model" }}.
            {{ thinking_available ? 'You have reasoning capabilities.' : 'Standard model.' }}
          </SYSTEM>
          <USER>Hello</USER>
        `,
        providerId: 'anthropic',
        modelId: 'claude-3-5-haiku-20241022'
      });

      expect(result.messages[0].role).toBe('system');
      // Check that we have model context
      expect(result.modelContext).not.toBeNull();
      if (result.modelContext) {
        expect(result.modelContext.model_id).toBe('claude-3-5-haiku-20241022');
        expect(result.modelContext.thinking_available).toBe(false);
      }
    });
  });

  describe('Error handling', () => {
    it('should proceed without model context on invalid preset', async () => {
      const result = await service.createMessages({
        template: 'Has model context: {{model_id ? "yes" : "no"}}',
        presetId: 'invalid-preset-id'
      });

      expect(result.modelContext).toBeNull();
      expect(result.messages).toEqual([
        { role: 'user', content: 'Has model context: no' }
      ]);
    });

    it('should handle invalid template syntax gracefully', async () => {
      const result = await service.createMessages({
        template: 'Unclosed conditional: {{ if true',
        variables: {}
      });

      // The template engine doesn't throw errors for invalid syntax, it renders as-is
      expect(result.messages).toEqual([
        { role: 'user', content: 'Unclosed conditional: {{ if true' }
      ]);
    });

    it('should handle empty template', async () => {
      const result = await service.createMessages({
        template: ''
      });

      expect(result.messages).toEqual([]);
      expect(result.modelContext).toBeNull();
    });

    it('should handle whitespace-only template', async () => {
      const result = await service.createMessages({
        template: '   \n\t   '
      });

      expect(result.messages).toEqual([]);
      expect(result.modelContext).toBeNull();
    });
  });

  describe('Integration with reasoning settings', () => {
    it('should handle reasoning settings in model context', async () => {
      const result = await service.createMessages({
        template: `
          Thinking enabled: {{thinking_enabled}}
          Thinking available: {{thinking_available}}
          Model: {{model_id}}
        `,
        presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
      });

      expect(result.modelContext?.thinking_enabled).toBe(true);
      expect(result.modelContext?.thinking_available).toBe(true);
      expect(result.messages[0].content).toContain('Thinking enabled: true');
      expect(result.messages[0].content).toContain('Thinking available: true');
    });

    it('should handle models with always-on reasoning', async () => {
      const result = await service.createMessages({
        template: 'Provider: {{provider_id}}, Model: {{model_id}}',
        providerId: 'gemini',
        modelId: 'gemini-2.5-pro'
      });

      expect(result.modelContext).not.toBeNull();
      expect(result.modelContext?.provider_id).toBe('gemini');
      expect(result.modelContext?.model_id).toBe('gemini-2.5-pro');
    });
  });

  describe('Variable precedence', () => {
    it('should allow user variables to override model context', async () => {
      const result = await service.createMessages({
        template: 'Model: {{model_id}}',
        variables: { model_id: 'user-override' },
        presetId: 'openai-gpt-4.1-default'
      });

      expect(result.messages).toEqual([
        { role: 'user', content: 'Model: user-override' }
      ]);
    });

    it('should merge variables correctly', async () => {
      const result = await service.createMessages({
        template: 'Model: {{model_id}}, Task: {{task}}, Thinking: {{thinking_enabled}}',
        variables: { task: 'code review' },
        presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
      });

      expect(result.messages[0].content).toBe('Model: claude-3-7-sonnet-20250219, Task: code review, Thinking: true');
    });
  });
});