import OpenAI from 'openai';
import { OpenAIClientAdapter } from './OpenAIClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type { LLMResponse, LLMFailureResponse } from '../types';

// Mock the entire 'openai' module
jest.mock('openai');

// Cast the mocked module to allow setting up mock implementations
const MockOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

async function* streamFrom(chunks: any[], error?: Error): AsyncGenerator<any> {
  for (const chunk of chunks) {
    yield chunk;
  }
  if (error) {
    throw error;
  }
}

describe('OpenAIClientAdapter', () => {
  let adapter: OpenAIClientAdapter;
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

    adapter = new OpenAIClientAdapter();
    basicRequest = {
      providerId: 'openai',
      modelId: 'gpt-4.1',
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
        user: 'test-user',
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
    it('should format the request correctly and call the OpenAI API', async () => {
      // Setup mock response
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
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

      const response = await adapter.sendMessage(basicRequest, 'test-api-key');

      // Verify OpenAI was instantiated with the API key
      expect(MockOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: undefined,
        maxRetries: 0
      });

      // Verify the create method was called with correct parameters
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_completion_tokens: 100,
        top_p: 1,
        user: 'test-user'
      });

      // Verify the response
      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.id).toBe('chatcmpl-123');
      expect(successResponse.provider).toBe('openai');
      expect(successResponse.model).toBe('gpt-4.1');
      expect(successResponse.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(successResponse.usage?.total_tokens).toBe(30);
    });

    it("injects prompt-delivered structured output exactly once on the legacy path", async () => {
      mockCreate.mockResolvedValueOnce({
        id: "chatcmpl-prompt-schema",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4.1",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "{\"ok\":true}" },
          finish_reason: "stop",
        }],
      });
      basicRequest.settings.structuredOutput = {
        name: "result",
        delivery: "prompt",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
      };

      await adapter.sendMessage(basicRequest, "test-api-key");

      const params = mockCreate.mock.calls[0][0];
      const content = String(params.messages[0].content);
      expect(
        content.match(/<GENAI_LITE_STRUCTURED_OUTPUT revision=/g)
      ).toHaveLength(1);
      expect(params).not.toHaveProperty("response_format");
    });

    it('should map seed and never send llama.cpp-style sampling params', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-seed',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hi' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });

      basicRequest.settings.seed = 42;
      // Even if these survive service-level filtering, the adapter must not emit them
      basicRequest.settings.topK = 40;
      basicRequest.settings.minP = 0.05;
      basicRequest.settings.repeatPenalty = 1.1;

      await adapter.sendMessage(basicRequest, 'test-api-key');

      const params = mockCreate.mock.calls[0][0];
      expect(params.seed).toBe(42);
      expect(params).not.toHaveProperty('top_k');
      expect(params).not.toHaveProperty('min_p');
      expect(params).not.toHaveProperty('repeat_penalty');
    });

    it('should request and map logprobs', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-lp',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hi' },
          finish_reason: 'stop',
          logprobs: {
            content: [
              { token: 'Hi', logprob: -0.1, top_logprobs: [{ token: 'Hi', logprob: -0.1 }] }
            ]
          }
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });

      basicRequest.settings.logprobs = true;
      basicRequest.settings.topLogprobs = 3;

      const response = await adapter.sendMessage(basicRequest, 'test-api-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        logprobs: true,
        top_logprobs: 3
      }));
      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.choices[0].logprobs).toEqual([
        { token: 'Hi', logprob: -0.1, topLogprobs: [{ token: 'Hi', logprob: -0.1 }] }
      ]);
    });

    it('should pass abort signal and timeout to the SDK call', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-transport',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hi' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });

      const controller = new AbortController();
      await adapter.sendMessage(basicRequest, 'test-api-key', {
        signal: controller.signal,
        timeoutMs: 5000,
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.anything(), {
        signal: controller.signal,
        timeout: 5000,
      });
    });

    it('should handle system messages correctly', async () => {
      basicRequest.messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' }
      ];

      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

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
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        stop: ['END', 'STOP']
      }));
    });

    it('should use custom baseURL when provided', async () => {
      const customAdapter = new OpenAIClientAdapter({ baseURL: 'https://custom.api.com' });

      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop'
        }]
      });

      await customAdapter.sendMessage(basicRequest, 'test-api-key');

      expect(MockOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://custom.api.com',
        maxRetries: 0
      });
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

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle insufficient quota errors (429 with specific message)', async () => {
        const apiError = new Error('You exceeded your current quota, please check your plan and billing details');
        (apiError as any).status = 429;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        // Without special handling for quota messages, this is just a rate limit error
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle context length errors (400)', async () => {
        const apiError = new Error("This model's maximum context length is 4096 tokens");
        (apiError as any).status = 400;
        // Mock it as an OpenAI APIError
        Object.setPrototypeOf(apiError, OpenAI.APIError.prototype);
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle model not found errors (404)', async () => {
        const apiError = new Error('The model does not exist');
        (apiError as any).status = 404;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle server errors (500)', async () => {
        const apiError = new Error('Internal server error');
        (apiError as any).status = 500;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.PROVIDER_ERROR);
        expect(errorResponse.error.type).toBe('server_error');
      });

      it('should handle network errors', async () => {
        const networkError = new Error('Network error');
        (networkError as any).code = 'ECONNREFUSED';
        mockCreate.mockRejectedValueOnce(networkError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(errorResponse.error.type).toBe('connection_error');
      });

      it('should handle unknown errors', async () => {
        mockCreate.mockRejectedValueOnce(new Error('Unknown error'));

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
        expect(errorResponse.error.message).toContain('Unknown error');
      });
    });
  });

  describe('streamMessage', () => {
    const collectEvents = async (request: InternalLLMChatRequest = basicRequest, options?: Parameters<OpenAIClientAdapter['streamMessage']>[2]) => {
      const events = [];
      for await (const event of adapter.streamMessage(request, 'test-api-key', options)) {
        events.push(event);
      }
      return events;
    };

    it('should stream content deltas and emit a final normalized response', async () => {
      const controller = new AbortController();
      mockCreate.mockResolvedValueOnce(streamFrom([
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4.1',
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
        },
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4.1',
          choices: [{ index: 0, delta: { content: 'Hello ' }, finish_reason: null }]
        },
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4.1',
          choices: [{ index: 0, delta: { content: 'world' }, finish_reason: 'stop' }]
        },
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4.1',
          choices: [],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
        }
      ]));

      const events = await collectEvents(basicRequest, {
        signal: controller.signal,
        timeoutMs: 5000,
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: 100,
        user: 'test-user'
      }), {
        signal: controller.signal,
        timeout: 5000,
      });
      expect(events.find((event) => event.type === "start")).toMatchObject({
        type: 'start',
        provider: 'openai',
        model: 'gpt-4.1',
        id: 'chatcmpl-stream'
      });
      expect(events.filter((event) => event.type === 'content_delta').map((event) => event.delta).join(''))
        .toBe('Hello world');
      expect(events.find((event) => event.type === 'usage')).toMatchObject({
        type: 'usage',
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
      });

      const complete = events.find((event) => event.type === 'complete');
      expect(complete).toBeDefined();
      if (complete?.type === 'complete') {
        expect(complete.response.id).toBe('chatcmpl-stream');
        expect(complete.response.choices[0].message.content).toBe('Hello world');
        expect(complete.response.choices[0].finish_reason).toBe('stop');
        expect(complete.response.usage?.total_tokens).toBe(5);
      }
    });

    it("records every provider-chunk evidence item before its first public event", async () => {
      mockCreate.mockResolvedValueOnce(streamFrom([{
        id: "chatcmpl-evidence-order",
        object: "chat.completion.chunk",
        created: 1234567890,
        model: "gpt-4.1",
        choices: [{
          index: 0,
          delta: { content: "done" },
          finish_reason: "length",
        }],
        usage: {
          prompt_tokens: 7,
          completion_tokens: 4,
          total_tokens: 11,
        },
      }]));

      const events = await collectEvents();
      const startIndex = events.findIndex((event) => event.type === "start");
      const evidenceBeforeStart = events.slice(0, startIndex).filter(
        (event) => event.type === "adapter_evidence"
      );

      expect(startIndex).toBeGreaterThan(0);
      expect(evidenceBeforeStart).toEqual(expect.arrayContaining([
        expect.objectContaining({
          observedEvidence: expect.objectContaining({
            usage: {
              prompt_tokens: 7,
              completion_tokens: 4,
              total_tokens: 11,
            },
            usageEvidence: expect.objectContaining({
              prompt_tokens: expect.any(Object),
            }),
          }),
        }),
        expect.objectContaining({
          observedEvidence: {
            choice: expect.objectContaining({
              finishReason: "length",
              termination: expect.objectContaining({
                rawReason: "length",
              }),
            }),
          },
        }),
        expect.objectContaining({
          observedEvidence: {
            choice: expect.objectContaining({
              rawContentDelta: "done",
            }),
          },
        }),
      ]));
      expect(events.slice(startIndex).map((event) => event.type)).toEqual(
        expect.arrayContaining(["start", "usage", "content_delta", "complete"])
      );
    });

    it('should preserve structured output, reasoning, logprobs, and sampling params', async () => {
      mockCreate.mockResolvedValueOnce(streamFrom([
        {
          id: 'chatcmpl-params',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4.1',
          choices: [{ index: 0, delta: { content: '{}' }, finish_reason: 'stop' }]
        }
      ]));

      const request = {
        ...basicRequest,
        settings: {
          ...basicRequest.settings,
          seed: 123,
          logprobs: true,
          topLogprobs: 2,
          reasoning: {
            enabled: true,
            effort: 'low' as const,
            maxTokens: undefined as any,
            exclude: false,
          },
          structuredOutput: {
            name: 'result',
            schema: {
              type: 'object' as const,
              properties: {
                ok: { type: 'boolean' as const }
              }
            }
          }
        }
      };

      await collectEvents(request);

      const params = mockCreate.mock.calls[0][0];
      expect(params).toMatchObject({
        stream: true,
        stream_options: { include_usage: true },
        seed: 123,
        logprobs: true,
        top_logprobs: 2,
        reasoning_effort: 'low',
      });
      expect(params.response_format).toMatchObject({
        type: 'json_schema',
        json_schema: {
          name: 'result',
          strict: true,
        }
      });
      expect(params.response_format.json_schema.schema.additionalProperties).toBe(false);
    });

    it('should emit reasoning deltas when present', async () => {
      basicRequest.settings.reasoning = {
        enabled: true,
        effort: undefined as any,
        maxTokens: undefined as any,
        exclude: false
      };
      mockCreate.mockResolvedValueOnce(streamFrom([
        {
          id: 'chatcmpl-reasoning',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4.1',
          choices: [{ index: 0, delta: { reasoning: 'thinking ' }, finish_reason: null }]
        },
        {
          id: 'chatcmpl-reasoning',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4.1',
          choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: 'stop' }]
        }
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

    it('should map stream creation errors', async () => {
      const apiError = new Error('Rate limit exceeded');
      (apiError as any).status = 429;
      mockCreate.mockRejectedValueOnce(apiError);

      const events = await collectEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'error',
        error: {
          provider: 'openai',
          model: 'gpt-4.1',
          error: {
            code: ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED,
            type: 'rate_limit_error'
          }
        }
      });
    });

    it('should include a partial response when a stream fails after deltas', async () => {
      mockCreate.mockResolvedValueOnce(streamFrom([
        {
          id: 'chatcmpl-partial',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4.1',
          choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }]
        }
      ], new Error('stream interrupted')));

      const events = await collectEvents();
      const error = events.find((event) => event.type === 'error');

      expect(error).toBeDefined();
      if (error?.type === 'error') {
        expect(error.error.partialResponse?.id).toBe('chatcmpl-partial');
        expect(error.error.partialResponse?.choices[0].message.content).toBe('partial');
      }
    });
  });

  describe('structuredOutput', () => {
    it('should add response_format with json_schema when structuredOutput is provided', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '{"name":"John","age":30}' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      });

      const requestWithStructuredOutput = {
        ...basicRequest,
        settings: {
          ...basicRequest.settings,
          structuredOutput: {
            name: 'person_info',
            schema: {
              type: 'object' as const,
              properties: {
                name: { type: 'string' as const },
                age: { type: 'integer' as const }
              },
              required: ['name', 'age']
            },
            strict: true
          }
        }
      };

      await adapter.sendMessage(requestWithStructuredOutput, 'test-api-key');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'person_info',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  age: { type: 'integer' }
                },
                required: ['name', 'age'],
                additionalProperties: false  // Added by adapter for strict mode
              }
            }
          }
        })
      );
    });

    it('should not add response_format when structuredOutput is disabled', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      });

      const requestWithDisabledStructuredOutput = {
        ...basicRequest,
        settings: {
          ...basicRequest.settings,
          structuredOutput: {
            name: 'test',
            schema: { type: 'object' as const },
            enabled: false
          }
        }
      };

      await adapter.sendMessage(requestWithDisabledStructuredOutput, 'test-api-key');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({
          response_format: expect.anything()
        })
      );
    });

    it('should default strict to true when not specified', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4.1',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '{}' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      });

      const requestWithoutStrict = {
        ...basicRequest,
        settings: {
          ...basicRequest.settings,
          structuredOutput: {
            name: 'test_schema',
            schema: { type: 'object' as const }
            // strict not specified
          }
        }
      };

      await adapter.sendMessage(requestWithoutStrict, 'test-api-key');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: expect.objectContaining({
            json_schema: expect.objectContaining({
              strict: true
            })
          })
        })
      );
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key format', () => {
      expect(adapter.validateApiKey('sk-test123456789012345678')).toBe(true);
      expect(adapter.validateApiKey('sk-proj-test123456789012')).toBe(true);
      expect(adapter.validateApiKey('invalid')).toBe(false);
      expect(adapter.validateApiKey('')).toBe(false);
      expect(adapter.validateApiKey('sk-short')).toBe(false); // Too short
    });
  });

  describe('getAdapterInfo', () => {
    it('should return correct adapter information', () => {
      const info = adapter.getAdapterInfo();
      
      expect(info.providerId).toBe('openai');
      expect(info.name).toBe('OpenAI Client Adapter');
      expect(info.version).toBeDefined();
      // supportedModels is not part of the interface
    });
  });
});
