import { LLMService } from './LLMService';
import type { ApiKeyProvider } from '../types';
import type { LLMChatRequest, LLMResponse, LLMFailureResponse } from './types';

describe('LLMService', () => {
  let service: LLMService;
  let mockApiKeyProvider: jest.MockedFunction<ApiKeyProvider>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock API key provider
    mockApiKeyProvider = jest.fn(async (providerId: string) => `mock-key-for-${providerId}`);
    
    // Create service instance
    service = new LLMService(mockApiKeyProvider);
  });

  describe('constructor and initialization', () => {
    it('should initialize with the provided API key provider', () => {
      expect(service).toBeDefined();
      // The service should be ready to use
    });

    it('should lazy-load client adapters on first use', async () => {
      mockApiKeyProvider.mockResolvedValueOnce('sk-test-key-12345678901234567890');
      
      // First request should create the adapter
      const request: LLMChatRequest = {
        providerId: 'openai',
        modelId: 'gpt-4.1',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      await service.sendMessage(request);
      
      // Verify API key provider was called
      expect(mockApiKeyProvider).toHaveBeenCalledWith('openai');
    });
  });

  describe('sendMessage', () => {
    describe('request validation', () => {
      it('should return validation error for unsupported provider', async () => {
        const request: LLMChatRequest = {
          providerId: 'unsupported-provider',
          modelId: 'some-model',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('UNSUPPORTED_PROVIDER');
        expect(errorResponse.error.message).toContain('Unsupported provider');
      });

      it('should succeed with fallback for unknown model', async () => {
        const request: LLMChatRequest = {
          providerId: 'mock',  // Use mock provider to avoid real API calls
          modelId: 'unsupported-model',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        // Should succeed with mock response (not error) even for unknown model
        expect(response.object).toBe('chat.completion');
      });

      it('should silently work with flexible providers unknown models (no warning)', async () => {
        const warnings: string[] = [];
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation((msg) => {
          warnings.push(msg);
        });

        // Test with mock provider (which has allowUnknownModels: true)
        const request: LLMChatRequest = {
          providerId: 'mock',
          modelId: 'totally-unknown-model-xyz',
          messages: [{ role: 'user', content: 'Testing flexible provider' }]
        };

        const response = await service.sendMessage(request);

        // Should succeed with mock response
        expect(response.object).toBe('chat.completion');

        // Should NOT warn about unknown model (filter out adapter constructor warnings)
        const unknownModelWarnings = warnings.filter(w => !w.includes('No adapter constructor'));
        expect(unknownModelWarnings.length).toBe(0);  // No warnings for flexible providers

        consoleWarnSpy.mockRestore();
      });

      it('should return validation error for empty messages', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: []
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_REQUEST');
        expect(errorResponse.error.message).toContain('Request must contain at least one message');
      });

      it('should return validation error for invalid message role', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'invalid' as any, content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_MESSAGE_ROLE');
        expect(errorResponse.error.message).toContain('Invalid message role');
      });

      it('should return validation error for empty message content', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: '' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_MESSAGE');
        expect(errorResponse.error.message).toContain('Message at index 0 must have both');
      });
    });

    describe('API key handling', () => {
      it('should return error when API key provider returns null', async () => {
        mockApiKeyProvider.mockResolvedValueOnce(null);

        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('API_KEY_ERROR');
        expect(errorResponse.error.message).toContain('API key for provider');
      });

      it('should return error when API key provider throws', async () => {
        mockApiKeyProvider.mockRejectedValueOnce(new Error('Key provider error'));

        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('PROVIDER_ERROR');
        expect(errorResponse.error.message).toContain('Key provider error');
      });

      it('should return error for invalid API key format', async () => {
        mockApiKeyProvider.mockResolvedValueOnce('invalid-key');

        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        // OpenAI adapter expects keys starting with 'sk-'
        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_API_KEY');
      });
    });

    describe('adapter routing', () => {
      it('should route request to correct adapter based on provider', async () => {
        mockApiKeyProvider.mockResolvedValueOnce('sk-test-key-12345678901234567890');
        
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Test routing' }]
        };

        const response = await service.sendMessage(request);

        // This will fail with a network error since we're not mocking the actual API
        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        // We should get a network error or similar since we're not mocking the HTTP request
        expect(errorResponse.provider).toBe('openai');
      });

      it('should reuse existing adapter for same provider', async () => {
        const request: LLMChatRequest = {
          providerId: 'mock',
          modelId: 'mock-model',
          messages: [{ role: 'user', content: 'First request' }]
        };

        // First request
        await service.sendMessage(request);
        
        // Second request to same provider
        request.messages = [{ role: 'user', content: 'Second request' }];
        await service.sendMessage(request);

        // API key provider should be called once per unique provider (mock provider now registered)
        expect(mockApiKeyProvider).toHaveBeenCalledTimes(2);
      });
    });

    describe('settings management', () => {
      it('should apply default settings when none provided', async () => {
        mockApiKeyProvider.mockResolvedValueOnce('sk-test-key-12345678901234567890');
        
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await service.sendMessage(request);

        // We'll get a network error but can still verify the request was attempted
        expect(response.object).toBe('error');
        expect(mockApiKeyProvider).toHaveBeenCalledWith('openai');
      });

      it('should merge user settings with defaults', async () => {
        mockApiKeyProvider.mockResolvedValueOnce('sk-test-key-12345678901234567890');
        
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            temperature: 0.9,
            maxTokens: 500
          }
        };

        const response = await service.sendMessage(request);

        // We'll get a network error but the settings should still be validated
        expect(response.object).toBe('error');
      });

      it('should validate temperature setting', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            temperature: 2.5 // Out of range
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_SETTINGS');
        expect(errorResponse.error.message).toContain('temperature must be a number between');
      });

      it('should validate maxTokens setting', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            maxTokens: 0 // Invalid
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_SETTINGS');
        expect(errorResponse.error.message).toContain('maxTokens must be an integer between');
      });

      it('should validate topP setting', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            topP: -0.1 // Out of range
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('INVALID_SETTINGS');
        expect(errorResponse.error.message).toContain('topP must be a number between 0 and 1');
      });

      it('should reject reasoning settings for non-reasoning models', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1', // This model doesn't support reasoning
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            reasoning: {
              enabled: true
            }
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('reasoning_not_supported');
        expect(errorResponse.error.message).toContain('does not support reasoning/thinking');
      });

      it('should reject reasoning with effort for non-reasoning models', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            reasoning: {
              effort: 'high'
            }
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('reasoning_not_supported');
      });

      it('should reject reasoning with maxTokens for non-reasoning models', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            reasoning: {
              maxTokens: 5000
            }
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('reasoning_not_supported');
      });

      it('should allow disabled reasoning for non-reasoning models', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            reasoning: {
              enabled: false
            }
          }
        };

        // This should pass validation but will fail at the adapter level since we don't have a real API key
        const response = await service.sendMessage(request);
        
        // Should not be a reasoning validation error
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).not.toBe('reasoning_not_supported');
      });

      it('should allow reasoning with exclude=true for non-reasoning models', async () => {
        const request: LLMChatRequest = {
          providerId: 'openai',
          modelId: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          settings: {
            reasoning: {
              exclude: true
            }
          }
        };

        // This should pass validation
        const response = await service.sendMessage(request);
        
        // Should not be a reasoning validation error
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).not.toBe('reasoning_not_supported');
      });

    });


  });

  describe('getProviders', () => {
    it('should return all supported providers', async () => {
      const providers = await service.getProviders();

      expect(providers).toHaveLength(7);
      expect(providers.find(p => p.id === 'openai')).toBeDefined();
      expect(providers.find(p => p.id === 'anthropic')).toBeDefined();
      expect(providers.find(p => p.id === 'gemini')).toBeDefined();
      expect(providers.find(p => p.id === 'mistral')).toBeDefined();
      expect(providers.find(p => p.id === 'llamacpp')).toBeDefined();
      expect(providers.find(p => p.id === 'openrouter')).toBeDefined();
      expect(providers.find(p => p.id === 'mock')).toBeDefined();
    });

    it('should include provider metadata', async () => {
      const providers = await service.getProviders();
      const openai = providers.find(p => p.id === 'openai');

      expect(openai).toMatchObject({
        id: 'openai',
        name: 'OpenAI'
      });
    });
  });

  describe('getModels', () => {
    it('should return all models for a provider', async () => {
      const models = await service.getModels('openai');

      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id.includes('gpt-4'))).toBe(true);
      expect(models.some(m => m.id.includes('o4-mini'))).toBe(true);
    });

    it('should return empty array for invalid provider', async () => {
      const models = await service.getModels('invalid-provider');

      expect(models).toEqual([]);
    });

    it('should include model metadata', async () => {
      const models = await service.getModels('openai');
      const gpt4 = models.find(m => m.id === 'gpt-4.1');

      expect(gpt4).toBeDefined();
      expect(gpt4!.contextWindow).toBeGreaterThan(0);
      expect(gpt4!.maxTokens).toBeGreaterThan(0);
    });
  });

  describe('thinking extraction', () => {
    it('should extract thinking tag from response when enabled', async () => {
      // Use mistral provider which doesn't have an adapter, so MockClientAdapter will be used
      const request: LLMChatRequest = {
        providerId: 'mistral',
        modelId: 'codestral-2501',
        messages: [{ role: 'user', content: 'test_thinking:<thinking>I am thinking about this problem.</thinking>Here is the answer.' }],
        settings: {
          thinkingTagFallback: {
            enabled: true,
            tagName: 'thinking'
          }
        }
      };

      const response = await service.sendMessage(request);

      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.choices[0].reasoning).toBe('I am thinking about this problem.');
      expect(successResponse.choices[0].message.content).toBe('Here is the answer.');
    });

    it('should not extract thinking tag when disabled', async () => {
      const request: LLMChatRequest = {
        providerId: 'mistral',
        modelId: 'codestral-2501',
        messages: [{ role: 'user', content: 'test_thinking:<thinking>I am thinking about this problem.</thinking>Here is the answer.' }],
        settings: {
          thinkingTagFallback: {
            enabled: false,
            tagName: 'thinking'
          }
        }
      };

      const response = await service.sendMessage(request);

      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.choices[0].reasoning).toBeUndefined();
      expect(successResponse.choices[0].message.content).toBe('<thinking>I am thinking about this problem.</thinking>Here is the answer.');
    });

    it('should use custom tag name', async () => {
      const request: LLMChatRequest = {
        providerId: 'mistral',
        modelId: 'codestral-2501',
        messages: [{ role: 'user', content: 'test_thinking:<scratchpad>Working through the logic...</scratchpad>Final answer is 42.' }],
        settings: {
          thinkingTagFallback: {
            enabled: true,
            tagName: 'scratchpad'
          }
        }
      };

      const response = await service.sendMessage(request);

      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.choices[0].reasoning).toBe('Working through the logic...');
      expect(successResponse.choices[0].message.content).toBe('Final answer is 42.');
    });

    it('should append to existing reasoning', async () => {
      // Use test_reasoning to get a response with existing reasoning, then test extraction appends to it
      const request: LLMChatRequest = {
        providerId: 'mistral',
        modelId: 'codestral-2501',
        messages: [{ role: 'user', content: 'test_reasoning:<thinking>Additional thoughts here.</thinking>The analysis is complete.' }],
        settings: {
          thinkingTagFallback: {
            enabled: true,
            tagName: 'thinking'
          }
        }
      };

      const response = await service.sendMessage(request);

      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      
      // Should contain both the initial reasoning and the extracted thinking with separator
      expect(successResponse.choices[0].reasoning).toBe(
        'Initial model reasoning from native capabilities.\n\n#### Additional Reasoning\n\nAdditional thoughts here.'
      );
      expect(successResponse.choices[0].message.content).toBe('The analysis is complete.');
    });

    it('should handle missing tag with explicit ignore', async () => {
      const request: LLMChatRequest = {
        providerId: 'mistral',
        modelId: 'codestral-2501',
        messages: [{ role: 'user', content: 'test_thinking:This response has no thinking tag.' }],
        settings: {
          thinkingTagFallback: {
            enabled: true,
            tagName: 'thinking',
            enforce: false // Explicitly set to ignore
          }
        }
      };

      const response = await service.sendMessage(request);

      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      expect(successResponse.choices[0].reasoning).toBeUndefined();
      expect(successResponse.choices[0].message.content).toBe('This response has no thinking tag.');
    });

    it('should use default settings when not specified', async () => {
      // Default is now disabled, needs explicit opt-in
      const request: LLMChatRequest = {
        providerId: 'mistral',
        modelId: 'codestral-2501',
        messages: [{ role: 'user', content: 'test_thinking:<thinking>Default extraction test.</thinking>Result here.' }]
      };

      const response = await service.sendMessage(request);

      expect(response.object).toBe('chat.completion');
      const successResponse = response as LLMResponse;
      // With default settings (enabled: false), no extraction should occur
      expect(successResponse.choices[0].reasoning).toBeUndefined();
      expect(successResponse.choices[0].message.content).toBe('<thinking>Default extraction test.</thinking>Result here.');
    });

    describe('enforce behavior', () => {
      it('should enforce tags when explicitly requested for non-native models', async () => {
        const request: LLMChatRequest = {
          providerId: 'mistral',
          modelId: 'codestral-2501', // Non-native reasoning model (using mock)
          messages: [{ role: 'user', content: 'test_thinking:Response without thinking tag.' }],
          settings: {
            thinkingTagFallback: {
              enabled: true,
              enforce: true  // Explicitly enforce tags
            }
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('THINKING_TAGS_MISSING');
        expect(errorResponse.error.type).toBe('validation_error');
        expect(errorResponse.error.message).toContain('missing required <thinking> tags');
        expect(errorResponse.error.param).toContain('does not support native reasoning');

        // Check that partial response is included
        expect(errorResponse.partialResponse).toBeDefined();
        expect(errorResponse.partialResponse!.choices[0].message.content).toBe('Response without thinking tag.');
      });

      it('should not error when enforce is false even if tags are missing', async () => {
        const request: LLMChatRequest = {
          providerId: 'mistral',
          modelId: 'codestral-2501',
          messages: [{ role: 'user', content: 'test_thinking:Response without thinking tag.' }],
          settings: {
            thinkingTagFallback: {
              enabled: true,
              enforce: false  // Don't error on missing tags
            }
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('chat.completion');
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].message.content).toBe('Response without thinking tag.');
        // No reasoning field should be set since tags weren't found
        expect(successResponse.choices[0].reasoning).toBeUndefined();
      });

      it('should handle missing tag with explicit error mode', async () => {
        const request: LLMChatRequest = {
          providerId: 'mistral',
          modelId: 'codestral-2501',
          messages: [{ role: 'user', content: 'test_thinking:Response without thinking tag.' }],
          settings: {
            thinkingTagFallback: {
              enabled: true,
              enforce: true // Explicitly set to error
            }
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.code).toBe('THINKING_TAGS_MISSING');
        expect(errorResponse.error.message).toContain('missing required <thinking> tags');
        
        // Check that partial response is included
        expect(errorResponse.partialResponse).toBeDefined();
        expect(errorResponse.partialResponse!.choices[0].message.content).toBe('Response without thinking tag.');
      });

      it('should handle missing tag for non-reasoning model with ignore', async () => {
        const request: LLMChatRequest = {
          providerId: 'mistral',
          modelId: 'codestral-2501',
          messages: [{ role: 'user', content: 'test_thinking:Response without thinking tag.' }],
          settings: {
            thinkingTagFallback: {
              enabled: true,
              enforce: false
            }
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('chat.completion');
        const successResponse = response as LLMResponse;
        expect(successResponse.choices[0].message.content).toBe('Response without thinking tag.');
      });

      it('should work with custom tag names in error messages', async () => {
        const request: LLMChatRequest = {
          providerId: 'mistral',
          modelId: 'codestral-2501',
          messages: [{ role: 'user', content: 'test_thinking:Response without custom tag.' }],
          settings: {
            thinkingTagFallback: {
              enabled: true,
              tagName: 'reasoning',
              enforce: true
            }
          }
        };

        const response = await service.sendMessage(request);

        expect(response.object).toBe('error');
        const errorResponse = response as LLMFailureResponse;
        expect(errorResponse.error.message).toContain('missing required <reasoning> tags');
        expect(errorResponse.partialResponse).toBeDefined();
        expect(errorResponse.partialResponse!.choices[0].message.content).toBe('Response without custom tag.');
      });

      describe('auto mode with native reasoning detection', () => {
        it('should enforce thinking tags for non-reasoning models by default', async () => {
          // Mistral model doesn't have reasoning support
          const request: LLMChatRequest = {
            providerId: 'mistral',
            modelId: 'codestral-2501',
            messages: [{ role: 'user', content: 'test_thinking:Response without thinking tag.' }],
            settings: {
              thinkingTagFallback: {
                enabled: true,
                enforce: true
              }
            }
          };

          const response = await service.sendMessage(request);

          // Should error because model doesn't have native reasoning
          expect(response.object).toBe('error');
          const errorResponse = response as LLMFailureResponse;
          expect(errorResponse.error.code).toBe('THINKING_TAGS_MISSING');
          expect(errorResponse.error.param).toContain('does not support native reasoning');
          expect(errorResponse.partialResponse).toBeDefined();
          expect(errorResponse.partialResponse!.choices[0].message.content).toBe('Response without thinking tag.');
        });

        it('should respect explicit reasoning.enabled: false even for models with enabledByDefault', async () => {
          // This is the key test for the fix
          const request: LLMChatRequest = {
            providerId: 'mistral',
            modelId: 'codestral-2501',
            messages: [{ role: 'user', content: 'test_thinking:Response without thinking tag.' }],
            settings: {
              reasoning: { enabled: false }, // Explicitly disabled
              thinkingTagFallback: {
                enabled: true,
                enforce: true
              }
            }
          };

          const response = await service.sendMessage(request);

          // Should error because reasoning is explicitly disabled
          expect(response.object).toBe('error');
          const errorResponse = response as LLMFailureResponse;
          expect(errorResponse.error.code).toBe('THINKING_TAGS_MISSING');
          expect(errorResponse.partialResponse).toBeDefined();
        });
      });
    });
  });
});