// AI Summary: Client adapter for llama.cpp server using OpenAI-compatible API.
// Provides LLM chat completions via llama.cpp's /v1/chat/completions endpoint.

import OpenAI from "openai";
import type { LLMResponse, LLMFailureResponse } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "./adapterErrorUtils";
import { LlamaCppServerClient } from "./LlamaCppServerClient";

/**
 * Configuration options for LlamaCppClientAdapter
 */
export interface LlamaCppClientConfig {
  /** Base URL of the llama.cpp server (default: http://localhost:8080) */
  baseURL?: string;
  /** Whether to check server health before sending requests (default: false) */
  checkHealth?: boolean;
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
 *   baseURL: 'http://localhost:8080',
 *   checkHealth: true
 * });
 *
 * // Register with LLMService
 * service.registerAdapter('llamacpp', adapter);
 *
 * // Use via LLMService
 * const response = await service.sendMessage({
 *   providerId: 'llamacpp',
 *   modelId: 'llama-3-8b-instruct',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export class LlamaCppClientAdapter implements ILLMClientAdapter {
  private baseURL: string;
  private checkHealth: boolean;
  private serverClient: LlamaCppServerClient;

  /**
   * Creates a new llama.cpp client adapter
   *
   * @param config Optional configuration for the adapter
   */
  constructor(config?: LlamaCppClientConfig) {
    this.baseURL = config?.baseURL || 'http://localhost:8080';
    this.checkHealth = config?.checkHealth || false;
    this.serverClient = new LlamaCppServerClient(this.baseURL);
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
    apiKey: string
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
          console.warn('Health check failed, proceeding with request anyway:', healthError);
        }
      }

      // Initialize OpenAI client with llama.cpp base URL
      // API key is not used by llama.cpp but required by SDK
      const openai = new OpenAI({
        apiKey: apiKey || 'not-needed',
        baseURL: `${this.baseURL}/v1`,
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
      };

      console.log(`llama.cpp API parameters:`, {
        baseURL: this.baseURL,
        model: completionParams.model,
        temperature: completionParams.temperature,
        max_tokens: completionParams.max_tokens,
        top_p: completionParams.top_p,
      });

      console.log(`Making llama.cpp API call for model: ${request.modelId}`);

      // Make the API call
      const completion = await openai.chat.completions.create(completionParams);

      // Type guard to ensure we have a non-streaming response
      if ('id' in completion && 'choices' in completion) {
        console.log(`llama.cpp API call successful, response ID: ${completion.id}`);
        return this.createSuccessResponse(completion as OpenAI.Chat.Completions.ChatCompletion, request);
      } else {
        throw new Error('Unexpected streaming response from llama.cpp server');
      }
    } catch (error) {
      console.error("llama.cpp API error:", error);
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

    // Add system message if provided
    if (request.systemMessage) {
      messages.push({
        role: "system",
        content: request.systemMessage,
      });
    }

    // Add conversation messages
    for (const message of request.messages) {
      if (message.role === "system") {
        messages.push({
          role: "system",
          content: message.content,
        });
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
    request: InternalLLMChatRequest
  ): LLMResponse {
    const choice = completion.choices[0];

    if (!choice || !choice.message) {
      throw new Error("No valid choices in llama.cpp completion response");
    }

    return {
      id: completion.id,
      provider: request.providerId,
      model: completion.model || request.modelId,
      created: completion.created,
      choices: completion.choices.map((c) => ({
        message: {
          role: "assistant",
          content: c.message.content || "",
        },
        finish_reason: c.finish_reason,
        index: c.index,
      })),
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
        providerError: error,
      },
      object: "error",
    };
  }
}
