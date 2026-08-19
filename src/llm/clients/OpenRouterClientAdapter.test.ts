import OpenAI from 'openai';
import { OpenRouterClientAdapter } from './OpenRouterClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type { LLMResponse, LLMFailureResponse } from '../types';

// Mock the entire 'openai' module
jest.mock('openai');

// Cast the mocked module to allow setting up mock implementations
const MockOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

describe('OpenRouterClientAdapter', () => {
  let adapter: OpenRouterClientAdapter;
  let mockCreate: jest.Mock;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    // Reset mocks before each test
    MockOpenAI.mockClear();
    mockCreate = jest.fn();

    // Mock the chat.completions.create method
    MockOpenAI.prototype.chat = {
      completions: {
        create: mockCreate,
      },
    } as any;

    adapter = new OpenRouterClientAdapter();
    basicRequest = {
      providerId: 'openrouter',
      modelId: 'google/gemma-3-27b-it:free',
      messages: [{ role: 'user', content: 'Hello' }],
      settings: {
        temperature: 0.7,
        maxTokens: 100,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        topK: undefined as any,
        minP: undefined as any,
        repeatPenalty: undefined as any,
        seed: undefined as any,
        logprobs: undefined as any,
        topLogprobs: undefined as any,
        llamacpp: undefined as any,
        stopSequences: [],
        user: undefined as any,
        geminiSafetySettings: [],
        supportsSystemMessage: true,
        systemMessageFallback: { format: 'xml', tagName: 'system', separator: '---' },
        reasoning: {
          enabled: false,
          effort: undefined as any,
          maxTokens: undefined as any,
          exclude: false
        },
        thinkingTagFallback: {
          enabled: true,
          tagName: 'thinking'
        },
        openRouterProvider: undefined as any,
        structuredOutput: undefined as any
      }
    };
  });

  describe('sendMessage', () => {
    it('should pass through top_k, min_p, repetition_penalty and seed', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'gen-sampling',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hi' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });

      basicRequest.settings.topK = 64;
      basicRequest.settings.minP = 0;
      basicRequest.settings.repeatPenalty = 1.0;
      basicRequest.settings.seed = 42;

      await adapter.sendMessage(basicRequest, 'sk-or-test-api-key-1234567890123456789012345678901234567890');

      const params = mockCreate.mock.calls[0][0];
      expect(params.top_k).toBe(64);
      expect(params.min_p).toBe(0);
      expect(params.repetition_penalty).toBe(1.0);
      expect(params.seed).toBe(42);
    });

    it('should pass through logprobs request params and map the response', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'gen-lp',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hi' },
          finish_reason: 'stop',
          logprobs: { content: [{ token: 'Hi', logprob: -0.2 }] }
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });

      basicRequest.settings.logprobs = true;

      const response = await adapter.sendMessage(
        basicRequest,
        'sk-or-test-api-key-1234567890123456789012345678901234567890'
      );

      expect(mockCreate.mock.calls[0][0].logprobs).toBe(true);
      if (response.object === 'chat.completion') {
        expect(response.choices[0].logprobs).toEqual([{ token: 'Hi', logprob: -0.2 }]);
      }
    });

    describe('reasoning forwarding', () => {
      const okResponse = (extra?: Record<string, any>) => ({
        id: 'gen-reasoning',
        object: 'chat.completion',
        created: 1234567890,
        model: 'some-vendor/some-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hi', ...extra },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });
      const KEY = 'sk-or-test-api-key-1234567890123456789012345678901234567890';

      it('sends reasoning.enabled when reasoning is requested without effort/maxTokens', async () => {
        mockCreate.mockResolvedValueOnce(okResponse());
        basicRequest.settings.reasoning = { enabled: true, exclude: false } as any;

        await adapter.sendMessage(basicRequest, KEY);

        expect(mockCreate.mock.calls[0][0].reasoning).toEqual({ enabled: true });
      });

      it('sends reasoning.effort when effort is set', async () => {
        mockCreate.mockResolvedValueOnce(okResponse());
        basicRequest.settings.reasoning = { enabled: true, effort: 'high', exclude: false } as any;

        await adapter.sendMessage(basicRequest, KEY);

        expect(mockCreate.mock.calls[0][0].reasoning).toEqual({ effort: 'high' });
      });

      it('prefers max_tokens over effort when both are set (effort and max_tokens are mutually exclusive)', async () => {
        mockCreate.mockResolvedValueOnce(okResponse());
        basicRequest.settings.reasoning = {
          enabled: true, effort: 'high', maxTokens: 2048, exclude: false
        } as any;

        await adapter.sendMessage(basicRequest, KEY);

        expect(mockCreate.mock.calls[0][0].reasoning).toEqual({ max_tokens: 2048 });
      });

      it('adds exclude:true when reasoning.exclude is set', async () => {
        mockCreate.mockResolvedValueOnce(okResponse());
        basicRequest.settings.reasoning = { enabled: true, exclude: true } as any;

        await adapter.sendMessage(basicRequest, KEY);

        expect(mockCreate.mock.calls[0][0].reasoning).toEqual({ enabled: true, exclude: true });
      });

      it('sends no reasoning param when reasoning is not requested', async () => {
        mockCreate.mockResolvedValueOnce(okResponse());

        await adapter.sendMessage(basicRequest, KEY);

        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('reasoning');
      });

      it('extracts message.reasoning and reasoning_details from the response', async () => {
        mockCreate.mockResolvedValueOnce(okResponse({
          reasoning: 'Thinking about it...',
          reasoning_details: [{ type: 'reasoning.text', text: 'Thinking about it...' }],
        }));
        basicRequest.settings.reasoning = { enabled: true, exclude: false } as any;

        const response = await adapter.sendMessage(basicRequest, KEY);

        expect(response.object).toBe('chat.completion');
        if (response.object === 'chat.completion') {
          expect(response.choices[0].reasoning).toBe('Thinking about it...');
          expect(response.choices[0].reasoning_details).toEqual([
            { type: 'reasoning.text', text: 'Thinking about it...' },
          ]);
        }
      });

      it('drops response reasoning when exclude is set', async () => {
        mockCreate.mockResolvedValueOnce(okResponse({ reasoning: 'hidden trace' }));
        basicRequest.settings.reasoning = { enabled: true, exclude: true } as any;

        const response = await adapter.sendMessage(basicRequest, KEY);

        if (response.object === 'chat.completion') {
          expect(response.choices[0].reasoning).toBeUndefined();
        }
      });
    });

    it('should format the request correctly and call the OpenRouter API', async () => {
      // Setup mock response
      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you today?'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      });

      const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-api-key');

      // Verify OpenAI was instantiated with the API key and OpenRouter base URL
      expect(MockOpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-or-v1-test-api-key',
        maxRetries: 0,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {}
      });

      // Verify the create method was called with correct parameters
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'google/gemma-3-27b-it:free',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_tokens: 100,
        top_p: 1
      });

      // Verify the response
      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.id).toBe('gen-123');
      expect(successResponse.provider).toBe('openrouter');
      expect(successResponse.model).toBe('google/gemma-3-27b-it:free');
      expect(successResponse.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(successResponse.usage?.total_tokens).toBe(30);
    });

    it('should handle system messages correctly', async () => {
      basicRequest.messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' }
      ];

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' }
        ]
      }));
    });

    it('should handle stop sequences correctly', async () => {
      basicRequest.settings.stopSequences = ['END', 'STOP'];

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        stop: ['END', 'STOP']
      }));
    });

    it('should use custom baseURL when provided', async () => {
      const customAdapter = new OpenRouterClientAdapter({ baseURL: 'https://custom.openrouter.api.com' });

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await customAdapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(MockOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        baseURL: 'https://custom.openrouter.api.com'
      }));
    });

    it('should include custom headers when httpReferer and siteTitle are provided', async () => {
      const customAdapter = new OpenRouterClientAdapter({
        httpReferer: 'https://myapp.com',
        siteTitle: 'My App'
      });

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await customAdapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(MockOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        defaultHeaders: {
          'HTTP-Referer': 'https://myapp.com',
          'X-Title': 'My App'
        }
      }));
    });

    it('should include provider routing settings when openRouterProvider is set', async () => {
      basicRequest.settings.openRouterProvider = {
        order: ['Together', 'Fireworks'],
        ignore: ['Azure'],
        dataCollection: 'deny',
        requireParameters: true
      };

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        provider: {
          order: ['Together', 'Fireworks'],
          ignore: ['Azure'],
          data_collection: 'deny',
          require_parameters: true
        }
      }));
    });

    it('should handle partial provider routing settings', async () => {
      basicRequest.settings.openRouterProvider = {
        allow: ['Together']
      };

      mockCreate.mockResolvedValueOnce({
        id: 'gen-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'google/gemma-3-27b-it:free',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        provider: {
          allow: ['Together']
        }
      }));
    });

    describe('error handling', () => {
      it('should handle authentication errors (401)', async () => {
        const apiError = new Error('Invalid API key');
        (apiError as any).status = 401;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'invalid-key');

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INVALID_API_KEY);
        expect(errorResponse.error.type).toBe('authentication_error');
        expect(errorResponse.error.message).toContain('Invalid API key');
      });

      it('should handle rate limit errors (429)', async () => {
        const apiError = new Error('Rate limit exceeded');
        (apiError as any).status = 429;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle insufficient credits errors (402)', async () => {
        const apiError = new Error('Insufficient credits');
        (apiError as any).status = 402;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INSUFFICIENT_CREDITS);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle model not found errors (404)', async () => {
        const apiError = new Error('The model does not exist');
        (apiError as any).status = 404;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle model not available errors (400)', async () => {
        const apiError = new Error('Model not available for this request');
        (apiError as any).status = 400;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
      });

      it('should handle server errors (500)', async () => {
        const apiError = new Error('Internal server error');
        (apiError as any).status = 500;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.PROVIDER_ERROR);
        expect(errorResponse.error.type).toBe('server_error');
      });

      it('should handle network errors', async () => {
        const networkError = new Error('Network error');
        (networkError as any).code = 'ECONNREFUSED';
        mockCreate.mockRejectedValueOnce(networkError);

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(errorResponse.error.type).toBe('connection_error');
      });

      it('should handle unknown errors', async () => {
        mockCreate.mockRejectedValueOnce(new Error('Unknown error'));

        const response = await adapter.sendMessage(basicRequest, 'sk-or-v1-test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
        expect(errorResponse.error.message).toContain('Unknown error');
      });
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key format', () => {
      // Valid OpenRouter API keys
      expect(adapter.validateApiKey('sk-or-v1-1234567890abcdef1234567890abcdef12345678')).toBe(true);
      expect(adapter.validateApiKey('sk-or-1234567890abcdef1234567890abcdef123456789')).toBe(true);

      // Invalid API keys
      expect(adapter.validateApiKey('invalid')).toBe(false);
      expect(adapter.validateApiKey('')).toBe(false);
      expect(adapter.validateApiKey('sk-test123456789')).toBe(false); // OpenAI format
      expect(adapter.validateApiKey('sk-or-short')).toBe(false); // Too short
    });
  });

  describe('getAdapterInfo', () => {
    it('should return correct adapter information', () => {
      const info = adapter.getAdapterInfo();

      expect(info.providerId).toBe('openrouter');
      expect(info.name).toBe('OpenRouter Client Adapter');
      expect(info.version).toBeDefined();
      expect(info.baseURL).toBe('https://openrouter.ai/api/v1');
    });

    it('should return custom baseURL when configured', () => {
      const customAdapter = new OpenRouterClientAdapter({ baseURL: 'https://custom.api.com' });
      const info = customAdapter.getAdapterInfo();

      expect(info.baseURL).toBe('https://custom.api.com');
    });
  });

  describe('streamMessage', () => {
    const KEY = 'sk-or-test-api-key-1234567890123456789012345678901234567890';
    const streamFrom = async function* (chunks: any[]) {
      for (const chunk of chunks) {
        if (chunk instanceof Error) {
          throw chunk;
        }
        yield chunk;
      }
    };
    const chunk = (content: string, extra?: Record<string, any>) => ({
      id: 'gen-stream',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'google/gemma-3-27b-it:free',
      choices: [{
        index: 0,
        delta: { content, ...extra },
        finish_reason: null
      }]
    });
    const collectEvents = async (request = basicRequest, options?: any) => {
      const events = [];
      for await (const event of adapter.streamMessage(request, KEY, options)) {
        events.push(event);
      }
      return events;
    };

    it('streams content deltas and a final normalized response', async () => {
      basicRequest.settings.logprobs = true;
      basicRequest.settings.topLogprobs = 2;
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('Hi '),
        {
          ...chunk('there'),
          choices: [{
            index: 0,
            delta: { content: 'there' },
            finish_reason: 'stop',
            logprobs: {
              content: [
                {
                  token: 'there',
                  logprob: -0.3,
                  top_logprobs: [
                    { token: 'there', logprob: -0.3 },
                    { token: 'here', logprob: -1.4 }
                  ]
                }
              ]
            }
          }]
        },
        {
          id: 'gen-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'google/gemma-3-27b-it:free',
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
        }
      ]));

      const events = await collectEvents();

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        stream: true,
        stream_options: { include_usage: true },
        model: 'google/gemma-3-27b-it:free',
        logprobs: true,
        top_logprobs: 2
      }));
      expect(events.find((event) => event.type === "start")).toMatchObject({
        type: 'start',
        provider: 'openrouter',
        id: 'gen-stream'
      });
      expect(events.filter((event) => event.type === 'content_delta').map((event) => event.delta).join(''))
        .toBe('Hi there');
      expect(events.some((event) => event.type === 'usage')).toBe(true);
      const complete = events[events.length - 1] as any;
      expect(complete.type).toBe('complete');
      expect(events.some((event: any) => event.type === 'logprob_delta')).toBe(false);
      expect(complete.response.choices[0].message.content).toBe('Hi there');
      expect(complete.response.choices[0].logprobs).toEqual([
        {
          token: 'there',
          logprob: -0.3,
          topLogprobs: [
            { token: 'there', logprob: -0.3 },
            { token: 'here', logprob: -1.4 }
          ]
        }
      ]);
      expect(
        complete.response.choices[0].answerAccounting?.providerOutput
      ).toMatchObject({
        tokens: 2,
        reasoning: "included_native",
      });
      expect(complete.response.usage).toEqual({
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3
      });
    });

    it('preserves OpenRouter-specific request params when streaming', async () => {
      mockCreate.mockResolvedValueOnce(streamFrom([
        { ...chunk('Hi'), choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }] }
      ]));
      basicRequest.settings.openRouterProvider = {
        order: ['Together'],
        dataCollection: 'deny',
        requireParameters: true
      };
      basicRequest.settings.reasoning = {
        enabled: true,
        effort: 'high',
        exclude: true
      } as any;
      basicRequest.settings.structuredOutput = {
        name: 'result',
        schema: { type: 'object' }
      } as any;
      basicRequest.settings.logprobs = true;
      basicRequest.settings.topLogprobs = 3;
      basicRequest.settings.topK = 20;
      basicRequest.settings.minP = 0;
      basicRequest.settings.repeatPenalty = 1.1;
      basicRequest.settings.seed = 42;

      await collectEvents();
      const params = mockCreate.mock.calls[0][0];

      expect(params.provider).toEqual({
        order: ['Together'],
        data_collection: 'deny',
        require_parameters: true
      });
      expect(params.reasoning).toEqual({ effort: 'high', exclude: true });
      expect(params.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'result',
          strict: true,
          schema: { type: 'object' }
        }
      });
      expect(params.logprobs).toBe(true);
      expect(params.top_logprobs).toBe(3);
      expect(params.top_k).toBe(20);
      expect(params.min_p).toBe(0);
      expect(params.repetition_penalty).toBe(1.1);
      expect(params.seed).toBe(42);
    });

    it('streams reasoning deltas and includes reasoning in the final response', async () => {
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('', { reasoning: 'Thinking...' }),
        { ...chunk('Done'), choices: [{ index: 0, delta: { content: 'Done' }, finish_reason: 'stop' }] }
      ]));
      basicRequest.settings.reasoning = { enabled: true, exclude: false } as any;

      const events = await collectEvents();

      expect(events.find((event) => event.type === 'reasoning_delta')).toMatchObject({
        type: 'reasoning_delta',
        delta: 'Thinking...'
      });
      const complete = events[events.length - 1] as any;
      expect(complete.response.choices[0].reasoning).toBe('Thinking...');
      expect(complete.response.choices[0].message.content).toBe('Done');
    });

    it('passes abort and timeout options to the OpenAI SDK stream call', async () => {
      const controller = new AbortController();
      mockCreate.mockResolvedValueOnce(streamFrom([
        { ...chunk('Hi'), choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }] }
      ]));

      await collectEvents(basicRequest, { signal: controller.signal, timeoutMs: 4321 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ stream: true }),
        expect.objectContaining({ signal: controller.signal, timeout: 4321 })
      );
    });

    it('emits an error with partialResponse when the stream throws after content', async () => {
      mockCreate.mockResolvedValueOnce(streamFrom([
        chunk('Partial'),
        new Error('stream broke')
      ]));

      const events = await collectEvents();
      const error = events[events.length - 1] as any;

      expect(error.type).toBe('error');
      expect(error.error.partialResponse?.choices[0].message.content).toBe('Partial');
    });

    it('maps stream creation errors', async () => {
      const apiError = new Error('Rate limit exceeded');
      (apiError as any).status = 429;
      mockCreate.mockRejectedValueOnce(apiError);

      const events = await collectEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'error',
        error: {
          error: { code: ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED }
        }
      });
    });
  });
});
