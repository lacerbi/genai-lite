import Anthropic from '@anthropic-ai/sdk';
import { AnthropicClientAdapter } from './AnthropicClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type {
  LLMResponse,
  LLMFailureResponse,
  StructuredOutputSchema,
  StructuredOutputSettings
} from '../types';

// Mock the entire '@anthropic-ai/sdk' module
jest.mock('@anthropic-ai/sdk');

// Cast the mocked module to allow setting up mock implementations
const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

describe('AnthropicClientAdapter', () => {
  let adapter: AnthropicClientAdapter;
  let mockCreate: jest.Mock;
  let mockStream: jest.Mock;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    // Reset mocks before each test
    MockAnthropic.mockClear();
    mockCreate = jest.fn();
    mockStream = jest.fn();
    
    // Mock the messages.create method
    MockAnthropic.prototype.messages = {
      create: mockCreate,
      stream: mockStream,
    } as any;

    adapter = new AnthropicClientAdapter();
    basicRequest = {
      providerId: 'anthropic',
      modelId: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Hello' }],
      settings: {
        temperature: 0.7,
        maxTokens: 100,
        topP: undefined as any,
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

  const streamFrom = async function* (events: any[], error?: Error) {
    for (const event of events) {
      yield event;
    }
    if (error) {
      throw error;
    }
  };

  describe('sendMessage', () => {
    it('should format the request correctly and call the Anthropic API', async () => {
      // Setup mock response
      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{
          type: 'text',
          text: 'Hello! How can I help you today?'
        }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 20
        }
      });

      const response = await adapter.sendMessage(basicRequest, 'test-api-key');

      // Verify Anthropic was instantiated with the API key
      expect(MockAnthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: undefined,
        maxRetries: 0
      });

      // Verify the create method was called with correct parameters
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
        temperature: 0.7
      });

      // Verify the response
      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.id).toBe('msg_123');
      expect(successResponse.provider).toBe('anthropic');
      expect(successResponse.model).toBe('claude-3-5-sonnet-20241022');
      expect(successResponse.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(successResponse.usage?.total_tokens).toBe(30);
    });

    it('should serialize top_p only when temperature is omitted', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_top_p',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'Hello' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 }
      });
      basicRequest.settings.temperature = undefined as any;
      basicRequest.settings.topP = 0.8;

      await adapter.sendMessage(basicRequest, 'test-api-key');

      const params = mockCreate.mock.calls[0][0];
      expect(params.top_p).toBe(0.8);
      expect(params).not.toHaveProperty('temperature');
    });

    it('should reject a direct internal request with both samplers before SDK transport', async () => {
      basicRequest.settings.topP = 0.8;

      const response = await adapter.sendMessage(basicRequest, 'test-api-key');

      expect(response.object).toBe('error');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should map topK to top_k and never send seed', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_topk',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'Hi' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 }
      });

      basicRequest.settings.topK = 64;
      // Even if these survive service-level filtering, the adapter must not emit them
      basicRequest.settings.seed = 42;
      basicRequest.settings.minP = 0.05;
      basicRequest.settings.repeatPenalty = 1.1;

      await adapter.sendMessage(basicRequest, 'test-api-key');

      const params = mockCreate.mock.calls[0][0];
      expect(params.top_k).toBe(64);
      expect(params).not.toHaveProperty('seed');
      expect(params).not.toHaveProperty('min_p');
      expect(params).not.toHaveProperty('repeat_penalty');
    });

    it('should handle system messages by merging into first user message', async () => {
      basicRequest.messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' }
      ];

      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 15, output_tokens: 5 }
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      // System message should be sent as separate system parameter
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        system: 'You are a helpful assistant.',
        messages: [{
          role: 'user',
          content: 'Hello'
        }]
      }));
    });

    it('should handle stop sequences correctly', async () => {
      basicRequest.settings.stopSequences = ['END', 'STOP'];

      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'Response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 10 }
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        stop_sequences: ['END', 'STOP']
      }));
    });

    it('should handle multi-turn conversations', async () => {
      basicRequest.messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' }
      ];

      mockCreate.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: "I'm doing well, thanks!" }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 10 }
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' }
        ]
      }));
    });

    it('should map stop_reason correctly', async () => {
      // Covers Anthropic's full StopReason union - end_turn | max_tokens |
      // stop_sequence | tool_use | pause_turn | refusal - plus an unknown value.
      const stopReasons = [
        { anthropic: 'end_turn', expected: 'stop' },
        { anthropic: 'max_tokens', expected: 'length' },
        { anthropic: 'stop_sequence', expected: 'stop' },
        { anthropic: 'tool_use', expected: 'tool_calls' },
        { anthropic: 'refusal', expected: 'content_filter' },
        { anthropic: 'pause_turn', expected: 'other' },
        { anthropic: 'unknown_reason', expected: 'other' }
      ];

      for (const { anthropic, expected } of stopReasons) {
        mockCreate.mockResolvedValueOnce({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-5-sonnet-20241022',
          content: [{ type: 'text', text: 'Response' }],
          stop_reason: anthropic,
          usage: { input_tokens: 10, output_tokens: 10 }
        });

        const response = await adapter.sendMessage(basicRequest, 'test-api-key');
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].finish_reason).toBe(expected);
      }
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

      it('should handle context length errors', async () => {
        // Create a mock error that simulates Anthropic.APIError
        const apiError = Object.assign(new Error('Message is too long'), {
          status: 400,
          constructor: { name: 'APIError' }
        });
        Object.setPrototypeOf(apiError, Anthropic.APIError.prototype);
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle invalid model errors', async () => {
        const apiError = new Error('Model not found');
        (apiError as any).status = 404;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle credit errors', async () => {
        const apiError = new Error('Insufficient credits');
        (apiError as any).status = 402;
        mockCreate.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INSUFFICIENT_CREDITS);
        expect(errorResponse.error.type).toBe('rate_limit_error');
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
        (networkError as any).code = 'ENOTFOUND';
        mockCreate.mockRejectedValueOnce(networkError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(errorResponse.error.type).toBe('connection_error');
      });
    });
  });

  describe('streamMessage', () => {
    const collectEvents = async (request: InternalLLMChatRequest = basicRequest, options?: Parameters<AnthropicClientAdapter['streamMessage']>[2]) => {
      const events = [];
      for await (const event of adapter.streamMessage(request, 'test-api-key', options)) {
        events.push(event);
      }
      return events;
    };

    const messageStart = {
      type: 'message_start',
      message: {
        id: 'msg_stream',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 0 }
      }
    };

    it('should stream content deltas and emit a final normalized response', async () => {
      const controller = new AbortController();
      mockStream.mockReturnValueOnce(streamFrom([
        messageStart,
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Claude' } },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { input_tokens: 5, output_tokens: 2 }
        },
        { type: 'message_stop' }
      ]));

      const events = await collectEvents(basicRequest, {
        signal: controller.signal,
        timeoutMs: 5000,
      });

      expect(mockStream).toHaveBeenCalledWith(expect.objectContaining({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      }), {
        signal: controller.signal,
        timeout: 5000,
      });
      expect(events.find((event) => event.type === "start")).toMatchObject({
        type: 'start',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        id: 'msg_stream'
      });
      expect(events.filter((event) => event.type === 'content_delta').map((event) => event.delta).join(''))
        .toBe('Hello Claude');
      const usageEvents = events.filter((event) => event.type === 'usage');
      const latestUsage = usageEvents[usageEvents.length - 1];
      expect(latestUsage).toMatchObject({
        type: 'usage',
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
      });

      const complete = events.find((event) => event.type === 'complete');
      expect(complete).toBeDefined();
      if (complete?.type === 'complete') {
        expect(complete.response.id).toBe('msg_stream');
        expect(complete.response.choices[0].message.content).toBe('Hello Claude');
        expect(complete.response.choices[0].finish_reason).toBe('stop');
        expect(
          complete.response.choices[0].answerAccounting?.providerOutput
        ).toMatchObject({
          tokens: 2,
          reasoning: "included_native",
        });
        expect(complete.response.usage?.total_tokens).toBe(7);
      }
    });

    it('should emit reasoning deltas when Anthropic sends thinking deltas', async () => {
      basicRequest.settings.reasoning = {
        enabled: true,
        effort: undefined as any,
        maxTokens: undefined as any,
        exclude: false
      };
      mockStream.mockReturnValueOnce(streamFrom([
        messageStart,
        { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'thinking ' } },
        { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'answer' } },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { input_tokens: 5, output_tokens: 3 }
        },
        { type: 'message_stop' }
      ]));

      const events = await collectEvents();

      expect(events.find((event) => event.type === 'reasoning_delta')).toMatchObject({
        type: 'reasoning_delta',
        delta: 'thinking ',
        index: 0
      });
      expect(events.find((event) => event.type === "content_delta")).toMatchObject({
        type: "content_delta",
        delta: "answer",
        index: 0,
      });
      expect(
        new Set(
          events.flatMap((event) =>
            event.type === "adapter_evidence" &&
            event.observedEvidence.choice !== undefined
              ? [event.observedEvidence.choice.index]
              : []
          )
        )
      ).toEqual(new Set([0]));
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
      mockStream.mockReturnValueOnce(streamFrom([
        messageStart,
        { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hidden thought' } },
        { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'visible answer' } },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { input_tokens: 5, output_tokens: 3 }
        },
        { type: 'message_stop' }
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
      (apiError as any).status = 429;
      mockStream.mockImplementationOnce(() => {
        throw apiError;
      });

      const events = await collectEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'error',
        error: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          error: {
            code: ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED,
            type: 'rate_limit_error'
          }
        }
      });
    });

    it('should include a partial response when a stream fails after deltas', async () => {
      mockStream.mockReturnValueOnce(streamFrom([
        messageStart,
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Partial' } }
      ], new Error('stream interrupted')));

      const events = await collectEvents();
      const error = events.find((event) => event.type === 'error');

      expect(error).toBeDefined();
      if (error?.type === 'error') {
        expect(error.error.partialResponse?.id).toBe('msg_stream');
        expect(error.error.partialResponse?.choices[0].message.content).toBe('Partial');
      }
    });
  });

  describe('reasoning extraction from thinking blocks', () => {
    // Anthropic exposes reasoning only as content blocks of type "thinking".
    // `Message` has no `thinking_content` or `reasoning_details` field, so the
    // adapter must not depend on either.
    const withReasoning = (): InternalLLMChatRequest => ({
      ...basicRequest,
      settings: {
        ...basicRequest.settings,
        reasoning: { enabled: true, effort: undefined as any, maxTokens: undefined as any, exclude: false }
      }
    });

    it('should extract reasoning from thinking content blocks', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_think',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [
          { type: 'thinking', thinking: 'step one ', signature: 'sig' },
          { type: 'thinking', thinking: 'step two', signature: 'sig' },
          { type: 'text', text: 'the answer' }
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 }
      });

      const response = await adapter.sendMessage(withReasoning(), 'test-api-key');

      const success = response as LLMResponse;
      expect(success.choices[0].reasoning).toBe('step one step two');
      expect(success.choices[0].message.content).toBe('the answer');
    });

    it('should not treat a thinking-first response as an invalid structure', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_think_first',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [
          { type: 'thinking', thinking: 'reasoning', signature: 'sig' },
          { type: 'text', text: 'answer' }
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 }
      });

      const response = await adapter.sendMessage(withReasoning(), 'test-api-key');

      expect(response.object).toBe('chat.completion');
      expect((response as LLMResponse).choices[0].message.content).toBe('answer');
    });

    it('should ignore non-Anthropic thinking_content and reasoning_details fields', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_bogus_fields',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'answer' }],
        // Neither of these is an Anthropic response field. thinking_content is
        // invented; reasoning_details is OpenRouter's. Both must be ignored.
        thinking_content: 'should not surface',
        reasoning_details: [{ type: 'reasoning.text', text: 'should not surface' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 }
      });

      const response = await adapter.sendMessage(withReasoning(), 'test-api-key');

      const choice = (response as LLMResponse).choices[0] as any;
      expect(choice.reasoning).toBeUndefined();
      expect(choice.reasoning_details).toBeUndefined();
    });

    it('should omit reasoning when reasoning.exclude is true', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'msg_excluded',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [
          { type: 'thinking', thinking: 'hidden', signature: 'sig' },
          { type: 'text', text: 'answer' }
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 }
      });

      const request = withReasoning();
      request.settings.reasoning!.exclude = true;

      const response = await adapter.sendMessage(request, 'test-api-key');

      expect((response as LLMResponse).choices[0].reasoning).toBeUndefined();
      expect((response as LLMResponse).choices[0].message.content).toBe('answer');
    });
  });

  describe('structured output', () => {
    // Anthropic's structured outputs are GA: the request carries
    // output_config.format, with no `anthropic-beta` header, no schema `name`,
    // and no format-level `strict`. These tests assert the outbound request so a
    // regression to the transitional beta shape fails the suite.
    const personSchema: StructuredOutputSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' }
      },
      required: ['name', 'age']
    };

    const withStructuredOutput = (
      structuredOutput: StructuredOutputSettings
    ): InternalLLMChatRequest => ({
      ...basicRequest,
      modelId: 'claude-sonnet-4-5-20250929',
      settings: { ...basicRequest.settings, structuredOutput }
    });

    const jsonResponse = (text: string) => ({
      id: 'msg_structured',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-5-20250929',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 }
    });

    it('should send output_config.format on non-streaming requests', async () => {
      mockCreate.mockResolvedValueOnce(jsonResponse('{"name":"Carol","age":35}'));

      await adapter.sendMessage(
        withStructuredOutput({ name: 'person_info', schema: personSchema, strict: true }),
        'test-api-key'
      );

      const [params] = mockCreate.mock.calls[0];
      expect(params.output_config).toEqual({
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' }
            },
            required: ['name', 'age'],
            additionalProperties: false
          }
        }
      });
      // The GA format object carries only `type` and `schema`.
      expect(Object.keys(params.output_config.format).sort()).toEqual(['schema', 'type']);
      expect(params.output_config.format).not.toHaveProperty('name');
      expect(params.output_config.format).not.toHaveProperty('strict');
    });

    it('should not send the legacy output_format field or beta header', async () => {
      mockCreate.mockResolvedValueOnce(jsonResponse('{"name":"Carol","age":35}'));

      await adapter.sendMessage(
        withStructuredOutput({ name: 'person_info', schema: personSchema }),
        'test-api-key'
      );

      const call = mockCreate.mock.calls[0];
      expect(call[0]).not.toHaveProperty('output_format');
      // With no transport options there is no request-options argument at all,
      // so there is nowhere for a beta header to hide.
      expect(call).toHaveLength(1);
      expect(JSON.stringify(call)).not.toContain('anthropic-beta');
      expect(JSON.stringify(call)).not.toContain('structured-outputs-2025-11-13');
    });

    it('should send output_config.format on streaming requests without a beta header', async () => {
      mockStream.mockReturnValueOnce(streamFrom([
        {
          type: 'message_start',
          message: {
            id: 'msg_structured_stream',
            type: 'message',
            role: 'assistant',
            model: 'claude-sonnet-4-5-20250929',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 5, output_tokens: 0 }
          }
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"name":"Carol","age":35}' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { input_tokens: 5, output_tokens: 9 } },
        { type: 'message_stop' }
      ]));

      const request = withStructuredOutput({ name: 'person_info', schema: personSchema });
      for await (const _event of adapter.streamMessage(request, 'test-api-key')) {
        // drain
      }

      const call = mockStream.mock.calls[0];
      expect(call[0].output_config).toEqual({
        format: {
          type: 'json_schema',
          schema: expect.objectContaining({ type: 'object', additionalProperties: false })
        }
      });
      expect(call[0]).not.toHaveProperty('output_format');
      expect(call).toHaveLength(1);
      expect(JSON.stringify(call)).not.toContain('anthropic-beta');
    });

    it('should send neither field when structuredOutput.enabled is false', async () => {
      mockCreate.mockResolvedValueOnce(jsonResponse('plain text'));

      await adapter.sendMessage(
        withStructuredOutput({ enabled: false, name: 'person_info', schema: personSchema }),
        'test-api-key'
      );

      const [params] = mockCreate.mock.calls[0];
      expect(params).not.toHaveProperty('output_config');
      expect(params).not.toHaveProperty('output_format');
    });

    it('should forward abort signal and timeout on structured requests', async () => {
      mockCreate.mockResolvedValueOnce(jsonResponse('{"name":"Carol","age":35}'));
      const controller = new AbortController();

      await adapter.sendMessage(
        withStructuredOutput({ name: 'person_info', schema: personSchema }),
        'test-api-key',
        { signal: controller.signal, timeoutMs: 7500 }
      );

      const call = mockCreate.mock.calls[0];
      expect(call[0].output_config.format.type).toBe('json_schema');
      // Exact equality: the options bag carries transport options only - no headers.
      expect(call[1]).toEqual({ signal: controller.signal, timeout: 7500 });
    });

    describe('schema preparation', () => {
      it('should add additionalProperties: false to nested objects and array items', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse('{}'));

        const nestedSchema: StructuredOutputSchema = {
          type: 'object',
          properties: {
            person: {
              type: 'object',
              properties: { name: { type: 'string' } }
            },
            tags: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' } }
              }
            }
          }
        };

        await adapter.sendMessage(
          withStructuredOutput({ name: 'nested', schema: nestedSchema }),
          'test-api-key'
        );

        const schema = mockCreate.mock.calls[0][0].output_config.format.schema;
        expect(schema.additionalProperties).toBe(false);
        expect(schema.properties.person.additionalProperties).toBe(false);
        expect(schema.properties.tags.items.additionalProperties).toBe(false);
        // Arrays themselves are not objects, so they get no additionalProperties.
        expect(schema.properties.tags).not.toHaveProperty('additionalProperties');
      });

      it('should not mutate the caller-supplied schema', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse('{}'));
        const settings: StructuredOutputSettings = {
          name: 'person_info',
          schema: { type: 'object', properties: { name: { type: 'string' } } }
        };

        await adapter.sendMessage(withStructuredOutput(settings), 'test-api-key');

        expect(settings.schema).not.toHaveProperty('additionalProperties');
      });

      it('should send the schema untouched when strict is false', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse('{}'));

        await adapter.sendMessage(
          withStructuredOutput({ name: 'person_info', schema: personSchema, strict: false }),
          'test-api-key'
        );

        const schema = mockCreate.mock.calls[0][0].output_config.format.schema;
        expect(schema).toEqual(personSchema);
        expect(schema).not.toHaveProperty('additionalProperties');
      });

      it('traverses $defs and anyOf branches', async () => {
        // Previously untraversed - see ISSUE-structured-output-schema-traversal.md.
        // Full keyword coverage lives in shared/adapters/schemaUtils.test.ts; this
        // asserts the adapter actually routes through it.
        mockCreate.mockResolvedValueOnce(jsonResponse('{}'));

        const compositeSchema = {
          type: 'object',
          properties: {
            choice: {
              anyOf: [{ type: 'object', properties: { a: { type: 'string' } } }]
            }
          },
          $defs: {
            Address: { type: 'object', properties: { city: { type: 'string' } } }
          }
        } as unknown as StructuredOutputSchema;

        await adapter.sendMessage(
          withStructuredOutput({ name: 'composite', schema: compositeSchema }),
          'test-api-key'
        );

        const schema = mockCreate.mock.calls[0][0].output_config.format.schema;
        expect(schema.additionalProperties).toBe(false);
        expect(schema.$defs.Address.additionalProperties).toBe(false);
        expect(schema.properties.choice.anyOf[0].additionalProperties).toBe(false);
      });

      it('should not add `required` for Anthropic (that is OpenAI-only strictness)', async () => {
        mockCreate.mockResolvedValueOnce(jsonResponse('{}'));

        await adapter.sendMessage(
          withStructuredOutput({
            name: 'partial_required',
            schema: {
              type: 'object',
              properties: { name: { type: 'string' }, age: { type: 'integer' } },
              required: ['name']
            }
          }),
          'test-api-key'
        );

        const schema = mockCreate.mock.calls[0][0].output_config.format.schema;
        expect(schema.required).toEqual(['name']);
      });
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key format', () => {
      // Valid Anthropic API key format - must start with 'sk-ant-' and be at least 30 chars
      expect(adapter.validateApiKey('sk-ant-api01-test123456789012345')).toBe(true);
      expect(adapter.validateApiKey('sk-ant-api03-test123456789012345')).toBe(true);
      
      // Invalid formats
      expect(adapter.validateApiKey('invalid')).toBe(false);
      expect(adapter.validateApiKey('')).toBe(false);
      expect(adapter.validateApiKey('sk-test')).toBe(false); // OpenAI format
      expect(adapter.validateApiKey('sk-ant-test123')).toBe(false); // Too short
    });
  });

  describe('getAdapterInfo', () => {
    it('should return correct adapter information', () => {
      const info = adapter.getAdapterInfo();
      
      expect(info.providerId).toBe('anthropic');
      expect(info.name).toBe('Anthropic Client Adapter');
      expect(info.version).toBeDefined();
      // supportedModels is not part of the interface
    });
  });
});
