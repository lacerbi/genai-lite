// AI Summary: Client adapter for llama.cpp server using OpenAI-compatible API.
// Provides LLM chat completions via llama.cpp's /v1/chat/completions endpoint.

import OpenAI from "openai";
import type { LLMResponse, LLMFailureResponse, ModelInfo } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
  AdapterRequestOptions,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "../../shared/adapters/errorUtils";
import {
  collectSystemContent,
  prependSystemToFirstUserMessage,
} from "../../shared/adapters/systemMessageUtils";
import { LlamaCppServerClient } from "./LlamaCppServerClient";
import { detectGgufCapabilities } from "../config";
import { extractMarkerDelimitedContent } from "../../prompting/parser";
import { mapOpenAIChatLogprobs } from "../../shared/adapters/logprobsUtils";
import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";

/**
 * Configuration options for LlamaCppClientAdapter
 */
export interface LlamaCppClientConfig {
  /** Base URL of the llama.cpp server (default: http://127.0.0.1:8080) */
  baseURL?: string;
  /** Whether to check server health before sending requests (default: false) */
  checkHealth?: boolean;
  /** Logger instance for adapter logging */
  logger?: Logger;
}

/**
 * Client adapter for llama.cpp server integration
 *
 * This adapter provides integration with llama.cpp server via its OpenAI-compatible
 * /v1/chat/completions endpoint. It uses the OpenAI SDK internally, making it compatible
 * with llama.cpp's OpenAI-compatible API.
 *
 * Key features:
 * - Uses llama.cpp's OpenAI-compatible chat completions endpoint
 * - Optional health check before requests
 * - No API key required (llama.cpp is a local server)
 * - Supports all standard LLM settings
 *
 * Note: Model IDs are not validated against a predefined list since llama.cpp
 * serves whatever model is loaded. Users must specify the correct model name.
 *
 * @example
 * ```typescript
 * // Create adapter for local server
 * const adapter = new LlamaCppClientAdapter({
 *   baseURL: 'http://127.0.0.1:8080',
 *   checkHealth: true
 * });
 *
 * // Register with LLMService
 * service.registerAdapter('llamacpp', adapter);
 *
 * // Use via LLMService
 * const response = await service.sendMessage({
 *   providerId: 'llamacpp',
 *   modelId: 'llamacpp',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export class LlamaCppClientAdapter implements ILLMClientAdapter {
  private baseURL: string;
  private checkHealth: boolean;
  private serverClient: LlamaCppServerClient;
  private cachedModelCapabilities: Partial<ModelInfo> | null = null;
  private detectionAttempted: boolean = false;
  private logger: Logger;

  /**
   * Creates a new llama.cpp client adapter
   *
   * @param config Optional configuration for the adapter
   */
  constructor(config?: LlamaCppClientConfig) {
    // 127.0.0.1 rather than localhost: on Windows, localhost resolves to IPv6 (::1)
    // first, and when llama-server listens on IPv4 only, every fresh connection waits
    // ~2s for the IPv6 attempt to time out (~9x per-request slowdown measured).
    this.baseURL = config?.baseURL || 'http://127.0.0.1:8080';
    this.checkHealth = config?.checkHealth || false;
    this.serverClient = new LlamaCppServerClient(this.baseURL);
    this.logger = config?.logger ?? createDefaultLogger();
  }

  /**
   * Gets model capabilities by detecting the loaded GGUF model
   *
   * This method caches the result to avoid repeated HTTP calls.
   * Cache is automatically cleared on connection errors in sendMessage().
   *
   * @returns Detected model capabilities or null if detection fails
   */
  async getModelCapabilities(): Promise<Partial<ModelInfo> | null> {
    // Return cached result if available
    if (this.cachedModelCapabilities !== null) {
      return this.cachedModelCapabilities;
    }

    // Return null if we already tried and failed
    if (this.detectionAttempted) {
      return null;
    }

    // Attempt detection
    try {
      this.logger.debug(`Detecting model capabilities from llama.cpp server at ${this.baseURL}`);
      const { data } = await this.serverClient.getModels();

      if (!data || data.length === 0) {
        this.logger.warn('No models loaded in llama.cpp server');
        this.detectionAttempted = true;
        return null;
      }

      const ggufFilename = data[0].id;
      const capabilities = detectGgufCapabilities(ggufFilename);

      // Cache the result (even if null)
      this.cachedModelCapabilities = capabilities;
      this.detectionAttempted = true;

      if (capabilities) {
        this.logger.debug(`Cached model capabilities for: ${ggufFilename}`);
      } else {
        this.logger.debug(`No known pattern matched for: ${ggufFilename}`);
      }

      return capabilities;
    } catch (error) {
      this.logger.warn('Failed to detect model capabilities:', error);
      this.detectionAttempted = true;
      return null;
    }
  }

  /**
   * Clears the cached model capabilities
   *
   * Called automatically on connection errors, or can be called manually
   * if the server has been restarted with a different model.
   */
  clearModelCache(): void {
    this.cachedModelCapabilities = null;
    this.detectionAttempted = false;
    this.logger.debug('Cleared model capabilities cache');
  }

  /**
   * Sends a chat message to llama.cpp server
   *
   * @param request - The internal LLM request with applied settings
   * @param apiKey - Not used for llama.cpp (local server), but kept for interface compatibility
   * @returns Promise resolving to success or failure response
   */
  async sendMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    try {
      // Optional health check before making request
      if (this.checkHealth) {
        try {
          const health = await this.serverClient.getHealth();
          if (health.status !== 'ok') {
            return {
              provider: request.providerId,
              model: request.modelId,
              error: {
                message: `llama.cpp server not ready: ${health.status}${health.error ? ' - ' + health.error : ''}`,
                code: ADAPTER_ERROR_CODES.PROVIDER_ERROR,
                type: 'server_not_ready',
              },
              object: 'error',
            };
          }
        } catch (healthError) {
          this.logger.warn('Health check failed, proceeding with request anyway:', healthError);
        }
      }

      // Initialize OpenAI client with llama.cpp base URL
      // API key is not used by llama.cpp but required by SDK
      const openai = new OpenAI({
        apiKey: apiKey || 'not-needed',
        baseURL: `${this.baseURL}/v1`,
        maxRetries: 0, // retries are owned by the unified LLMService retry layer
      });

      // Format messages for OpenAI-compatible API
      const messages = this.formatMessages(request);

      // Prepare API call parameters
      const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: request.modelId,
        messages: messages,
        temperature: request.settings.temperature,
        max_tokens: request.settings.maxTokens,
        top_p: request.settings.topP,
        ...(request.settings.stopSequences.length > 0 && {
          stop: request.settings.stopSequences,
        }),
        ...(request.settings.frequencyPenalty !== 0 && {
          frequency_penalty: request.settings.frequencyPenalty,
        }),
        ...(request.settings.presencePenalty !== 0 && {
          presence_penalty: request.settings.presencePenalty,
        }),
        ...(request.settings.seed !== undefined && {
          seed: request.settings.seed,
        }),
        // llama.cpp-native sampling params (not in the OpenAI SDK types, but the
        // SDK sends extra body fields as-is and llama-server reads them top-level)
        ...(request.settings.topK !== undefined && {
          top_k: request.settings.topK,
        }),
        ...(request.settings.minP !== undefined && {
          min_p: request.settings.minP,
        }),
        ...(request.settings.repeatPenalty !== undefined && {
          repeat_penalty: request.settings.repeatPenalty,
        }),
      } as OpenAI.Chat.Completions.ChatCompletionCreateParams;

      // Handle structured output configuration for llama.cpp
      // llama.cpp uses response_format with type: 'json_object' and optional schema
      if (request.settings.structuredOutput?.schema && request.settings.structuredOutput.enabled !== false) {
        const so = request.settings.structuredOutput;
        (completionParams as any).response_format = {
          type: 'json_object',
          schema: so.schema,
        };
      }

      // Reasoning toggle for detected hybrid GGUF models (Qwen 3.x, Gemma 4, ...).
      // The chat template's thinking flag is sent explicitly — false unless reasoning
      // was requested — so hybrid models don't silently burn thinking tokens.
      // Requires llama-server running with --jinja; servers without it ignore the kwarg.
      const detectedCaps = await this.getModelCapabilities();
      const localReasoning = detectedCaps?.localReasoning;
      const derivedKwargs: Record<string, string | number | boolean> = {};
      if (localReasoning?.toggleKwarg) {
        derivedKwargs[localReasoning.toggleKwarg] =
          request.settings.reasoning?.enabled === true;
      }
      // User-supplied chat-template kwargs (escape hatch) win over derived ones
      const chatTemplateKwargs = {
        ...derivedKwargs,
        ...(request.settings.llamacpp?.chatTemplateKwargs || {}),
      };
      if (Object.keys(chatTemplateKwargs).length > 0) {
        // llama-server rejects assistant prefill together with enable_thinking=true
        // (HTTP 400: "Assistant response prefill is incompatible with enable_thinking.")
        // Fail fast with a clear message instead of surfacing the raw server error.
        const thinkingKwarg = localReasoning?.toggleKwarg ?? 'enable_thinking';
        const effectiveThinking = chatTemplateKwargs[thinkingKwarg] === true;
        const lastMessage = messages[messages.length - 1];
        if (effectiveThinking && lastMessage?.role === 'assistant') {
          return {
            provider: request.providerId,
            model: request.modelId,
            error: {
              message:
                'llama.cpp does not support assistant prefill (a trailing assistant message) ' +
                'while thinking is enabled. Remove the trailing assistant message or disable reasoning.',
              code: ADAPTER_ERROR_CODES.PROVIDER_ERROR,
              type: 'invalid_request_error',
            },
            object: 'error',
          };
        }

        (completionParams as any).chat_template_kwargs = chatTemplateKwargs;
      }

      // GBNF grammar for constrained decoding (validated as mutually exclusive
      // with structuredOutput upstream)
      if (request.settings.llamacpp?.grammar) {
        (completionParams as any).grammar = request.settings.llamacpp.grammar;
      }

      // Per-token log probabilities (OpenAI-compatible request/response shape)
      if (request.settings.logprobs === true) {
        (completionParams as any).logprobs = true;
        if (request.settings.topLogprobs !== undefined) {
          (completionParams as any).top_logprobs = request.settings.topLogprobs;
        }
      }

      this.logger.debug(`llama.cpp API parameters:`, {
        baseURL: this.baseURL,
        model: completionParams.model,
        temperature: completionParams.temperature,
        max_tokens: completionParams.max_tokens,
        top_p: completionParams.top_p,
      });

      this.logger.info(`Making llama.cpp API call for model: ${request.modelId}`);

      // Make the API call
      const transportOptions = {
        ...(options?.signal && { signal: options.signal }),
        ...(options?.timeoutMs !== undefined && { timeout: options.timeoutMs }),
      };
      const completion =
        Object.keys(transportOptions).length > 0
          ? await openai.chat.completions.create(completionParams, transportOptions)
          : await openai.chat.completions.create(completionParams);

      // Type guard to ensure we have a non-streaming response
      if ('id' in completion && 'choices' in completion) {
        this.logger.info(`llama.cpp API call successful, response ID: ${completion.id}`);
        return this.createSuccessResponse(
          completion as OpenAI.Chat.Completions.ChatCompletion,
          request,
          detectedCaps
        );
      } else {
        throw new Error('Unexpected streaming response from llama.cpp server');
      }
    } catch (error) {
      this.logger.error("llama.cpp API error:", error);

      // Clear cache on connection errors so we re-detect on next request
      const errorMessage = (error as any)?.message || String(error);
      if (
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("connect")
      ) {
        this.clearModelCache();
      }

      return this.createErrorResponse(error, request);
    }
  }

  /**
   * Validates API key format
   *
   * For llama.cpp, API keys are not required, so this always returns true.
   * The method is implemented for interface compatibility.
   *
   * @param apiKey - The API key (ignored)
   * @returns Always true
   */
  validateApiKey(apiKey: string): boolean {
    // llama.cpp doesn't require API keys, accept any value
    return true;
  }

  /**
   * Gets adapter information
   */
  getAdapterInfo() {
    return {
      providerId: "llamacpp" as const,
      name: "llama.cpp Client Adapter",
      version: "1.0.0",
      baseURL: this.baseURL,
    };
  }

  /**
   * Gets the underlying server client for advanced operations
   *
   * This allows access to non-LLM endpoints like tokenize, embedding, health, etc.
   *
   * @returns The LlamaCppServerClient instance
   */
  getServerClient(): LlamaCppServerClient {
    return this.serverClient;
  }

  /**
   * Formats messages for OpenAI-compatible API
   *
   * @param request - The internal LLM request
   * @returns Formatted messages array
   */
  private formatMessages(
    request: InternalLLMChatRequest
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    const inlineSystemMessages: string[] = [];

    // Check if model supports system messages
    const supportsSystem = request.settings.supportsSystemMessage !== false;

    // Add conversation messages (collecting system messages separately)
    for (const message of request.messages) {
      if (message.role === "system") {
        // Collect inline system messages
        inlineSystemMessages.push(message.content);
      } else if (message.role === "user") {
        messages.push({
          role: "user",
          content: message.content,
        });
      } else if (message.role === "assistant") {
        messages.push({
          role: "assistant",
          content: message.content,
        });
      }
    }

    // Use shared utility to collect and combine system content
    const { combinedSystemContent, useNativeSystemMessage } = collectSystemContent(
      request.systemMessage,
      inlineSystemMessages,
      supportsSystem
    );

    if (combinedSystemContent) {
      if (useNativeSystemMessage) {
        // Model supports system messages - add as system role at the start
        messages.unshift({
          role: "system",
          content: combinedSystemContent,
        });
      } else {
        // Model doesn't support system messages - prepend to first user message
        const simpleMessages = messages.map((m) => ({
          role: m.role,
          content: m.content as string,
        }));
        const modifiedIndex = prependSystemToFirstUserMessage(
          simpleMessages,
          combinedSystemContent,
          request.settings.systemMessageFallback
        );
        if (modifiedIndex !== -1) {
          messages[modifiedIndex].content = simpleMessages[modifiedIndex].content;
          this.logger.debug(
            `Model ${request.modelId} doesn't support system messages - prepended to first user message`
          );
        }
      }
    }

    return messages;
  }

  /**
   * Creates a standardized success response from llama.cpp's response
   *
   * @param completion - Raw OpenAI-compatible completion response
   * @param request - Original request for context
   * @returns Standardized LLM response
   */
  private createSuccessResponse(
    completion: OpenAI.Chat.Completions.ChatCompletion,
    request: InternalLLMChatRequest,
    detectedCaps?: Partial<ModelInfo> | null
  ): LLMResponse {
    const choice = completion.choices[0];

    if (!choice || !choice.message) {
      throw new Error("No valid choices in llama.cpp completion response");
    }

    const local = detectedCaps?.localReasoning;

    // Whether thinking is active for this request: explicitly requested, or the
    // detected model reasons unconditionally (always-on models like GPT-OSS,
    // Thinking-2507 checkpoints, DeepSeek R1).
    const reasoningActive =
      request.settings.reasoning?.enabled === true ||
      detectedCaps?.reasoning?.enabledByDefault === true ||
      detectedCaps?.reasoning?.canDisable === false;
    const excludeReasoning = request.settings.reasoning?.exclude === true;

    return {
      id: completion.id,
      provider: request.providerId,
      model: completion.model || request.modelId,
      created: completion.created,
      choices: completion.choices.map((c) => {
        let content = c.message.content || "";

        // Strip the template-injected "nothink" prefix (some chat templates leak an
        // empty think block into content when thinking is disabled). Exact match.
        if (local?.nothinkPrefix && content.startsWith(local.nothinkPrefix)) {
          content = content.slice(local.nothinkPrefix.length);
        }

        const mappedChoice: any = {
          message: {
            role: "assistant",
            content,
          },
          finish_reason: c.finish_reason,
          index: c.index,
        };

        // Two-tier reasoning extraction:
        // 1. Prefer the server-separated reasoning_content field (populated when
        //    llama-server's --reasoning-format handling recognizes the template).
        // 2. Fall back to marker extraction from content — reasoning_content
        //    population is model/template-dependent, not guaranteed.
        const messageReasoning = (c.message as any).reasoning_content;
        if (messageReasoning && request.settings.reasoning && !excludeReasoning) {
          mappedChoice.reasoning = messageReasoning;
        } else if (!messageReasoning && reasoningActive && local?.markers) {
          const { content: cleaned, extracted } = extractMarkerDelimitedContent(
            content,
            local.markers[0],
            local.markers[1]
          );
          if (extracted) {
            mappedChoice.message.content = cleaned;
            if (!excludeReasoning) {
              mappedChoice.reasoning = extracted;
            }
          }
        }

        // Per-token log probabilities (OpenAI-compatible shape)
        const logprobs = mapOpenAIChatLogprobs((c as any).logprobs);
        if (logprobs) {
          mappedChoice.logprobs = logprobs;
        }

        return mappedChoice;
      }),
      usage: completion.usage
        ? {
            prompt_tokens: completion.usage.prompt_tokens,
            completion_tokens: completion.usage.completion_tokens,
            total_tokens: completion.usage.total_tokens,
          }
        : undefined,
      object: "chat.completion",
    };
  }

  /**
   * Creates a standardized error response from an error
   *
   * @param error - The error that occurred
   * @param request - Original request for context
   * @returns Standardized LLM failure response
   */
  private createErrorResponse(error: any, request: InternalLLMChatRequest): LLMFailureResponse {
    const errorMessage = error?.message || String(error);
    let errorCode, errorType, status;

    // Check for connection errors (server not running)
    if (
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("fetch failed") ||
      errorMessage.includes("connect")
    ) {
      errorCode = ADAPTER_ERROR_CODES.NETWORK_ERROR;
      errorType = "connection_error";
      return {
        provider: request.providerId,
        model: request.modelId,
        error: {
          message: `Cannot connect to llama.cpp server at ${this.baseURL}. Is the server running?`,
          code: errorCode,
          type: errorType,
          providerError: error,
        },
        object: "error",
      };
    }

    // Use common error mapping for other errors
    const mappedError = getCommonMappedErrorDetails(error);

    return {
      provider: request.providerId,
      model: request.modelId,
      error: {
        message: mappedError.errorMessage,
        code: mappedError.errorCode,
        type: mappedError.errorType,
        ...(mappedError.status && { status: mappedError.status }),
        ...(mappedError.retryAfterMs !== undefined && { retryAfterMs: mappedError.retryAfterMs }),
        providerError: error,
      },
      object: "error",
    };
  }
}
