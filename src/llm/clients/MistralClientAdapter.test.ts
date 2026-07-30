import { MistralClientAdapter } from './MistralClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type { LLMResponse, LLMFailureResponse } from '../types';

// Mock complete function
let mockComplete: jest.Mock;
let mockStream: jest.Mock;

// Mock the entire '@mistralai/mistralai' module
jest.mock('@mistralai/mistralai', () => {
  return {
    Mistral: jest.fn().mockImplementation(() => ({
      chat: {
        complete: (...args: any[]) => mockComplete(...args),
        stream: (...args: any[]) => mockStream(...args),
      },
    })),
  };
});

// Import after mock setup
import { Mistral } from '@mistralai/mistralai';
const MockMistral = Mistral as jest.MockedClass<typeof Mistral>;

describe('MistralClientAdapter', () => {
  let adapter: MistralClientAdapter;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    // Reset mocks before each test
    MockMistral.mockClear();
    mockComplete = jest.fn();
    mockStream = jest.fn();

    adapter = new MistralClientAdapter();
    basicRequest = {
      providerId: 'mistral',
      modelId: 'mistral-small-latest',
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

  const streamFrom = async function* (events: any[], error?: Error) {
    for (const event of events) {
      yield event;
    }
    if (error) {
      throw error;
    }
  };

  describe('sendMessage', () => {
    it('should format the request correctly and call the Mistral API', async () => {
      // Setup mock response
      mockComplete.mockResolvedValueOnce({
        id: 'chat-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you today?'
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      });

      const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      // Verify Mistral was instantiated with the API key
      expect(MockMistral).toHaveBeenCalledWith({
        apiKey: 'test-api-key-12345678901234567890',
        serverURL: undefined
      });

      // Verify the complete method was called with correct parameters
      expect(mockComplete).toHaveBeenCalledWith({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 100,
        topP: 1
      });

      // Verify the response
      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.id).toBe('chat-123');
      expect(successResponse.provider).toBe('mistral');
      expect(successResponse.model).toBe('mistral-small-latest');
      expect(successResponse.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(successResponse.usage?.total_tokens).toBe(30);
    });

    it('should map seed to randomSeed and never send top_k-style params', async () => {
      mockComplete.mockResolvedValueOnce({
        id: 'chat-seed',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hi' },
          finishReason: 'stop'
        }],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      });

      basicRequest.settings.seed = 7;
      // Even if these survive service-level filtering, the adapter must not emit them
      basicRequest.settings.topK = 40;
      basicRequest.settings.minP = 0.05;
      basicRequest.settings.repeatPenalty = 1.1;

      await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      const params = mockComplete.mock.calls[0][0];
      expect(params.randomSeed).toBe(7);
      expect(params).not.toHaveProperty('topK');
      expect(params).not.toHaveProperty('top_k');
      expect(params).not.toHaveProperty('minP');
      expect(params).not.toHaveProperty('repeatPenalty');
    });

    it('should pass timeout and abort signal as per-call options', async () => {
      mockComplete.mockResolvedValueOnce({
        id: 'chat-transport',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hi' },
          finishReason: 'stop'
        }],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      });

      const controller = new AbortController();
      await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890', {
        signal: controller.signal,
        timeoutMs: 9000,
      });

      // The SDK ignores timeoutMs whenever a signal is present, so the adapter
      // must merge both into a single composed signal
      const transport = mockComplete.mock.calls[0][1];
      expect(transport.signal).toBeInstanceOf(AbortSignal);
      expect(transport.signal).not.toBe(controller.signal);
      expect(transport).not.toHaveProperty('timeoutMs');
      expect(transport).not.toHaveProperty('fetchOptions');
    });

    it('passes signal-only and timeout-only transport options through unchanged', async () => {
      const completion = {
        id: 'chat-transport-2',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hi' },
          finishReason: 'stop'
        }],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      };
      mockComplete.mockResolvedValue(completion);

      const controller = new AbortController();
      await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890', {
        signal: controller.signal,
      });
      expect(mockComplete.mock.calls[0][1]).toEqual({ signal: controller.signal });

      await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890', {
        timeoutMs: 9000,
      });
      expect(mockComplete.mock.calls[1][1]).toEqual({ timeoutMs: 9000 });
    });

    it('should handle system messages correctly', async () => {
      basicRequest.messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' }
      ];

      mockComplete.mockResolvedValueOnce({
        id: 'chat-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finishReason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' }
        ]
      }));
    });

    it('should handle stop sequences correctly', async () => {
      basicRequest.settings.stopSequences = ['END', 'STOP'];

      mockComplete.mockResolvedValueOnce({
        id: 'chat-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finishReason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
        stop: ['END', 'STOP']
      }));
    });

    it('should use custom baseURL when provided', async () => {
      const customAdapter = new MistralClientAdapter({ baseURL: 'https://custom.mistral.api.com' });

      mockComplete.mockResolvedValueOnce({
        id: 'chat-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finishReason: 'stop'
        }]
      });

      await customAdapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      expect(MockMistral).toHaveBeenCalledWith(expect.objectContaining({
        serverURL: 'https://custom.mistral.api.com'
      }));
    });

    it('should not include frequency_penalty or presence_penalty (not supported by Mistral)', async () => {
      basicRequest.settings.frequencyPenalty = 0.5;
      basicRequest.settings.presencePenalty = 0.5;

      mockComplete.mockResolvedValueOnce({
        id: 'chat-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finishReason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

      // Verify that frequency_penalty and presence_penalty are NOT included
      const callArgs = mockComplete.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('frequency_penalty');
      expect(callArgs).not.toHaveProperty('presence_penalty');
      expect(callArgs).not.toHaveProperty('frequencyPenalty');
      expect(callArgs).not.toHaveProperty('presencePenalty');
    });

    describe('error handling', () => {
      it('should handle authentication errors (401)', async () => {
        const apiError = new Error('Invalid API key');
        (apiError as any).statusCode = 401;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'invalid-key');

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INVALID_API_KEY);
        expect(errorResponse.error.type).toBe('authentication_error');
        expect(errorResponse.error.message).toContain('Invalid API key');
      });

      it('should handle rate limit errors (429)', async () => {
        const apiError = new Error('Rate limit exceeded');
        (apiError as any).statusCode = 429;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle insufficient credits errors (402)', async () => {
        const apiError = new Error('Insufficient credits');
        (apiError as any).statusCode = 402;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INSUFFICIENT_CREDITS);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle model not found errors (404)', async () => {
        const apiError = new Error('The model does not exist');
        (apiError as any).statusCode = 404;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle model not available errors (400)', async () => {
        const apiError = new Error('Model not available for this request');
        (apiError as any).statusCode = 400;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
      });

      it('should handle context length exceeded errors', async () => {
        const apiError = new Error('Context length exceeded: maximum token limit');
        (apiError as any).statusCode = 400;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED);
      });

      it('should handle server errors (500)', async () => {
        const apiError = new Error('Internal server error');
        (apiError as any).statusCode = 500;
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.PROVIDER_ERROR);
        expect(errorResponse.error.type).toBe('server_error');
      });

      it('should handle network errors', async () => {
        const networkError = new Error('Network error');
        (networkError as any).code = 'ECONNREFUSED';
        mockComplete.mockRejectedValueOnce(networkError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(errorResponse.error.type).toBe('connection_error');
      });

      it('should surface Retry-After from MistralError-style Headers', async () => {
        // Real shape raised by the Speakeasy SDK: statusCode + Headers instance
        const apiError = Object.assign(new Error('Requests rate limit exceeded'), {
          statusCode: 429,
          headers: new Headers({ 'retry-after': '9' }),
        });
        mockComplete.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.status).toBe(429);
        expect(errorResponse.error.retryAfterMs).toBe(9000);
      });

      it('classifies SDK RequestAbortedError as REQUEST_ABORTED', async () => {
        const abortError = Object.assign(new Error('Request aborted by client'), {
          name: 'RequestAbortedError',
        });
        mockComplete.mockRejectedValueOnce(abortError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.REQUEST_ABORTED);
        expect(errorResponse.error.type).toBe('abort_error');
      });

      it('classifies SDK RequestTimeoutError as REQUEST_TIMEOUT', async () => {
        const timeoutError = Object.assign(new Error('Request timed out'), {
          name: 'RequestTimeoutError',
        });
        mockComplete.mockRejectedValueOnce(timeoutError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.REQUEST_TIMEOUT);
        expect(errorResponse.error.type).toBe('timeout_error');
      });

      it('classifies SDK ConnectionError as NETWORK_ERROR with its cause surfaced', async () => {
        const connectionError = Object.assign(new Error('Unable to make request'), {
          name: 'ConnectionError',
          cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
            code: 'ECONNREFUSED',
          }),
        });
        mockComplete.mockRejectedValueOnce(connectionError);

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(errorResponse.error.type).toBe('connection_error');
        expect(errorResponse.error.message).toContain('ECONNREFUSED');
      });

      it('should handle unknown errors', async () => {
        mockComplete.mockRejectedValueOnce(new Error('Unknown error'));

        const response = await adapter.sendMessage(basicRequest, 'test-api-key-12345678901234567890');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
        expect(errorResponse.error.message).toContain('Unknown error');
      });
    });
  });

  describe('streamMessage', () => {
    const collectEvents = async (request: InternalLLMChatRequest = basicRequest, options?: Parameters<MistralClientAdapter['streamMessage']>[2]) => {
      const events = [];
      for await (const event of adapter.streamMessage(request, 'test-api-key-12345678901234567890', options)) {
        events.push(event);
      }
      return events;
    };

    const eventChunk = (content: any, finishReason: string | null = null, extra?: Record<string, any>) => ({
      data: {
        id: 'mistral-stream',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'mistral-small-latest',
        choices: [{
          index: 0,
          delta: { content },
          finishReason,
        }],
        ...extra,
      }
    });

    it('should stream content deltas and emit a final normalized response', async () => {
      const controller = new AbortController();
      mockStream.mockResolvedValueOnce(streamFrom([
        eventChunk('Hello '),
        eventChunk('Mistral', 'stop', {
          usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 }
        })
      ]));

      const events = await collectEvents(basicRequest, {
        signal: controller.signal,
        timeoutMs: 5000,
      });

      expect(mockStream).toHaveBeenCalledWith({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxTokens: 100,
        topP: 1,
        stream: true
      }, expect.objectContaining({
        signal: expect.any(AbortSignal),
      }));
      expect(events.find((event) => event.type === "start")).toMatchObject({
        type: 'start',
        provider: 'mistral',
        model: 'mistral-small-latest',
        id: 'mistral-stream'
      });
      expect(events.filter((event) => event.type === 'content_delta').map((event) => event.delta).join(''))
        .toBe('Hello Mistral');
      expect(events.find((event) => event.type === 'usage')).toMatchObject({
        type: 'usage',
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
      });

      const complete = events.find((event) => event.type === 'complete');
      expect(complete).toBeDefined();
      if (complete?.type === 'complete') {
        expect(complete.response.id).toBe('mistral-stream');
        expect(complete.response.choices[0].message.content).toBe('Hello Mistral');
        expect(complete.response.choices[0].finish_reason).toBe('stop');
        expect(
          complete.response.choices[0].answerAccounting?.providerOutput
        ).toMatchObject({
          tokens: 3,
          reasoning: "unknown",
        });
        expect(complete.response.usage?.total_tokens).toBe(5);
      }
    });

    it('should preserve stream request params and timeout-only transport options', async () => {
      mockStream.mockResolvedValueOnce(streamFrom([
        eventChunk('{}', 'stop')
      ]));
      basicRequest.settings.seed = 77;
      basicRequest.settings.stopSequences = ['END'];
      basicRequest.settings.structuredOutput = {
        name: 'result',
        schema: { type: 'object' }
      } as any;

      await collectEvents(basicRequest, { timeoutMs: 9000 });

      expect(mockStream).toHaveBeenCalledWith(expect.objectContaining({
        stream: true,
        randomSeed: 77,
        stop: ['END'],
        responseFormat: { type: 'json_object' },
      }), {
        timeoutMs: 9000,
      });
    });

    it('should emit reasoning deltas from thinking content chunks', async () => {
      basicRequest.settings.reasoning = {
        enabled: true,
        effort: undefined as any,
        maxTokens: undefined as any,
        exclude: false
      };
      mockStream.mockResolvedValueOnce(streamFrom([
        eventChunk([
          { type: 'thinking', thinking: [{ type: 'text', text: 'thinking ' }] },
          { type: 'text', text: 'answer' }
        ], 'stop')
      ]));

      const events = await collectEvents();

      expect(events.find((event) => event.type === 'reasoning_delta')).toMatchObject({
        type: 'reasoning_delta',
        delta: 'thinking ',
        index: 0
      });
      const complete = events.find((event) => event.type === 'complete');
      if (complete?.type === 'complete') {
        expect(complete.response.choices[0].reasoning).toBe('thinking ');
        expect(complete.response.choices[0].message.content).toBe('answer');
      }
    });

    it('should not emit or return reasoning when reasoning.exclude is true', async () => {
      basicRequest.settings.reasoning = {
        enabled: true,
        effort: undefined as any,
        maxTokens: 1024,
        exclude: true
      };
      mockStream.mockResolvedValueOnce(streamFrom([
        eventChunk([
          { type: 'thinking', thinking: [{ type: 'text', text: 'hidden thought' }] },
          { type: 'text', text: 'visible answer' }
        ], 'stop')
      ]));

      const events = await collectEvents();

      expect(events.find((event) => event.type === 'reasoning_delta')).toBeUndefined();
      const complete = events.find((event) => event.type === 'complete');
      if (complete?.type === 'complete') {
        expect(complete.response.choices[0].reasoning).toBeUndefined();
        expect(complete.response.choices[0].message.content).toBe('visible answer');
      }
    });

    it('should map stream creation errors', async () => {
      const apiError = new Error('Rate limit exceeded');
      (apiError as any).statusCode = 429;
      mockStream.mockRejectedValueOnce(apiError);

      const events = await collectEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'error',
        error: {
          provider: 'mistral',
          model: 'mistral-small-latest',
          error: {
            code: ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED,
            type: 'rate_limit_error'
          }
        }
      });
    });

    it('should include a partial response when a stream fails after deltas', async () => {
      mockStream.mockResolvedValueOnce(streamFrom([
        eventChunk('Partial')
      ], new Error('stream interrupted')));

      const events = await collectEvents();
      const error = events.find((event) => event.type === 'error');

      expect(error).toBeDefined();
      if (error?.type === 'error') {
        expect(error.error.partialResponse?.id).toBe('mistral-stream');
        expect(error.error.partialResponse?.choices[0].message.content).toBe('Partial');
      }
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key format', () => {
      // Valid Mistral API keys (32+ alphanumeric characters)
      expect(adapter.validateApiKey('12345678901234567890123456789012')).toBe(true);
      expect(adapter.validateApiKey('abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
      expect(adapter.validateApiKey('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789012345678')).toBe(true);

      // Invalid API keys
      expect(adapter.validateApiKey('invalid')).toBe(false); // Too short
      expect(adapter.validateApiKey('')).toBe(false); // Empty
      expect(adapter.validateApiKey('1234567890123456789012345678901')).toBe(false); // 31 chars - too short
      expect(adapter.validateApiKey('sk-or-v1-test-key')).toBe(false); // Contains hyphen
      expect(adapter.validateApiKey('key_with_underscore_1234567890')).toBe(false); // Contains underscore
    });
  });

  describe('getAdapterInfo', () => {
    it('should return correct adapter information', () => {
      const info = adapter.getAdapterInfo();

      expect(info.providerId).toBe('mistral');
      expect(info.name).toBe('Mistral Client Adapter');
      expect(info.version).toBeDefined();
      expect(info.baseURL).toBe('https://api.mistral.ai');
    });

    it('should return custom baseURL when configured', () => {
      const customAdapter = new MistralClientAdapter({ baseURL: 'https://custom.api.com' });
      const info = customAdapter.getAdapterInfo();

      expect(info.baseURL).toBe('https://custom.api.com');
    });
  });
});
