import { LlamaCppClientAdapter } from './LlamaCppClientAdapter';
import type { InternalLLMChatRequest } from './types';

// Mock OpenAI SDK
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Mock LlamaCppServerClient
jest.mock('./LlamaCppServerClient', () => {
  return {
    LlamaCppServerClient: jest.fn().mockImplementation(() => ({
      getHealth: mockGetHealth,
    })),
  };
});

const mockCreate = jest.fn();
const mockGetHealth = jest.fn();

describe('LlamaCppClientAdapter', () => {
  let adapter: LlamaCppClientAdapter;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    adapter = new LlamaCppClientAdapter();

    basicRequest = {
      providerId: 'llamacpp',
      modelId: 'llama-3-8b-instruct',
      messages: [
        { role: 'user', content: 'Hello, how are you?' },
      ],
      settings: {
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.95,
        stopSequences: [],
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        supportsSystemMessage: true,
        user: '' as any,
        geminiSafetySettings: [],
        reasoning: {
          enabled: false,
          exclude: false,
        },
        thinkingTagFallback: {
          enabled: false,
          tagName: 'thinking',
          enforce: true,
        },
      },
    };
  });

  describe('constructor', () => {
    it('should use default baseURL when not provided', () => {
      const adapterInfo = adapter.getAdapterInfo();
      expect(adapterInfo.baseURL).toBe('http://localhost:8080');
    });

    it('should use custom baseURL when provided', () => {
      const customAdapter = new LlamaCppClientAdapter({
        baseURL: 'http://localhost:9090',
      });
      const adapterInfo = customAdapter.getAdapterInfo();
      expect(adapterInfo.baseURL).toBe('http://localhost:9090');
    });

    it('should set checkHealth to false by default', () => {
      const adapter = new LlamaCppClientAdapter();
      expect((adapter as any).checkHealth).toBe(false);
    });

    it('should set checkHealth when provided', () => {
      const adapter = new LlamaCppClientAdapter({ checkHealth: true });
      expect((adapter as any).checkHealth).toBe(true);
    });
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'llama-3-8b-instruct',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'I am doing well, thank you!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      });

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].message.content).toBe('I am doing well, thank you!');
        expect(response.choices[0].finish_reason).toBe('stop');
        expect(response.usage).toEqual({
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        });
      }
    });

    it('should include system message when provided', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-124',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      });

      const requestWithSystem = {
        ...basicRequest,
        systemMessage: 'You are a helpful assistant.',
      };

      await adapter.sendMessage(requestWithSystem, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'system', content: 'You are a helpful assistant.' },
          ]),
        })
      );
    });

    it('should pass stop sequences when provided', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-125',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      });

      const requestWithStop = {
        ...basicRequest,
        settings: {
          ...basicRequest.settings,
          stopSequences: ['END', 'STOP'],
        },
      };

      await adapter.sendMessage(requestWithStop, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stop: ['END', 'STOP'],
        })
      );
    });

    it('should handle length finish reason', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-126',
        choices: [
          {
            message: { role: 'assistant', content: 'Response...' },
            finish_reason: 'length',
          },
        ],
      });

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].finish_reason).toBe('length');
      }
    });

    it('should handle completion without usage data', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-127',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        // No usage field
      });

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.usage).toBeUndefined();
      }
    });

    it('should handle multiple choices', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-128',
        choices: [
          {
            message: { role: 'assistant', content: 'First response' },
            finish_reason: 'stop',
          },
          {
            message: { role: 'assistant', content: 'Second response' },
            finish_reason: 'stop',
          },
        ],
      });

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].message.content).toBe('First response');
        expect(response.choices).toHaveLength(2);
        expect(response.choices[1].message.content).toBe('Second response');
      }
    });

    it('should extract reasoning_content when present and reasoning enabled', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-reasoning',
        object: 'chat.completion',
        created: 1677652288,
        model: 'qwen3-8b-instruct',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'The answer is 42.',
              reasoning_content: 'Let me think step by step. First, I consider the question...',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 25,
          total_tokens: 40,
        },
      });

      const requestWithReasoning = {
        ...basicRequest,
        settings: {
          ...basicRequest.settings,
          reasoning: {
            enabled: true,
            exclude: false,
          },
        },
      };

      const response = await adapter.sendMessage(requestWithReasoning, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].message.content).toBe('The answer is 42.');
        expect(response.choices[0].reasoning).toBe('Let me think step by step. First, I consider the question...');
      }
    });

    it('should exclude reasoning_content when reasoning.exclude is true', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-reasoning-excluded',
        object: 'chat.completion',
        created: 1677652288,
        model: 'qwen3-8b-instruct',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'The answer is 42.',
              reasoning_content: 'Let me think step by step...',
            },
            finish_reason: 'stop',
          },
        ],
      });

      const requestWithExclude = {
        ...basicRequest,
        settings: {
          ...basicRequest.settings,
          reasoning: {
            enabled: true,
            exclude: true,
          },
        },
      };

      const response = await adapter.sendMessage(requestWithExclude, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].message.content).toBe('The answer is 42.');
        expect(response.choices[0].reasoning).toBeUndefined();
      }
    });

    it('should check health before request when enabled', async () => {
      const healthCheckAdapter = new LlamaCppClientAdapter({ checkHealth: true });

      mockGetHealth.mockResolvedValueOnce({ status: 'ok' });
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-129',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      });

      const response = await healthCheckAdapter.sendMessage(basicRequest, 'not-needed');

      expect(mockGetHealth).toHaveBeenCalled();
      expect(response.object).toBe('chat.completion');
    });

    it('should return error when health check fails with error status', async () => {
      const healthCheckAdapter = new LlamaCppClientAdapter({ checkHealth: true });

      mockGetHealth.mockResolvedValueOnce({
        status: 'error',
        error: 'Model load failed'
      });

      const response = await healthCheckAdapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('error');
      if (response.object === 'error') {
        expect(response.error.message).toContain('server not ready');
        expect(response.error.message).toContain('Model load failed');
        expect(response.error.code).toBe('PROVIDER_ERROR');
      }
    });

    it('should return error when health check fails with loading status', async () => {
      const healthCheckAdapter = new LlamaCppClientAdapter({ checkHealth: true });

      mockGetHealth.mockResolvedValueOnce({ status: 'loading' });

      const response = await healthCheckAdapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('error');
      if (response.object === 'error') {
        expect(response.error.message).toContain('loading');
      }
    });

    it('should proceed with request if health check throws error', async () => {
      const healthCheckAdapter = new LlamaCppClientAdapter({ checkHealth: true });

      mockGetHealth.mockRejectedValueOnce(new Error('Connection refused'));
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-130',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      });

      const response = await healthCheckAdapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
    });

    it('should handle connection error to server', async () => {
      mockCreate.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('error');
      if (response.object === 'error') {
        expect(response.error.message).toContain('Cannot connect to llama.cpp server');
        expect(response.error.message).toContain('Is the server running?');
        expect(response.error.code).toBe('NETWORK_ERROR');
      }
    });

    it('should handle API errors', async () => {
      mockCreate.mockRejectedValueOnce({
        status: 400,
        message: 'Invalid request',
      });

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('error');
      if (response.object === 'error') {
        expect(response.error.code).toBeDefined();
      }
    });

    it('should handle error when no choices in response', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-131',
        choices: [],
      });

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('error');
    });
  });

  describe('validateApiKey', () => {
    it('should always return true (no API key required)', () => {
      expect(adapter.validateApiKey('')).toBe(true);
      expect(adapter.validateApiKey('any-string')).toBe(true);
      expect(adapter.validateApiKey('not-needed')).toBe(true);
    });
  });

  describe('getAdapterInfo', () => {
    it('should return adapter information', () => {
      const info = adapter.getAdapterInfo();

      expect(info.providerId).toBe('llamacpp');
      expect(info.name).toBe('llama.cpp Client Adapter');
      expect(info.version).toBe('1.0.0');
      expect(info.baseURL).toBe('http://localhost:8080');
    });

    it('should include custom baseURL in info', () => {
      const customAdapter = new LlamaCppClientAdapter({
        baseURL: 'http://gpu-server:8080',
      });

      const info = customAdapter.getAdapterInfo();
      expect(info.baseURL).toBe('http://gpu-server:8080');
    });
  });

  describe('getServerClient', () => {
    it('should return the underlying server client', () => {
      const serverClient = adapter.getServerClient();
      expect(serverClient).toBeDefined();
    });
  });

  describe('message formatting', () => {
    it('should format user messages correctly', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-132',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      });

      await adapter.sendMessage(basicRequest, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'user', content: 'Hello, how are you?' },
          ]),
        })
      );
    });

    it('should format assistant messages correctly', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-133',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      });

      const requestWithHistory = {
        ...basicRequest,
        messages: [
          { role: 'user' as const, content: 'Hi' },
          { role: 'assistant' as const, content: 'Hello!' },
          { role: 'user' as const, content: 'How are you?' },
        ],
      };

      await adapter.sendMessage(requestWithHistory, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello!' },
            { role: 'user', content: 'How are you?' },
          ],
        })
      );
    });

    it('should handle system messages in conversation', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-134',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      });

      const requestWithSystemInMessages = {
        ...basicRequest,
        messages: [
          { role: 'system' as const, content: 'Be concise' },
          { role: 'user' as const, content: 'Explain AI' },
        ],
      };

      await adapter.sendMessage(requestWithSystemInMessages, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'system', content: 'Be concise' },
          ]),
        })
      );
    });
  });

  describe('API parameter mapping', () => {
    it('should pass all standard parameters', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-135',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      });

      const fullRequest = {
        ...basicRequest,
        settings: {
          ...basicRequest.settings,
          temperature: 0.9,
          maxTokens: 2000,
          topP: 0.8,
          frequencyPenalty: 0.5,
          presencePenalty: 0.3,
          stopSequences: ['END'],
        },
      };

      await adapter.sendMessage(fullRequest, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'llama-3-8b-instruct',
          temperature: 0.9,
          max_tokens: 2000,
          top_p: 0.8,
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
          stop: ['END'],
        })
      );
    });

    it('should omit frequency penalty when zero', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-136',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      });

      await adapter.sendMessage(basicRequest, 'not-needed');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.frequency_penalty).toBeUndefined();
    });
  });
});
