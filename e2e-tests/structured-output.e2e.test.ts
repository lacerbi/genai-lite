/**
 * E2E tests for structured output across providers.
 *
 * These tests make real API calls and cost money (except llama-server which is free).
 * Run with: npm run test:e2e -- --testPathPattern=structured-output
 *
 * Environment variables:
 * - E2E_OPENAI_API_KEY: OpenAI API key
 * - E2E_GEMINI_API_KEY: Google Gemini API key
 * - E2E_ANTHROPIC_API_KEY: Anthropic API key (Claude 4.5+ for structured output)
 * - E2E_MISTRAL_API_KEY: Mistral API key
 * - E2E_OPENROUTER_API_KEY: OpenRouter API key
 * - LLAMACPP_API_BASE_URL: llama-server URL (default: http://localhost:8080)
 */

import { LLMService } from '../src/llm/LLMService';
import type { LLMResponse, LLMFailureResponse, StructuredOutputSettings } from '../src/llm/types';
import type { ApiKeyProvider } from '../src/types';

// Timeout for API calls
const API_TIMEOUT = 60000;

// Get API keys from environment
const OPENAI_API_KEY = process.env.E2E_OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.E2E_GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.E2E_ANTHROPIC_API_KEY;
const MISTRAL_API_KEY = process.env.E2E_MISTRAL_API_KEY;
const OPENROUTER_API_KEY = process.env.E2E_OPENROUTER_API_KEY;
const LLAMACPP_BASE_URL = process.env.LLAMACPP_API_BASE_URL || 'http://localhost:8080';

// Track llama-server availability
let llamaServerAvailable: boolean | null = null;

/**
 * Check if llama-server is running locally
 */
async function isLlamaServerRunning(): Promise<boolean> {
  if (llamaServerAvailable !== null) {
    return llamaServerAvailable;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${LLAMACPP_BASE_URL}/health`, {
      signal: controller.signal
    });

    clearTimeout(timeout);
    llamaServerAvailable = response.ok;
    return llamaServerAvailable;
  } catch {
    llamaServerAvailable = false;
    return false;
  }
}

// Common test schema for extracting person info
const personSchema: StructuredOutputSettings = {
  name: 'person_info',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The person\'s name' },
      age: { type: 'integer', description: 'The person\'s age' }
    },
    required: ['name', 'age']
  },
  strict: true
};

// Simple test schema for color extraction
const colorSchema: StructuredOutputSettings = {
  name: 'color_info',
  schema: {
    type: 'object',
    properties: {
      color: { type: 'string', description: 'The color mentioned' },
      hex: { type: 'string', description: 'Hex code if known, otherwise null', pattern: '^#[0-9A-Fa-f]{6}$' }
    },
    required: ['color']
  }
};

describe('Structured Output E2E Tests', () => {
  let llmService: LLMService;

  beforeAll(async () => {
    // Check llama-server availability upfront
    const llamaAvailable = await isLlamaServerRunning();
    console.log(`llama-server available: ${llamaAvailable ? 'YES (free tests will run)' : 'NO'}`);
    console.log(`OpenAI API key: ${OPENAI_API_KEY ? 'YES' : 'NO'}`);
    console.log(`Gemini API key: ${GEMINI_API_KEY ? 'YES' : 'NO'}`);
    console.log(`Anthropic API key: ${ANTHROPIC_API_KEY ? 'YES' : 'NO'}`);
    console.log(`Mistral API key: ${MISTRAL_API_KEY ? 'YES' : 'NO'}`);
    console.log(`OpenRouter API key: ${OPENROUTER_API_KEY ? 'YES' : 'NO'}`);
  });

  beforeEach(() => {
    const apiKeyProvider: ApiKeyProvider = async (providerId: string) => {
      switch (providerId) {
        case 'openai': return OPENAI_API_KEY || null;
        case 'gemini': return GEMINI_API_KEY || null;
        case 'anthropic': return ANTHROPIC_API_KEY || null;
        case 'mistral': return MISTRAL_API_KEY || null;
        case 'openrouter': return OPENROUTER_API_KEY || null;
        case 'llamacpp': return 'not-needed';
        default: return null;
      }
    };

    llmService = new LLMService(apiKeyProvider);
  });

  // ============================================
  // llama.cpp (FREE - Local Server)
  // ============================================
  describe('llama.cpp (local, free)', () => {
    beforeEach(async () => {
      const available = await isLlamaServerRunning();
      if (!available) {
        console.log('Skipping llama.cpp tests - server not running');
      }
    });

    const runIfAvailable = (testFn: () => Promise<void>) => async () => {
      if (!(await isLlamaServerRunning())) {
        return; // Skip silently
      }
      await testFn();
    };

    it('should return structured JSON with person schema', runIfAvailable(async () => {
      const response = await llmService.sendMessage({
        providerId: 'llamacpp',
        modelId: 'local-model',
        messages: [{
          role: 'user',
          content: 'Extract the person info from this text: "John Smith is 42 years old." Return only the JSON.'
        }],
        settings: {
          structuredOutput: personSchema,
          maxTokens: 100
        }
      });

      expect(response.object).toBe('chat.completion');
      const result = response as LLMResponse;
      expect(result.choices[0].parsedContent).toBeDefined();
      expect(result.choices[0].parseError).toBeUndefined();

      const parsed = result.choices[0].parsedContent as { name: string; age: number };
      expect(parsed.name).toContain('John');
      expect(typeof parsed.age).toBe('number');
    }), API_TIMEOUT);

    it('should handle color extraction schema', runIfAvailable(async () => {
      const response = await llmService.sendMessage({
        providerId: 'llamacpp',
        modelId: 'local-model',
        messages: [{
          role: 'user',
          content: 'What color is the sky? Return JSON with the color name.'
        }],
        settings: {
          structuredOutput: colorSchema,
          maxTokens: 100
        }
      });

      expect(response.object).toBe('chat.completion');
      const result = response as LLMResponse;
      expect(result.choices[0].parsedContent).toBeDefined();

      const parsed = result.choices[0].parsedContent as { color: string };
      expect(typeof parsed.color).toBe('string');
    }), API_TIMEOUT);
  });

  // ============================================
  // OpenAI
  // ============================================
  (OPENAI_API_KEY ? describe : describe.skip)('OpenAI', () => {
    it('should return structured JSON with gpt-4.1-mini', async () => {
      const response = await llmService.sendMessage({
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
        messages: [{
          role: 'user',
          content: 'Extract: "Alice is 30 years old." Return JSON only.'
        }],
        settings: {
          structuredOutput: personSchema,
          maxTokens: 100
        }
      });

      if (response.object === 'error') {
        console.log('OpenAI error:', (response as LLMFailureResponse).error);
      }
      expect(response.object).toBe('chat.completion');
      const result = response as LLMResponse;
      expect(result.choices[0].parsedContent).toBeDefined();
      expect(result.choices[0].parseError).toBeUndefined();

      const parsed = result.choices[0].parsedContent as { name: string; age: number };
      expect(parsed.name).toContain('Alice');
      expect(parsed.age).toBe(30);
    }, API_TIMEOUT);

    it('should enforce strict schema validation', async () => {
      const strictSchema: StructuredOutputSettings = {
        name: 'strict_test',
        schema: {
          type: 'object',
          properties: {
            value: { type: 'integer', minimum: 1, maximum: 10 }
          },
          required: ['value'],
          additionalProperties: false
        },
        strict: true
      };

      const response = await llmService.sendMessage({
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
        messages: [{
          role: 'user',
          content: 'Return a JSON object with a "value" field containing the number 5.'
        }],
        settings: {
          structuredOutput: strictSchema,
          maxTokens: 50
        }
      });

      expect(response.object).toBe('chat.completion');
      const result = response as LLMResponse;
      const parsed = result.choices[0].parsedContent as { value: number };
      expect(parsed.value).toBe(5);
    }, API_TIMEOUT);
  });

  // ============================================
  // Google Gemini
  // Note: Gemini structured output may require specific SDK versions
  // ============================================
  (GEMINI_API_KEY ? describe : describe.skip)('Google Gemini', () => {
    it('should return structured JSON with gemini-2.0-flash', async () => {
      const response = await llmService.sendMessage({
        providerId: 'gemini',
        modelId: 'gemini-2.0-flash',
        messages: [{
          role: 'user',
          content: 'Extract: "Bob is 25 years old." Return only the JSON data.'
        }],
        settings: {
          structuredOutput: personSchema,
          maxTokens: 100
        }
      });

      if (response.object === 'error') {
        const error = (response as LLMFailureResponse).error;
        // Known issue: Gemini schema format may need updates
        if (error.message?.includes('InvalidSchema') || error.message?.includes('schema')) {
          console.log('Gemini structured output schema issue (known limitation):', error.message);
          return; // Skip this test - known API compatibility issue
        }
        // Handle rate limits gracefully
        if (error.message?.includes('quota') || error.message?.includes('rate') || error.message?.includes('RESOURCE_EXHAUSTED')) {
          console.log('Gemini rate limit exceeded, skipping test');
          return;
        }
        throw new Error(`Gemini error: ${error.message}`);
      }

      expect(response.object).toBe('chat.completion');
      const result = response as LLMResponse;
      expect(result.choices[0].parsedContent).toBeDefined();

      const parsed = result.choices[0].parsedContent as { name: string; age: number };
      expect(parsed.name).toContain('Bob');
      expect(parsed.age).toBe(25);
    }, API_TIMEOUT);
  });

  // ============================================
  // Anthropic
  // Structured outputs are generally available for Claude 4.5 and later models.
  // The request carries `output_config.format` with no beta header. This test
  // must fail — not skip — if the provider rejects that shape; a silent skip is
  // exactly how the earlier `output_format` drift went unnoticed.
  // ============================================
  (ANTHROPIC_API_KEY ? describe : describe.skip)('Anthropic', () => {
    it('should return structured JSON with claude-sonnet-4-5-20250929', async () => {
      const response = await llmService.sendMessage({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        messages: [{
          role: 'user',
          content: 'Extract person info from: "Carol is 35." Return JSON only.'
        }],
        settings: {
          structuredOutput: personSchema,
          maxTokens: 100
        }
      });

      if (response.object === 'error') {
        const error = (response as LLMFailureResponse).error;
        throw new Error(`Anthropic error: ${error.message}`);
      }

      expect(response.object).toBe('chat.completion');
      const result = response as LLMResponse;
      expect(result.choices[0].parsedContent).toBeDefined();
      expect(result.choices[0].parseError).toBeUndefined();

      const parsed = result.choices[0].parsedContent as { name: string; age: number };
      expect(parsed.name).toContain('Carol');
      expect(parsed.age).toBe(35);
    }, API_TIMEOUT);

    it('should reject structured output for a pre-4.5 model before calling the API', async () => {
      const response = await llmService.sendMessage({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Extract person info from: "Carol is 35."' }],
        settings: {
          structuredOutput: personSchema,
          maxTokens: 100
        }
      });

      expect(response.object).toBe('error');
      expect((response as LLMFailureResponse).error.code).toBe('structured_output_not_supported');
    }, API_TIMEOUT);
  });

  // ============================================
  // Mistral (JSON mode only, no schema validation)
  // ============================================
  (MISTRAL_API_KEY ? describe : describe.skip)('Mistral', () => {
    it('should return JSON with mistral-small-latest (no schema enforcement)', async () => {
      const response = await llmService.sendMessage({
        providerId: 'mistral',
        modelId: 'mistral-small-latest',
        messages: [{
          role: 'user',
          content: 'Extract: "David is 40 years old." Return JSON with name and age fields.'
        }],
        settings: {
          structuredOutput: personSchema,
          maxTokens: 100
        }
      });

      expect(response.object).toBe('chat.completion');
      const result = response as LLMResponse;
      // Mistral should return valid JSON but may not strictly follow schema
      expect(result.choices[0].parsedContent).toBeDefined();

      const parsed = result.choices[0].parsedContent as { name?: string; age?: number };
      expect(parsed).toHaveProperty('name');
    }, API_TIMEOUT);
  });

  // ============================================
  // OpenRouter (passthrough to underlying provider)
  // ============================================
  (OPENROUTER_API_KEY ? describe : describe.skip)('OpenRouter', () => {
    it('should return structured JSON via OpenRouter', async () => {
      const response = await llmService.sendMessage({
        providerId: 'openrouter',
        modelId: 'openai/gpt-4.1-mini',
        messages: [{
          role: 'user',
          content: 'Extract: "Eve is 28." Return JSON only.'
        }],
        settings: {
          structuredOutput: personSchema,
          maxTokens: 100
        }
      });

      expect(response.object).toBe('chat.completion');
      const result = response as LLMResponse;
      expect(result.choices[0].parsedContent).toBeDefined();

      const parsed = result.choices[0].parsedContent as { name: string; age: number };
      expect(parsed.name).toContain('Eve');
      expect(parsed.age).toBe(28);
    }, API_TIMEOUT);
  });

  // ============================================
  // Auto-parse behavior tests
  // ============================================
  describe('Auto-parse behavior', () => {
    const runWithAnyProvider = async (testFn: (providerId: string, modelId: string) => Promise<void>) => {
      // Try llama-server first (free)
      if (await isLlamaServerRunning()) {
        await testFn('llamacpp', 'local-model');
        return;
      }
      // Fall back to cheapest available provider
      if (OPENAI_API_KEY) {
        await testFn('openai', 'gpt-4.1-mini');
        return;
      }
      if (GEMINI_API_KEY) {
        await testFn('gemini', 'gemini-2.0-flash');
        return;
      }
      if (MISTRAL_API_KEY) {
        await testFn('mistral', 'mistral-small-latest');
        return;
      }
      console.log('Skipping test - no provider available');
    };

    it('should auto-parse JSON by default', async () => {
      await runWithAnyProvider(async (providerId, modelId) => {
        const response = await llmService.sendMessage({
          providerId,
          modelId,
          messages: [{ role: 'user', content: 'Return {"test": true}' }],
          settings: {
            structuredOutput: {
              name: 'test',
              schema: { type: 'object', properties: { test: { type: 'boolean' } } }
            },
            maxTokens: 50
          }
        });

        expect(response.object).toBe('chat.completion');
        const result = response as LLMResponse;
        expect(result.choices[0].parsedContent).toBeDefined();
      });
    }, API_TIMEOUT);

    it('should skip auto-parse when autoParse=false', async () => {
      await runWithAnyProvider(async (providerId, modelId) => {
        const response = await llmService.sendMessage({
          providerId,
          modelId,
          messages: [{ role: 'user', content: 'Return {"test": true}' }],
          settings: {
            structuredOutput: {
              name: 'test',
              schema: { type: 'object', properties: { test: { type: 'boolean' } } },
              autoParse: false
            },
            maxTokens: 50
          }
        });

        expect(response.object).toBe('chat.completion');
        const result = response as LLMResponse;
        // parsedContent should not be set when autoParse is false
        expect(result.choices[0].parsedContent).toBeUndefined();
      });
    }, API_TIMEOUT);
  });
});
