import { GoogleGenAI } from '@google/genai';
import { GeminiClientAdapter } from './GeminiClientAdapter';
import { ADAPTER_ERROR_CODES } from './types';
import type { InternalLLMChatRequest } from './types';
import type { LLMResponse, LLMFailureResponse } from '../types';

// Mock the entire '@google/genai' module
jest.mock('@google/genai');

// Cast the mocked module to allow setting up mock implementations
const MockGoogleGenAI = GoogleGenAI as jest.MockedClass<typeof GoogleGenAI>;

describe('GeminiClientAdapter', () => {
  let adapter: GeminiClientAdapter;
  let mockGenerateContent: jest.Mock;
  let mockGetGenerativeModel: jest.Mock;
  let mockModel: any;
  let basicRequest: InternalLLMChatRequest;

  beforeEach(() => {
    // Reset mocks before each test
    MockGoogleGenAI.mockClear();
    mockGenerateContent = jest.fn();
    
    // Mock the models.generateContent method
    MockGoogleGenAI.mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent
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
        stopSequences: [],
        user: 'test-user',
        geminiSafetySettings: [],
        supportsSystemMessage: true,
        reasoning: {
          enabled: false,
          effort: undefined as any,
          maxTokens: undefined as any,
          exclude: false
        }
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
          thinkingBudget: 5000
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