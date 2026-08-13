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
      getModels: mockGetModels,
    })),
  };
});

const mockCreate = jest.fn();
const mockGetHealth = jest.fn();
const mockGetModels = jest.fn();

describe('LlamaCppClientAdapter', () => {
  let adapter: LlamaCppClientAdapter;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetModels.mockResolvedValue({ data: [{ id: 'some-custom-model.gguf' }] });

    adapter = new LlamaCppClientAdapter();

    basicRequest = {
      providerId: 'llamacpp',
      modelId: 'llamacpp',
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
        topK: undefined as any,
        minP: undefined as any,
        repeatPenalty: undefined as any,
        seed: undefined as any,
        logprobs: undefined as any,
        topLogprobs: undefined as any,
        llamacpp: undefined as any,
        supportsSystemMessage: true,
        systemMessageFallback: { format: 'xml', tagName: 'system', separator: '---' },
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
        openRouterProvider: undefined as any,
        structuredOutput: undefined as any,
      },
    };
  });

  describe('constructor', () => {
    it('should use default baseURL when not provided', () => {
      const adapterInfo = adapter.getAdapterInfo();
      expect(adapterInfo.baseURL).toBe('http://127.0.0.1:8080');
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
        model: 'llamacpp',
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
      expect(info.baseURL).toBe('http://127.0.0.1:8080');
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
          model: 'llamacpp',
          temperature: 0.9,
          max_tokens: 2000,
          top_p: 0.8,
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
          stop: ['END'],
        })
      );
    });

    it('should pass llama.cpp-native sampling params (top_k, min_p, repeat_penalty, seed)', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-sampling',
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
          topK: 20,
          minP: 0,
          repeatPenalty: 1.0,
          seed: 42,
        },
      };

      await adapter.sendMessage(fullRequest, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          top_k: 20,
          min_p: 0,
          repeat_penalty: 1.0,
          seed: 42,
        })
      );
    });

    it('should omit llama.cpp-native sampling params when unset', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-nosampling',
        choices: [
          {
            message: { role: 'assistant', content: 'Response' },
            finish_reason: 'stop',
          },
        ],
      });

      await adapter.sendMessage(basicRequest, 'not-needed');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('top_k');
      expect(callArgs).not.toHaveProperty('min_p');
      expect(callArgs).not.toHaveProperty('repeat_penalty');
      expect(callArgs).not.toHaveProperty('seed');
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

  describe('reasoning toggle and thinking extraction', () => {
    const okResponse = (content: string, extra?: Record<string, any>) => ({
      id: 'chatcmpl-think',
      choices: [
        {
          message: { role: 'assistant', content, ...extra },
          finish_reason: 'stop',
        },
      ],
    });

    it('sends enable_thinking:false for detected hybrid models when reasoning is off', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });
      mockCreate.mockResolvedValueOnce(okResponse('Hello'));

      await adapter.sendMessage(basicRequest, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_template_kwargs: { enable_thinking: false },
        })
      );
    });

    it('sends enable_thinking:true when reasoning is enabled', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'gemma-4-E4B-it-Q4_K_M.gguf' }] });
      mockCreate.mockResolvedValueOnce(okResponse('Hello'));

      basicRequest.settings.reasoning = { enabled: true, exclude: false } as any;
      await adapter.sendMessage(basicRequest, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_template_kwargs: { enable_thinking: true },
        })
      );
    });

    it('sends no chat_template_kwargs for unrecognized models', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'some-custom-model.gguf' }] });
      mockCreate.mockResolvedValueOnce(okResponse('Hello'));

      await adapter.sendMessage(basicRequest, 'not-needed');

      expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('chat_template_kwargs');
    });

    it('sends no chat_template_kwargs for always-on reasoning models (GPT-OSS)', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'gpt-oss-20b-mxfp4.gguf' }] });
      mockCreate.mockResolvedValueOnce(okResponse('Hello'));

      await adapter.sendMessage(basicRequest, 'not-needed');

      expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('chat_template_kwargs');
    });

    it('rejects assistant prefill when thinking is enabled', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });

      basicRequest.settings.reasoning = { enabled: true, exclude: false } as any;
      basicRequest.messages = [
        { role: 'user', content: 'Question?' },
        { role: 'assistant', content: 'Partial answer' },
      ];

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('error');
      if (response.object === 'error') {
        expect(response.error.type).toBe('invalid_request_error');
        expect(response.error.message).toContain('assistant prefill');
      }
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('strips the template-injected nothink prefix from content', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });
      mockCreate.mockResolvedValueOnce(okResponse('<think>\n\n</think>\n\nClean answer'));

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].message.content).toBe('Clean answer');
        expect(response.choices[0].reasoning).toBeUndefined();
      }
    });

    it('falls back to marker extraction when reasoning_content is absent', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });
      mockCreate.mockResolvedValueOnce(
        okResponse('<think>Step by step...</think>The answer is 42.')
      );

      basicRequest.settings.reasoning = { enabled: true, exclude: false } as any;
      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].message.content).toBe('The answer is 42.');
        expect(response.choices[0].reasoning).toBe('Step by step...');
      }
    });

    it('prefers reasoning_content over marker extraction', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });
      mockCreate.mockResolvedValueOnce(
        okResponse('The answer is 42.', { reasoning_content: 'Native trace' })
      );

      basicRequest.settings.reasoning = { enabled: true, exclude: false } as any;
      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      if (response.object === 'chat.completion') {
        expect(response.choices[0].reasoning).toBe('Native trace');
        expect(response.choices[0].message.content).toBe('The answer is 42.');
      }
    });

    it('extracts markers for always-on models even without reasoning.enabled', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3-4B-Thinking-2507-Q4_K_M.gguf' }] });
      mockCreate.mockResolvedValueOnce(okResponse('<think>Always thinking</think>Done.'));

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      if (response.object === 'chat.completion') {
        expect(response.choices[0].message.content).toBe('Done.');
        expect(response.choices[0].reasoning).toBe('Always thinking');
      }
      expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('chat_template_kwargs');
    });
  });

  describe('assistant prefill echo normalization', () => {
    const completion = (
      content: string,
      extra?: Record<string, any>
    ) => ({
      id: 'chatcmpl-prefill',
      object: 'chat.completion',
      created: 1677652288,
      model: 'llamacpp',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'length',
          ...extra,
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 1,
        total_tokens: 11,
      },
    });

    it('returns the sampled continuation while preserving echoed raw and logprob evidence', async () => {
      mockCreate.mockResolvedValueOnce(
        completion('1: no', {
          logprobs: {
            content: [
              {
                token: ' no',
                logprob: -0.8,
                top_logprobs: [
                  { token: ' unlikely', logprob: -0.4 },
                  { token: ' no', logprob: -0.8 },
                ],
              },
            ],
          },
        })
      );
      basicRequest.messages = [
        { role: 'user', content: 'Choose yes or no.' },
        { role: 'assistant', content: '1:' },
      ];
      basicRequest.settings.maxTokens = 1;
      basicRequest.settings.logprobs = true;
      basicRequest.settings.topLogprobs = 2;

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0]).toMatchObject({
          message: { role: 'assistant', content: ' no' },
          rawContent: '1: no',
          rawContentParts: [{ type: 'text', text: '1: no' }],
          logprobs: [
            {
              token: ' no',
              logprob: -0.8,
              topLogprobs: [
                { token: ' unlikely', logprob: -0.4 },
                { token: ' no', logprob: -0.8 },
              ],
            },
          ],
          finish_reason: 'length',
          termination: {
            rawReason: 'length',
            kind: 'limit',
          },
          answerAccounting: {
            providerOutput: {
              tokens: 1,
              reasoning: 'included_native',
            },
          },
        });
        expect(response.usage).toEqual({
          prompt_tokens: 10,
          completion_tokens: 1,
          total_tokens: 11,
        });
      }
    });

    it.each([
      {
        name: 'multiline accumulated prefill',
        messages: [
          { role: 'user', content: 'Answer both.' },
          { role: 'assistant', content: '1: yes\n2:' },
        ],
        raw: '1: yes\n2: no',
        expected: ' no',
      },
      {
        name: 'continuation without leading whitespace',
        messages: [
          { role: 'user', content: 'Explain.' },
          { role: 'assistant', content: '1:' },
        ],
        raw: '1:Because the premise follows.',
        expected: 'Because the premise follows.',
      },
      {
        name: 'continuation-only provider response',
        messages: [
          { role: 'user', content: 'Choose.' },
          { role: 'assistant', content: '1:' },
        ],
        raw: ' no',
        expected: ' no',
      },
      {
        name: 'request without a trailing assistant message',
        messages: [{ role: 'user', content: 'Choose.' }],
        raw: '1: no',
        expected: '1: no',
      },
      {
        name: 'empty trailing assistant message',
        messages: [
          { role: 'user', content: 'Choose.' },
          { role: 'assistant', content: '' },
        ],
        raw: ' no',
        expected: ' no',
      },
      {
        name: 'response equal to the prefill',
        messages: [
          { role: 'user', content: 'Continue.' },
          { role: 'assistant', content: '1:' },
        ],
        raw: '1:',
        expected: '',
      },
      {
        name: 'exactly one repeated prefill',
        messages: [
          { role: 'user', content: 'Continue.' },
          { role: 'assistant', content: '1:' },
        ],
        raw: '1:1: yes',
        expected: '1: yes',
      },
    ])('handles $name', async ({ messages, raw, expected }) => {
      mockCreate.mockResolvedValueOnce(completion(raw));
      basicRequest.messages = messages as any;

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].message.content).toBe(expected);
        expect(response.choices[0].rawContent).toBe(raw);
      }
    });

    it('normalizes every returned choice against the same outbound prefill', async () => {
      mockCreate.mockResolvedValueOnce({
        ...completion('unused'),
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '1: yes' },
            finish_reason: 'stop',
          },
          {
            index: 1,
            message: { role: 'assistant', content: '1: no' },
            finish_reason: 'stop',
          },
        ],
      });
      basicRequest.messages = [
        { role: 'user', content: 'Choose.' },
        { role: 'assistant', content: '1:' },
      ];

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices.map((choice) => choice.message.content)).toEqual([
          ' yes',
          ' no',
        ]);
        expect(response.choices.map((choice) => choice.rawContent)).toEqual([
          '1: yes',
          '1: no',
        ]);
      }
    });

    it('strips the no-thinking prefix before the echoed assistant prefill', async () => {
      const nothinkPrefix = '<think>\n\n</think>\n\n';
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });
      mockCreate.mockResolvedValueOnce(completion(`${nothinkPrefix}1: yes`));
      basicRequest.messages = [
        { role: 'user', content: 'Choose.' },
        { role: 'assistant', content: '1:' },
      ];

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].message.content).toBe(' yes');
        expect(response.choices[0].rawContent).toBe(`${nothinkPrefix}1: yes`);
      }
    });

    it('strips the echoed prefill before existing reasoning-marker extraction', () => {
      const request = {
        ...basicRequest,
        messages: [
          { role: 'user' as const, content: 'Explain.' },
          { role: 'assistant' as const, content: '1:' },
        ],
        settings: {
          ...basicRequest.settings,
          reasoning: { enabled: true, exclude: false },
        },
      };
      const response = (adapter as any).createSuccessResponse(
        completion('1:<think>Reasoning</think>Answer'),
        request,
        {
          localReasoning: { markers: ['<think>', '</think>'] },
        },
        '1:'
      );

      expect(response.choices[0]).toMatchObject({
        message: { content: 'Answer' },
        reasoning: 'Reasoning',
        rawContent: '1:<think>Reasoning</think>Answer',
      });
    });
  });

  describe('grammar and logprobs', () => {
    const okResponse = (content: string, extra?: Record<string, any>) => ({
      id: 'chatcmpl-gl',
      choices: [
        {
          message: { role: 'assistant', content },
          finish_reason: 'stop',
          ...extra,
        },
      ],
    });

    it('sends a GBNF grammar from the llamacpp namespace', async () => {
      mockCreate.mockResolvedValueOnce(okResponse('yes'));

      basicRequest.settings.llamacpp = { grammar: 'root ::= "yes" | "no"' };
      await adapter.sendMessage(basicRequest, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ grammar: 'root ::= "yes" | "no"' })
      );
    });

    it('lets user chatTemplateKwargs override the derived enable_thinking', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });
      mockCreate.mockResolvedValueOnce(okResponse('Hello'));

      // Reasoning off would derive enable_thinking:false; the explicit user kwarg wins
      basicRequest.settings.llamacpp = { chatTemplateKwargs: { enable_thinking: true } };
      await adapter.sendMessage(basicRequest, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_template_kwargs: { enable_thinking: true },
        })
      );
    });

    it('sends user chatTemplateKwargs even without a detected toggle', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'some-custom-model.gguf' }] });
      mockCreate.mockResolvedValueOnce(okResponse('Hello'));

      basicRequest.settings.llamacpp = { chatTemplateKwargs: { custom_flag: 'on' } };
      await adapter.sendMessage(basicRequest, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_template_kwargs: { custom_flag: 'on' },
        })
      );
    });

    it('applies the prefill guard to user-forced enable_thinking', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'some-custom-model.gguf' }] });

      basicRequest.settings.llamacpp = { chatTemplateKwargs: { enable_thinking: true } };
      basicRequest.messages = [
        { role: 'user', content: 'Q' },
        { role: 'assistant', content: 'partial' },
      ];

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(response.object).toBe('error');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('requests and maps logprobs (OpenAI-compatible shape)', async () => {
      mockCreate.mockResolvedValueOnce(
        okResponse('yes', {
          logprobs: {
            content: [
              {
                token: 'yes',
                logprob: -0.01,
                top_logprobs: [
                  { token: 'yes', logprob: -0.01 },
                  { token: 'no', logprob: -4.2 },
                ],
              },
            ],
          },
        })
      );

      basicRequest.settings.logprobs = true;
      basicRequest.settings.topLogprobs = 5;
      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ logprobs: true, top_logprobs: 5 })
      );
      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].logprobs).toEqual([
          {
            token: 'yes',
            logprob: -0.01,
            topLogprobs: [
              { token: 'yes', logprob: -0.01 },
              { token: 'no', logprob: -4.2 },
            ],
          },
        ]);
      }
    });

    it('omits logprobs request params and response field when not requested', async () => {
      mockCreate.mockResolvedValueOnce(okResponse('Hello'));

      const response = await adapter.sendMessage(basicRequest, 'not-needed');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('logprobs');
      expect(callArgs).not.toHaveProperty('top_logprobs');
      if (response.object === 'chat.completion') {
        expect(response.choices[0].logprobs).toBeUndefined();
      }
    });
  });

  describe('streamMessage', () => {
    const streamFrom = async function* (chunks: any[]) {
      for (const chunk of chunks) {
        if (chunk instanceof Error) {
          throw chunk;
        }
        yield chunk;
      }
    };

    const collectEvents = async (request = basicRequest, options?: any) => {
      const events = [];
      for await (const event of adapter.streamMessage(request, 'not-needed', options)) {
        events.push(event);
      }
      return events;
    };

    const chunk = (content: string, extra?: Record<string, any>) => ({
      id: 'chatcmpl-stream',
      object: 'chat.completion.chunk',
      created: 1677652288,
      model: 'llamacpp',
      choices: [
        {
          index: 0,
          delta: { content, ...extra },
          finish_reason: null,
        },
      ],
    });

    it('streams content deltas and a final normalized response', async () => {
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('Hello '),
        {
          ...chunk('world'),
          choices: [{ index: 0, delta: { content: 'world' }, finish_reason: 'stop' }],
        },
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1677652288,
          model: 'llamacpp',
          choices: [],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        },
      ]));

      const events = await collectEvents();

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        stream: true,
        stream_options: { include_usage: true },
      }));
      expect(events.find((event) => event.type === "start")).toMatchObject({
        type: 'start',
        provider: 'llamacpp',
        model: 'llamacpp',
        id: 'chatcmpl-stream',
      });
      expect(events.filter((event) => event.type === 'content_delta').map((event) => event.delta).join(''))
        .toBe('Hello world');
      expect(events.some((event) => event.type === 'usage')).toBe(true);
      const complete = events[events.length - 1] as any;
      expect(complete.type).toBe('complete');
      expect(complete.response.choices[0].message.content).toBe('Hello world');
      expect(
        complete.response.choices[0].answerAccounting?.providerOutput
      ).toMatchObject({
        tokens: 3,
        reasoning: "included_native",
      });
      expect(complete.response.usage).toEqual({
        prompt_tokens: 2,
        completion_tokens: 3,
        total_tokens: 5,
      });
    });

    it('streams provider-specific reasoning deltas and includes reasoning in the final response', async () => {
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('', { reasoning_content: 'Think. ' }),
        {
          ...chunk('Answer.'),
          choices: [{ index: 0, delta: { content: 'Answer.' }, finish_reason: 'stop' }],
        },
      ]));

      basicRequest.settings.reasoning = { enabled: true, exclude: false } as any;
      const events = await collectEvents();

      expect(events.find((event) => event.type === 'reasoning_delta')).toMatchObject({
        type: 'reasoning_delta',
        delta: 'Think. ',
      });
      const complete = events[events.length - 1] as any;
      expect(complete.response.choices[0].reasoning).toBe('Think. ');
      expect(complete.response.choices[0].message.content).toBe('Answer.');
    });

    it('suppresses the live nothink prefix and returns cleaned final content', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('<think>\n\n'),
        chunk('</think>\n\nClean'),
        {
          ...chunk(' answer'),
          choices: [{ index: 0, delta: { content: ' answer' }, finish_reason: 'stop' }],
        },
      ]));

      const events = await collectEvents();
      const liveContent = events
        .filter((event) => event.type === 'content_delta')
        .map((event) => event.delta)
        .join('');
      const complete = events[events.length - 1] as any;

      expect(liveContent).toBe('Clean answer');
      expect(complete.response.choices[0].message.content).toBe('Clean answer');
    });

    it('suppresses an echoed assistant prefill while retaining every raw delta', async () => {
      basicRequest.messages = [
        { role: 'user', content: 'Choose.' },
        { role: 'assistant', content: '1:' },
      ];
      mockCreate.mockResolvedValueOnce(streamFrom([
        {
          ...chunk('1: yes'),
          choices: [{ index: 0, delta: { content: '1: yes' }, finish_reason: 'stop' }],
        },
      ]));

      const events = await collectEvents();
      const liveContent = events
        .filter((event) => event.type === 'content_delta')
        .map((event) => event.delta)
        .join('');
      const rawContent = events
        .filter((event) => event.type === 'adapter_evidence')
        .map((event: any) => event.observedEvidence.choice?.rawContentDelta || '')
        .join('');
      const complete = events[events.length - 1] as any;

      expect(liveContent).toBe(' yes');
      expect(rawContent).toBe('1: yes');
      expect(complete.response.choices[0]).toMatchObject({
        message: { content: ' yes' },
        rawContent: '1: yes',
        rawContentParts: [{ type: 'text', text: '1: yes' }],
      });
    });

    it('suppresses an echoed prefill split at every content boundary', async () => {
      basicRequest.messages = [
        { role: 'user', content: 'Choose.' },
        { role: 'assistant', content: '1:' },
      ];
      const raw = '1: yes';

      for (let boundary = 1; boundary < raw.length; boundary += 1) {
        mockCreate.mockResolvedValueOnce(streamFrom([
          chunk(raw.slice(0, boundary)),
          {
            ...chunk(raw.slice(boundary)),
            choices: [{
              index: 0,
              delta: { content: raw.slice(boundary) },
              finish_reason: 'stop',
            }],
          },
        ]));

        const events = await collectEvents();
        const liveContent = events
          .filter((event) => event.type === 'content_delta')
          .map((event) => event.delta)
          .join('');
        const complete = events[events.length - 1] as any;

        expect(liveContent).toBe(' yes');
        expect(complete.response.choices[0].message.content).toBe(' yes');
        expect(complete.response.choices[0].rawContent).toBe(raw);
      }
    });

    it('flushes every buffered character when a possible prefill diverges', async () => {
      basicRequest.messages = [
        { role: 'user', content: 'Continue.' },
        { role: 'assistant', content: 'abcdef' },
      ];
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('abc'),
        {
          ...chunk('X rest'),
          choices: [{ index: 0, delta: { content: 'X rest' }, finish_reason: 'stop' }],
        },
      ]));

      const events = await collectEvents();
      const liveContent = events
        .filter((event) => event.type === 'content_delta')
        .map((event) => event.delta)
        .join('');
      const complete = events[events.length - 1] as any;

      expect(liveContent).toBe('abcX rest');
      expect(complete.response.choices[0].message.content).toBe('abcX rest');
    });

    it('reconsiders a failed no-thinking candidate as the assistant prefill', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });
      basicRequest.messages = [
        { role: 'user', content: 'Continue.' },
        { role: 'assistant', content: '<thinking prefill>' },
      ];
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('<thi'),
        {
          ...chunk('nking prefill> continuation'),
          choices: [{
            index: 0,
            delta: { content: 'nking prefill> continuation' },
            finish_reason: 'stop',
          }],
        },
      ]));

      const events = await collectEvents();
      const liveContent = events
        .filter((event) => event.type === 'content_delta')
        .map((event) => event.delta)
        .join('');
      const complete = events[events.length - 1] as any;

      expect(liveContent).toBe(' continuation');
      expect(complete.response.choices[0].message.content).toBe(' continuation');
    });

    it('composes chunked no-thinking and assistant-prefill cleanup', async () => {
      const nothinkPrefix = '<think>\n\n</think>\n\n';
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });
      basicRequest.messages = [
        { role: 'user', content: 'Choose.' },
        { role: 'assistant', content: '1:' },
      ];
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('<think>\n'),
        chunk('\n</think>\n\n1'),
        {
          ...chunk(': yes'),
          choices: [{ index: 0, delta: { content: ': yes' }, finish_reason: 'stop' }],
        },
      ]));

      const events = await collectEvents();
      const liveContent = events
        .filter((event) => event.type === 'content_delta')
        .map((event) => event.delta)
        .join('');
      const complete = events[events.length - 1] as any;

      expect(liveContent).toBe(' yes');
      expect(complete.response.choices[0].message.content).toBe(' yes');
      expect(complete.response.choices[0].rawContent).toBe(`${nothinkPrefix}1: yes`);
    });

    it('fails open for an unresolved partial prefill at normal stream end', async () => {
      basicRequest.messages = [
        { role: 'user', content: 'Continue.' },
        { role: 'assistant', content: 'abcdef' },
      ];
      mockCreate.mockResolvedValueOnce(streamFrom([chunk('abc')]));

      const events = await collectEvents();
      const liveContent = events
        .filter((event) => event.type === 'content_delta')
        .map((event) => event.delta)
        .join('');
      const complete = events[events.length - 1] as any;

      expect(liveContent).toBe('abc');
      expect(complete.response.choices[0].message.content).toBe('abc');
      expect(complete.response.choices[0].rawContent).toBe('abc');
    });

    it('fails open for an unresolved partial prefill before a stream error', async () => {
      basicRequest.messages = [
        { role: 'user', content: 'Continue.' },
        { role: 'assistant', content: 'abcdef' },
      ];
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('abc'),
        new Error('stream broke'),
      ]));

      const events = await collectEvents();
      const liveContent = events
        .filter((event) => event.type === 'content_delta')
        .map((event) => event.delta)
        .join('');
      const error = events[events.length - 1] as any;

      expect(liveContent).toBe('abc');
      expect(error.type).toBe('error');
      expect(error.error.partialResponse?.choices[0]).toMatchObject({
        message: { content: 'abc' },
        rawContent: 'abc',
        rawContentParts: [{ type: 'text', text: 'abc' }],
      });
    });

    it('keeps normalized deltas and partial response aligned after a stripped echo', async () => {
      basicRequest.messages = [
        { role: 'user', content: 'Continue.' },
        { role: 'assistant', content: '1:' },
      ];
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('1:'),
        chunk(' partial'),
        new Error('stream broke'),
      ]));

      const events = await collectEvents();
      const liveContent = events
        .filter((event) => event.type === 'content_delta')
        .map((event) => event.delta)
        .join('');
      const error = events[events.length - 1] as any;

      expect(liveContent).toBe(' partial');
      expect(error.error.partialResponse?.choices[0]).toMatchObject({
        message: { content: ' partial' },
        rawContent: '1: partial',
        rawContentParts: [{ type: 'text', text: '1: partial' }],
      });
    });

    it('returns health-check errors without starting a stream', async () => {
      const healthCheckAdapter = new LlamaCppClientAdapter({ checkHealth: true });
      mockGetHealth.mockResolvedValueOnce({ status: 'loading' });

      const events = [];
      for await (const event of healthCheckAdapter.streamMessage(basicRequest, 'not-needed')) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'error',
        error: {
          error: { type: 'server_not_ready' },
        },
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('applies the assistant prefill guard before streaming', async () => {
      mockGetModels.mockResolvedValue({ data: [{ id: 'Qwen3.5-4B-Q4_K_M.gguf' }] });
      basicRequest.settings.reasoning = { enabled: true, exclude: false } as any;
      basicRequest.messages = [
        { role: 'user', content: 'Q' },
        { role: 'assistant', content: 'partial' },
      ];

      const events = await collectEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'error',
        error: {
          error: { type: 'invalid_request_error' },
        },
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('passes abort and timeout options to the OpenAI SDK stream call', async () => {
      const controller = new AbortController();
      mockCreate.mockResolvedValueOnce(streamFrom([
        {
          ...chunk('Hi'),
          choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }],
        },
      ]));

      await collectEvents(basicRequest, { signal: controller.signal, timeoutMs: 1234 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stream: true }),
        expect.objectContaining({ signal: controller.signal, timeout: 1234 })
      );
    });

    it('emits an error with partialResponse when the stream throws after content', async () => {
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('Partial'),
        new Error('stream broke'),
      ]));

      const events = await collectEvents();
      const error = events[events.length - 1] as any;

      expect(error.type).toBe('error');
      expect(error.error.partialResponse?.choices[0].message.content).toBe('Partial');
    });

    it('maps connection errors and clears the model cache', async () => {
      const clearSpy = jest.spyOn(adapter, 'clearModelCache');
      mockCreate.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

      const events = await collectEvents();

      expect(events[0]).toMatchObject({
        type: 'error',
        error: {
          error: { code: 'NETWORK_ERROR' },
        },
      });
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });
});
