import { LLMService, fromEnvironment } from '../src/index';
import type { ApiKeyProvider } from '../src/types';
import type { LLMResponse } from '../src/llm/types';

/**
 * Whether llama-server answered its health check, probed once in globalSetup
 * (see e2e-tests/globalSetup.js).
 *
 * Read at module scope so the suite can gate with `describe.skip`. Do NOT
 * reintroduce a runtime `if (!available) return;` inside a test body: Jest
 * scores an assertion-free function as **passed**, which reports green tests
 * that verified nothing.
 */
const LLAMACPP_AVAILABLE = process.env.E2E_LLAMACPP_AVAILABLE === 'true';

// Test-specific API key provider that looks for E2E-prefixed env vars
const e2eKeyProvider: ApiKeyProvider = async (providerId: string) => {
  if (providerId === 'llamacpp') return 'not-needed';
  const envVarName = `E2E_${providerId.toUpperCase()}_API_KEY`;
  return process.env[envVarName] || null;
};

const llmService = new LLMService(e2eKeyProvider);

// --- OpenAI Tests ---
const openaiApiKey = process.env.E2E_OPENAI_API_KEY;
(openaiApiKey ? describe : describe.skip)('OpenAI E2E', () => {
  it('should receive a valid response from gpt-4.1-nano', async () => {
    const response = await llmService.sendMessage({
      providerId: 'openai',
      modelId: 'gpt-4.1-nano',
      messages: [{ role: 'user', content: 'What is 1 + 1? Respond with the numerical answer only.' }],
      settings: { temperature: 0 }
    });
    
    expect(response.object).toBe('chat.completion');
    if (response.object === 'chat.completion') {
      const content = response.choices[0].message.content;
      expect(content).toBeDefined();
      expect(content).toContain('2');
    }
  });
});

// --- Anthropic Tests ---
const anthropicApiKey = process.env.E2E_ANTHROPIC_API_KEY;
(anthropicApiKey ? describe : describe.skip)('Anthropic E2E', () => {
  it('should receive a valid response from claude-3-5-haiku-20241022', async () => {
    const response = await llmService.sendMessage({
      providerId: 'anthropic',
      modelId: 'claude-3-5-haiku-20241022',
      messages: [{ role: 'user', content: 'What is 2 + 2? Respond with the numerical answer only.' }],
      settings: { temperature: 0 }
    });

    expect(response.object).toBe('chat.completion');
    if (response.object === 'chat.completion') {
      const content = response.choices[0].message.content;
      expect(content).toBeDefined();
      expect(content).toContain('4');
    }
  });
});

// --- Gemini Tests ---
const geminiApiKey = process.env.E2E_GEMINI_API_KEY;
(geminiApiKey ? describe : describe.skip)('Gemini E2E', () => {
  it('should receive a valid response from gemini-2.5-flash-lite', async () => {
    const response = await llmService.sendMessage({
      providerId: 'gemini',
      modelId: 'gemini-2.5-flash-lite',
      messages: [{ role: 'user', content: 'What is 3 + 3? Respond with the numerical answer only.' }],
      settings: { temperature: 0 }
    });

    expect(response.object).toBe('chat.completion');
    if (response.object === 'chat.completion') {
      const content = response.choices[0].message.content;
      expect(content).toBeDefined();
      expect(content).toContain('6');
    }
  });

  it('should receive a valid response from gemma-3-27b-it (free open model)', async () => {
    const response = await llmService.sendMessage({
      providerId: 'gemini',
      modelId: 'gemma-3-27b-it',
      messages: [{ role: 'user', content: 'What is 4 + 4? Respond with the numerical answer only.' }],
      settings: { temperature: 0 }
    });

    expect(response.object).toBe('chat.completion');
    if (response.object === 'chat.completion') {
      const content = response.choices[0].message.content;
      expect(content).toBeDefined();
      expect(content).toContain('8');
    }
  });
});

// --- llama.cpp Tests (FREE - Local Server) ---
(LLAMACPP_AVAILABLE ? describe : describe.skip)('llama.cpp E2E (local, free)', () => {
  it('should receive a valid response from local llama-server', async () => {
    const response = await llmService.sendMessage({
      providerId: 'llamacpp',
      modelId: 'local-model',
      messages: [{ role: 'user', content: 'What is 5 + 5? Respond with the numerical answer only.' }],
      settings: { temperature: 0 }
    });

    expect(response.object).toBe('chat.completion');
    if (response.object === 'chat.completion') {
      const content = response.choices[0].message.content;
      expect(content).toBeDefined();
      expect(content).toContain('10');
    }
  }, 60000);

  it('should handle system messages correctly', async () => {
    const response = await llmService.sendMessage({
      providerId: 'llamacpp',
      modelId: 'local-model',
      messages: [
        { role: 'system', content: 'You are a math tutor. Be concise.' },
        { role: 'user', content: 'What is 7 * 8?' }
      ],
      settings: { temperature: 0 }
    });

    expect(response.object).toBe('chat.completion');
    if (response.object === 'chat.completion') {
      const content = response.choices[0].message.content;
      expect(content).toBeDefined();
      expect(content).toContain('56');
    }
  }, 60000);
});