import { GoogleGenAI } from '@google/genai';
import { GeminiClientAdapter } from './GeminiClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type { LLMResponse, LLMFailureResponse } from '../types';

// Mock the entire '@google/genai' module
jest.mock('@google/genai');

// Cast the mocked module to allow setting up mock implementations
const MockGoogleGenAI = GoogleGenAI as jest.MockedClass<typeof GoogleGenAI>;

async function* streamFrom(chunks: any[], error?: Error): AsyncGenerator<any> {
  for (const chunk of chunks) {
    yield chunk;
  }
  if (error) {
    throw error;
  }
}

describe('GeminiClientAdapter', () => {
  let adapter: GeminiClientAdapter;
  let mockGenerateContent: jest.Mock;
  let mockGenerateContentStream: jest.Mock;
  let mockGetGenerativeModel: jest.Mock;
  let mockModel: any;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    // Reset mocks before each test
    MockGoogleGenAI.mockClear();
    mockGenerateContent = jest.fn();
    mockGenerateContentStream = jest.fn();
    
    // Mock the models.generateContent method
    MockGoogleGenAI.mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
        generateContentStream: mockGenerateContentStream
      }
    } as any));

    adapter = new GeminiClientAdapter();
    basicRequest = {
      providerId: 'gemini',
      modelId: 'gemini-2.5-pro',
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
    it('should format the request correctly and call the Gemini API', async () => {
      // Setup mock response - Gemini API returns the raw response without nesting
      mockGenerateContent.mockResolvedValueOnce({
        text: () => 'Hello! How can I help you today?',
        candidates: [{
          finishReason: 'STOP',
          content: {
            parts: [{ text: 'Hello! How can I help you today?' }],
            role: 'model'
          }
        }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30
        }
      });

      const response = await adapter.sendMessage(basicRequest, 'test-api-key');

      // Verify GoogleGenAI was instantiated with the API key
      expect(MockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });

      // Verify generateContent was called
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.5-pro');
      expect(callArgs.contents).toHaveLength(1);
      expect(callArgs.contents[0].role).toBe('user');

      // Verify the response
      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.provider).toBe('gemini');
      expect(successResponse.model).toBe('gemini-2.5-pro');
      expect(successResponse.choices[0].message.content).toBe('Hello! How can I help you today?');
      expect(successResponse.usage?.total_tokens).toBe(30);
    });

    it('should map topK and seed into the generation config', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: () => 'Hi',
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: 'Hi' }], role: 'model' }
        }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }
      });

      basicRequest.settings.topK = 64;
      basicRequest.settings.seed = 1234;

      await adapter.sendMessage(basicRequest, 'test-api-key');

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.config.topK).toBe(64);
      expect(callArgs.config.seed).toBe(1234);
      expect(callArgs.config).not.toHaveProperty('min_p');
      expect(callArgs.config).not.toHaveProperty('repeat_penalty');
    });

    it('should pass abort signal and timeout into the request config', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: () => 'Hi',
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: 'Hi' }], role: 'model' }
        }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }
      });

      const controller = new AbortController();
      await adapter.sendMessage(basicRequest, 'test-api-key', {
        signal: controller.signal,
        timeoutMs: 7000,
      });

      const callArgs = mockGenerateContent.mock.calls[0][0];
      // With timeoutMs set the adapter owns the timeout: it passes a composed
      // signal (not the caller's) and pads the SDK's server-side hint by 1s
      expect(callArgs.config.abortSignal).toBeInstanceOf(AbortSignal);
      expect(callArgs.config.abortSignal).not.toBe(controller.signal);
      expect(callArgs.config.httpOptions).toEqual({ timeout: 8000 });
    });

    it('should pass the caller signal through unchanged when no timeout is set', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: () => 'Hi',
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: 'Hi' }], role: 'model' }
        }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }
      });

      const controller = new AbortController();
      await adapter.sendMessage(basicRequest, 'test-api-key', {
        signal: controller.signal,
      });

      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.config.abortSignal).toBe(controller.signal);
      expect(callArgs.config).not.toHaveProperty('httpOptions');
    });

    describe('timeout and abort classification', () => {
      // Since @google/genai 1.52 fetch rejections that are Error instances are
      // rethrown unwrapped, so aborts surface as typed AbortError DOMExceptions.
      // Timeout and caller abort are still byte-identical (same internal
      // controller), so the adapter must classify from its own state either way.
      const sdkAbortWrapperError = () =>
        new DOMException('This operation was aborted', 'AbortError');

      const rejectOnAbort = () =>
        mockGenerateContent.mockImplementation(
          (args: any) =>
            new Promise((_resolve, reject) => {
              args.config.abortSignal.addEventListener('abort', () =>
                reject(sdkAbortWrapperError())
              );
            })
        );

      it('classifies an adapter-owned timeout as REQUEST_TIMEOUT', async () => {
        rejectOnAbort();

        const response = await adapter.sendMessage(basicRequest, 'test-api-key', {
          timeoutMs: 20,
        });

        expect(response.object).toBe('error');
        const failure = response as LLMFailureResponse;
        expect(failure.error.code).toBe(ADAPTER_ERROR_CODES.REQUEST_TIMEOUT);
        expect(failure.error.type).toBe('timeout_error');
      });

      it('classifies a caller abort as REQUEST_ABORTED even when a timeout is set', async () => {
        rejectOnAbort();

        const controller = new AbortController();
        const pending = adapter.sendMessage(basicRequest, 'test-api-key', {
          signal: controller.signal,
          timeoutMs: 5000,
        });
        controller.abort();

        const response = await pending;
        expect(response.object).toBe('error');
        const failure = response as LLMFailureResponse;
        expect(failure.error.code).toBe(ADAPTER_ERROR_CODES.REQUEST_ABORTED);
        expect(failure.error.type).toBe('abort_error');
      });

      it('leaves unrelated SDK wrapper errors on the common mapping', async () => {
        mockGenerateContent.mockRejectedValueOnce(
          new Error('exception TypeError: fetch failed sending request')
        );

        const response = await adapter.sendMessage(basicRequest, 'test-api-key', {
          timeoutMs: 5000,
        });

        expect(response.object).toBe('error');
        const failure = response as LLMFailureResponse;
        expect(failure.error.code).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
      });

      it('classifies undici fetch failures as NETWORK_ERROR via the cause code', async () => {
        // Since @google/genai 1.52 network-level failures reach the adapter as
        // undici's raw `TypeError: fetch failed` with the real error on `cause`
        mockGenerateContent.mockRejectedValueOnce(
          Object.assign(new TypeError('fetch failed'), {
            cause: Object.assign(new Error('connect ECONNREFUSED 142.250.74.106:443'), {
              code: 'ECONNREFUSED',
            }),
          })
        );

        const response = await adapter.sendMessage(basicRequest, 'test-api-key', {
          timeoutMs: 5000,
        });

        expect(response.object).toBe('error');
        const failure = response as LLMFailureResponse;
        expect(failure.error.code).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(failure.error.type).toBe('connection_error');
        expect(failure.error.message).toContain('ECONNREFUSED');
      });
    });

    it('should handle system messages correctly', async () => {
      basicRequest.messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' }
      ];

      mockGenerateContent.mockResolvedValueOnce({
        text: () => 'Hello!',
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: 'Hello!' }], role: 'model' }
        }],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 5, totalTokenCount: 20 }
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      // System message should be passed as systemInstruction
      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-pro',
        contents: [{
          role: 'user',
          parts: [{ text: 'Hello' }]
        }],
        config: {
          temperature: 0.7,
          maxOutputTokens: 100,
          topP: 1,
          safetySettings: [],
          systemInstruction: 'You are a helpful assistant.'
        }
      });
    });

    describe('system message handling for models without system instruction support', () => {
      it('should prepend system message to first user message when supportsSystemMessage is false', async () => {
        const requestWithNoSystemSupport = {
          ...basicRequest,
          modelId: 'gemma-3-27b-it',
          messages: [
            { role: 'system' as const, content: 'You are a helpful assistant.' },
            { role: 'user' as const, content: 'Hello' }
          ],
          settings: {
            ...basicRequest.settings,
            supportsSystemMessage: false
          }
        };

        mockGenerateContent.mockResolvedValueOnce({
          text: () => 'Hello!',
          candidates: [{
            finishReason: 'STOP',
            content: { parts: [{ text: 'Hello!' }], role: 'model' }
          }],
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 5, totalTokenCount: 20 }
        });

        await adapter.sendMessage(requestWithNoSystemSupport, 'test-api-key');

        const callArgs = mockGenerateContent.mock.calls[0][0];
        // System message should NOT be passed as systemInstruction
        expect(callArgs.config.systemInstruction).toBeUndefined();
        // Instead, it should be prepended to the first user message
        expect(callArgs.contents).toHaveLength(1);
        expect(callArgs.contents[0].role).toBe('user');
        expect(callArgs.contents[0].parts[0].text).toBe('<system>\nYou are a helpful assistant.\n</system>\n\nHello');
      });

      it('should handle request.systemMessage when supportsSystemMessage is false', async () => {
        const requestWithNoSystemSupport = {
          ...basicRequest,
          modelId: 'gemma-3-27b-it',
          systemMessage: 'Base system instruction',
          messages: [
            { role: 'user' as const, content: 'Hello' }
          ],
          settings: {
            ...basicRequest.settings,
            supportsSystemMessage: false
          }
        };

        mockGenerateContent.mockResolvedValueOnce({
          text: () => 'Hello!',
          candidates: [{
            finishReason: 'STOP',
            content: { parts: [{ text: 'Hello!' }], role: 'model' }
          }],
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 5, totalTokenCount: 20 }
        });

        await adapter.sendMessage(requestWithNoSystemSupport, 'test-api-key');

        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.config.systemInstruction).toBeUndefined();
        expect(callArgs.contents[0].parts[0].text).toBe('<system>\nBase system instruction\n</system>\n\nHello');
      });

      it('should return error when both systemMessage and inline system messages are provided', async () => {
        const requestWithBothSystemSources = {
          ...basicRequest,
          modelId: 'gemma-3-27b-it',
          systemMessage: 'Base system instruction',
          messages: [
            { role: 'system' as const, content: 'Additional system content' },
            { role: 'user' as const, content: 'Hello' }
          ],
          settings: {
            ...basicRequest.settings,
            supportsSystemMessage: false
          }
        };

        const result = await adapter.sendMessage(requestWithBothSystemSources, 'test-api-key');

        expect(result.object).toBe('error');
        expect((result as { error: { message: string } }).error.message).toContain(
          'Cannot use both systemMessage field and system role messages in the messages array'
        );
      });

      it('should still use systemInstruction when supportsSystemMessage is true (default)', async () => {
        const requestWithSystemSupport = {
          ...basicRequest,
          modelId: 'gemini-2.5-pro',
          messages: [
            { role: 'system' as const, content: 'You are a helpful assistant.' },
            { role: 'user' as const, content: 'Hello' }
          ],
          settings: {
            ...basicRequest.settings,
            supportsSystemMessage: true
          }
        };

        mockGenerateContent.mockResolvedValueOnce({
          text: () => 'Hello!',
          candidates: [{
            finishReason: 'STOP',
            content: { parts: [{ text: 'Hello!' }], role: 'model' }
          }],
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 5, totalTokenCount: 20 }
        });

        await adapter.sendMessage(requestWithSystemSupport, 'test-api-key');

        const callArgs = mockGenerateContent.mock.calls[0][0];
        // System message SHOULD be passed as systemInstruction
        expect(callArgs.config.systemInstruction).toBe('You are a helpful assistant.');
        // User message should remain unchanged
        expect(callArgs.contents[0].parts[0].text).toBe('Hello');
      });

      it('should handle no user messages gracefully when supportsSystemMessage is false', async () => {
        // Edge case: system message only, no user messages
        const requestWithNoSystemSupport = {
          ...basicRequest,
          modelId: 'gemma-3-27b-it',
          messages: [
            { role: 'system' as const, content: 'You are a helpful assistant.' }
          ],
          settings: {
            ...basicRequest.settings,
            supportsSystemMessage: false
          }
        };

        mockGenerateContent.mockResolvedValueOnce({
          text: () => 'Hello!',
          candidates: [{
            finishReason: 'STOP',
            content: { parts: [{ text: 'Hello!' }], role: 'model' }
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
        });

        await adapter.sendMessage(requestWithNoSystemSupport, 'test-api-key');

        const callArgs = mockGenerateContent.mock.calls[0][0];
        // No user message to prepend to, but should not crash
        // The system instruction should be cleared since model doesn't support it
        // Contents should be empty (only system messages in the array, which get filtered out)
        expect(callArgs.config.systemInstruction).toBeUndefined();
        expect(callArgs.contents).toHaveLength(0);
      });
    });

    it('should handle multi-turn conversations with role mapping', async () => {
      basicRequest.messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' }
      ];

      mockGenerateContent.mockResolvedValueOnce({
        text: () => "I'm doing well!",
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: "I'm doing well!" }], role: 'model' }
        }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 }
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      // Verify role mapping: assistant -> model
      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-pro',
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there!' }] },
          { role: 'user', parts: [{ text: 'How are you?' }] }
        ],
        config: {
          temperature: 0.7,
          maxOutputTokens: 100,
          topP: 1,
          safetySettings: []
        }
      });
    });

    it('should handle stop sequences', async () => {
      basicRequest.settings.stopSequences = ['END', 'STOP'];

      mockGenerateContent.mockResolvedValueOnce({
        text: () => 'Response',
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: 'Response' }], role: 'model' }
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            stopSequences: ['END', 'STOP']
          })
        })
      );
    });

    it('should handle safety settings', async () => {
      basicRequest.settings.geminiSafetySettings = [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' }
      ];

      mockGenerateContent.mockResolvedValueOnce({
        text: () => 'Response',
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: 'Response' }], role: 'model' }
        }]
      });

      await adapter.sendMessage(basicRequest, 'test-api-key');

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            safetySettings: [
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' }
            ]
          })
        })
      );
    });

    it('should map finish reasons correctly', async () => {
      const finishReasons = [
        { gemini: 'STOP', expected: 'stop' },
        { gemini: 'MAX_TOKENS', expected: 'length' },
        { gemini: 'SAFETY', expected: 'content_filter' },
        { gemini: 'RECITATION', expected: 'content_filter' },
        { gemini: 'OTHER', expected: 'other' },
        { gemini: 'UNKNOWN', expected: 'other' }
      ];

      for (const { gemini, expected } of finishReasons) {
        mockGenerateContent.mockResolvedValueOnce({
          text: () => 'Response',
          candidates: [{
            finishReason: gemini,
            content: { parts: [{ text: 'Response' }], role: 'model' }
          }]
        });

        const response = await adapter.sendMessage(basicRequest, 'test-api-key');
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].finish_reason).toBe(expected);
      }
    });

    describe('reasoning/thinking configuration', () => {
      it('should add thinking config when reasoning is enabled with maxTokens', async () => {
        const requestWithReasoning = {
          ...basicRequest,
          settings: {
            ...basicRequest.settings,
            reasoning: {
              enabled: true,
              maxTokens: 5000,
              effort: undefined as any,
              exclude: false
            }
          }
        };

        mockGenerateContent.mockResolvedValueOnce({
          text: () => 'Response with thinking',
          candidates: [{
            finishReason: 'STOP',
            content: {
              parts: [{ text: 'Response with thinking' }]
            }
          }],
          usageMetadata: {}
        });

        await adapter.sendMessage(requestWithReasoning, 'test-api-key');

        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toEqual({
          thinkingBudget: 5000,
          includeThoughts: true
        });
      });

      it('should convert effort levels to thinking budget', async () => {
        const requestWithEffort = {
          ...basicRequest,
          settings: {
            ...basicRequest.settings,
            reasoning: {
              enabled: true,
              effort: 'high' as const,
              maxTokens: undefined as any,
              exclude: false
            }
          }
        };

        mockGenerateContent.mockResolvedValueOnce({
          text: () => 'Response',
          candidates: [{
            finishReason: 'STOP',
            content: {
              parts: [{ text: 'Response' }]
            }
          }],
          usageMetadata: {}
        });

        await adapter.sendMessage(requestWithEffort, 'test-api-key');

        const callArgs = mockGenerateContent.mock.calls[0][0];
        // For gemini-2.5-pro (not flash), max budget is 65536, high effort = 80%
        expect(callArgs.config.thinkingConfig?.thinkingBudget).toBe(Math.floor(65536 * 0.8));
      });

      it('should use dynamic budget (-1) when reasoning enabled without specific settings', async () => {
        const requestWithBasicReasoning = {
          ...basicRequest,
          settings: {
            ...basicRequest.settings,
            reasoning: {
              enabled: true,
              effort: undefined as any,
              maxTokens: undefined as any,
              exclude: false
            }
          }
        };

        mockGenerateContent.mockResolvedValueOnce({
          text: () => 'Response',
          candidates: [{
            finishReason: 'STOP',
            content: {
              parts: [{ text: 'Response' }]
            }
          }],
          usageMetadata: {}
        });

        await adapter.sendMessage(requestWithBasicReasoning, 'test-api-key');

        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig?.thinkingBudget).toBe(-1);
      });

      it('should exclude thinking config when reasoning.exclude is true', async () => {
        const requestWithExclude = {
          ...basicRequest,
          settings: {
            ...basicRequest.settings,
            reasoning: {
              enabled: true,
              maxTokens: 5000,
              effort: undefined as any,
              exclude: true
            }
          }
        };

        mockGenerateContent.mockResolvedValueOnce({
          text: () => 'Response',
          candidates: [{
            finishReason: 'STOP',
            content: {
              parts: [{ text: 'Response' }]
            }
          }],
          usageMetadata: {}
        });

        await adapter.sendMessage(requestWithExclude, 'test-api-key');

        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should handle API key errors', async () => {
        const apiError = new Error('API key not valid');
        mockGenerateContent.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'invalid-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INVALID_API_KEY);
        expect(errorResponse.error.type).toBe('authentication_error');
      });

      it('should handle safety/content filter errors', async () => {
        const apiError = new Error('Response was blocked due to safety reasons');
        mockGenerateContent.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.CONTENT_FILTER);
        expect(errorResponse.error.type).toBe('content_filter_error');
      });

      it('should handle quota exceeded errors', async () => {
        const apiError = new Error('API rate limit exceeded');
        mockGenerateContent.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(errorResponse.error.type).toBe('rate_limit_error');
      });

      it('should handle model not found errors', async () => {
        const apiError = new Error('Model not found');
        (apiError as any).status = 404;
        mockGenerateContent.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
        expect(errorResponse.error.type).toBe('invalid_request_error');
      });

      it('should handle permission errors', async () => {
        const apiError = new Error('Invalid API key provided');
        mockGenerateContent.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.INVALID_API_KEY);
        expect(errorResponse.error.type).toBe('authentication_error');
      });

      it('should handle generic errors', async () => {
        const apiError = new Error('Unknown error');
        mockGenerateContent.mockRejectedValueOnce(apiError);

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
        expect(errorResponse.error.message).toContain('Unknown error');
      });

      it('should handle empty response as success with empty content', async () => {
        mockGenerateContent.mockResolvedValueOnce({
          text: () => '',
          candidates: []
        });

        const response = await adapter.sendMessage(basicRequest, 'test-key');

        // Empty responses are returned as success with empty content
        const successResponse = response as LLMResponse;
        expect(successResponse.object).toBe('chat.completion');
        expect(successResponse.choices[0].message.content).toBe('');
      });
    });
  });

  describe('streamMessage', () => {
    const collectEvents = async (request: InternalLLMChatRequest = basicRequest, options?: Parameters<GeminiClientAdapter['streamMessage']>[2]) => {
      const events = [];
      for await (const event of adapter.streamMessage(request, 'test-api-key', options)) {
        events.push(event);
      }
      return events;
    };

    it('should stream content, reasoning, usage, and final normalized response', async () => {
      mockGenerateContentStream.mockResolvedValueOnce(streamFrom([
        {
          modelUsed: 'gemini-2.5-pro',
          candidates: [{
            content: { parts: [{ text: 'thinking ', thought: true }], role: 'model' }
          }]
        },
        {
          modelUsed: 'gemini-2.5-pro',
          candidates: [{
            content: { parts: [{ text: 'Hello ' }], role: 'model' }
          }]
        },
        {
          modelUsed: 'gemini-2.5-pro',
          candidates: [{
            finishReason: 'STOP',
            content: { parts: [{ text: 'world' }], role: 'model' }
          }],
          usageMetadata: {
            promptTokenCount: 3,
            candidatesTokenCount: 4,
            totalTokenCount: 7
          }
        }
      ]));

      basicRequest.settings.reasoning = {
        enabled: true,
        effort: undefined as any,
        maxTokens: undefined as any,
        exclude: false
      };

      const events = await collectEvents();

      expect(mockGenerateContentStream).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.model).toBe('gemini-2.5-pro');
      expect(callArgs.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] }
      ]);
      expect(callArgs.config.thinkingConfig).toEqual({
        thinkingBudget: -1,
        includeThoughts: true
      });
      expect(events.find((event) => event.type === "start")).toMatchObject({
        type: 'start',
        provider: 'gemini',
        model: 'gemini-2.5-pro'
      });
      expect(events.find((event) => event.type === 'reasoning_delta')).toMatchObject({
        type: 'reasoning_delta',
        delta: 'thinking ',
        index: 0
      });
      expect(events.filter((event) => event.type === 'content_delta').map((event) => event.delta).join(''))
        .toBe('Hello world');
      expect(events.find((event) => event.type === 'usage')).toMatchObject({
        type: 'usage',
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }
      });

      const complete = events.find((event) => event.type === 'complete');
      expect(complete).toBeDefined();
      if (complete?.type === 'complete') {
        expect(complete.response.provider).toBe('gemini');
        expect(complete.response.model).toBe('gemini-2.5-pro');
        expect(complete.response.choices[0].message.content).toBe('Hello world');
        expect(complete.response.choices[0].reasoning).toBe('thinking ');
        expect(complete.response.choices[0].finish_reason).toBe('stop');
        expect(complete.response.usage?.total_tokens).toBe(7);
      }
    });

    it("keeps non-text streaming evidence typed by its provider part", async () => {
      mockGenerateContentStream.mockResolvedValueOnce(streamFrom([{
        modelUsed: "gemini-2.5-pro",
        candidates: [{
          finishReason: "STOP",
          content: {
            role: "model",
            parts: [{
              functionCall: {
                name: "lookup",
                args: { city: "Paris" },
              },
            }],
          },
        }],
      }]));

      const events = await collectEvents();
      const evidence = events.find(
        (event) =>
          event.type === "adapter_evidence" &&
          event.observedEvidence.choice?.rawContentParts?.length
      );

      expect(evidence).toMatchObject({
        type: "adapter_evidence",
        observedEvidence: {
          choice: {
            index: 0,
            rawContentParts: [{
              type: "functionCall",
              value: {
                functionCall: {
                  name: "lookup",
                  args: { city: "Paris" },
                },
              },
            }],
          },
        },
      });
    });

    it('should preserve transport options and request configuration', async () => {
      mockGenerateContentStream.mockResolvedValueOnce(streamFrom([
        {
          candidates: [{
            finishReason: 'STOP',
            content: { parts: [{ text: '{}' }], role: 'model' }
          }]
        }
      ]));

      const controller = new AbortController();
      const request = {
        ...basicRequest,
        messages: [
          { role: 'system' as const, content: 'You are concise.' },
          { role: 'user' as const, content: 'JSON please' }
        ],
        settings: {
          ...basicRequest.settings,
          topK: 64,
          seed: 99,
          stopSequences: ['END'],
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

      await collectEvents(request, {
        signal: controller.signal,
        timeoutMs: 7000,
      });

      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config).toMatchObject({
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 1,
        topK: 64,
        seed: 99,
        stopSequences: ['END'],
        systemInstruction: 'You are concise.',
        responseMimeType: 'application/json',
        httpOptions: { timeout: 8000 }
      });
      expect(callArgs.config.abortSignal).toBeInstanceOf(AbortSignal);
      expect(callArgs.config.abortSignal).not.toBe(controller.signal);
    });

    it('should not emit or return reasoning when reasoning.exclude is true', async () => {
      mockGenerateContentStream.mockResolvedValueOnce(streamFrom([
        {
          candidates: [{
            content: {
              parts: [
                { text: 'hidden thought', thought: true },
                { text: 'visible answer' }
              ],
              role: 'model'
            },
            finishReason: 'STOP'
          }]
        }
      ]));

      basicRequest.settings.reasoning = {
        enabled: true,
        effort: undefined as any,
        maxTokens: 1024,
        exclude: true
      };

      const events = await collectEvents();

      expect(events.find((event) => event.type === 'reasoning_delta')).toBeUndefined();
      const complete = events.find((event) => event.type === 'complete');
      if (complete?.type === 'complete') {
        expect(complete.response.choices[0].reasoning).toBeUndefined();
        expect(complete.response.choices[0].message.content).toBe('visible answer');
      }
    });

    it('should map stream creation errors', async () => {
      mockGenerateContentStream.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const events = await collectEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'error',
        error: {
          provider: 'gemini',
          model: 'gemini-2.5-pro',
          error: {
            code: ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED,
            type: 'rate_limit_error'
          }
        }
      });
    });

    it('should include a partial response when a stream fails after chunks', async () => {
      mockGenerateContentStream.mockResolvedValueOnce(streamFrom([
        {
          modelUsed: 'gemini-2.5-pro',
          candidates: [{
            content: { parts: [{ text: 'partial' }], role: 'model' }
          }]
        }
      ], new Error('stream interrupted')));

      const events = await collectEvents();
      const error = events.find((event) => event.type === 'error');

      expect(error).toBeDefined();
      if (error?.type === 'error') {
        expect(error.error.partialResponse?.model).toBe('gemini-2.5-pro');
        expect(error.error.partialResponse?.choices[0].message.content).toBe('partial');
      }
    });

    it('should classify adapter-owned stream timeouts as REQUEST_TIMEOUT', async () => {
      mockGenerateContentStream.mockImplementationOnce(
        (args: any) =>
          Promise.resolve((async function* () {
            await new Promise((_resolve, reject) => {
              args.config.abortSignal.addEventListener('abort', () => {
                reject(new DOMException('This operation was aborted', 'AbortError'));
              });
            });
          })())
      );

      const events = await collectEvents(basicRequest, {
        timeoutMs: 20,
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'error',
        error: {
          error: {
            code: ADAPTER_ERROR_CODES.REQUEST_TIMEOUT,
            type: 'timeout_error'
          }
        }
      });
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key format', () => {
      // Gemini API keys must start with 'AIza' and be at least 35 chars
      expect(adapter.validateApiKey('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456')).toBe(true);
      expect(adapter.validateApiKey('AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ12345')).toBe(true);
      
      // Invalid formats
      expect(adapter.validateApiKey('')).toBe(false);
      expect(adapter.validateApiKey('short')).toBe(false); // Too short
      expect(adapter.validateApiKey('abcdef123456')).toBe(false); // Wrong prefix
    });
  });

  describe('getAdapterInfo', () => {
    it('should return correct adapter information', () => {
      const info = adapter.getAdapterInfo();
      
      expect(info.providerId).toBe('gemini');
      expect(info.name).toBe('Gemini Client Adapter');
      expect(info.version).toBeDefined();
      // supportedModels is not part of the interface
    });
  });
});
