// AI Summary: Client adapter for OpenRouter API gateway using OpenAI-compatible API.
// Provides unified access to 100+ LLM models from various providers through a single API.

import OpenAI from "openai";
import type { LLMResponse, LLMFailureResponse } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "../../shared/adapters/errorUtils";
import {
  collectSystemContent,
  prependSystemToFirstUserMessage,
} from "../../shared/adapters/systemMessageUtils";
import { createDefaultLogger } from "../../logging/defaultLogger";

const logger = createDefaultLogger();

/**
 * Configuration options for OpenRouterClientAdapter
 */
export interface OpenRouterClientConfig {
  /** Base URL of the OpenRouter API (default: https://openrouter.ai/api/v1) */
  baseURL?: string;
  /** Your app's URL for rankings attribution (optional) */
  httpReferer?: string;
  /** Your app's display name for rankings (optional) */
  siteTitle?: string;
}

/**
 * Client adapter for OpenRouter API integration
 *
 * OpenRouter is an API gateway that provides unified access to 100+ LLM models
 * from various providers (OpenAI, Anthropic, Google, Meta, Mistral, etc.)
 * through an OpenAI-compatible API.
 *
 * Key features:
 * - Uses OpenAI-compatible API format
 * - Single API key for all models
 * - Model IDs use provider/model format (e.g., "openai/gpt-4", "anthropic/claude-3-opus")
 * - Optional provider routing for controlling which underlying providers serve requests
 * - App attribution via HTTP-Referer and X-Title headers
 *
 * @example
 * ```typescript
 * // Create adapter
 * const adapter = new OpenRouterClientAdapter({
 *   httpReferer: 'https://myapp.com',
 *   siteTitle: 'My App'
 * });
 *
 * // Use via LLMService
 * const response = await service.sendMessage({
 *   providerId: 'openrouter',
 *   modelId: 'google/gemma-3-27b-it:free',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export class OpenRouterClientAdapter implements ILLMClientAdapter {
  private baseURL: string;
  private httpReferer?: string;
  private siteTitle?: string;

  /**
   * Creates a new OpenRouter client adapter
   *
   * @param config Optional configuration for the adapter
   */
  constructor(config?: OpenRouterClientConfig) {
    this.baseURL = config?.baseURL || 'https://openrouter.ai/api/v1';
    this.httpReferer = config?.httpReferer || process.env.OPENROUTER_HTTP_REFERER;
    this.siteTitle = config?.siteTitle || process.env.OPENROUTER_SITE_TITLE;
  }

  /**
   * Sends a chat message to OpenRouter API
   *
   * @param request - The internal LLM request with applied settings
   * @param apiKey - The OpenRouter API key
   * @returns Promise resolving to success or failure response
   */
  async sendMessage(
    request: InternalLLMChatRequest,
    apiKey: string
  ): Promise<LLMResponse | LLMFailureResponse> {
    try {
      // Initialize OpenAI client with OpenRouter base URL and custom headers
      const openai = new OpenAI({
        apiKey,
        baseURL: this.baseURL,
        defaultHeaders: {
          ...(this.httpReferer && { 'HTTP-Referer': this.httpReferer }),
          ...(this.siteTitle && { 'X-Title': this.siteTitle }),
        },
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

      // Add OpenRouter-specific provider routing if configured
      const providerSettings = request.settings.openRouterProvider;
      if (providerSettings) {
        const provider: Record<string, any> = {};

        if (providerSettings.order) {
          provider.order = providerSettings.order;
        }
        if (providerSettings.ignore) {
          provider.ignore = providerSettings.ignore;
        }
        if (providerSettings.allow) {
          provider.allow = providerSettings.allow;
        }
        if (providerSettings.dataCollection) {
          provider.data_collection = providerSettings.dataCollection;
        }
        if (providerSettings.requireParameters !== undefined) {
          provider.require_parameters = providerSettings.requireParameters;
        }

        if (Object.keys(provider).length > 0) {
          (completionParams as any).provider = provider;
        }
      }

      logger.debug(`OpenRouter API parameters:`, {
        baseURL: this.baseURL,
        model: completionParams.model,
        temperature: completionParams.temperature,
        max_tokens: completionParams.max_tokens,
        top_p: completionParams.top_p,
        hasProviderRouting: !!(completionParams as any).provider,
      });

      logger.info(`Making OpenRouter API call for model: ${request.modelId}`);

      // Make the API call
      const completion = await openai.chat.completions.create(completionParams);

      // Type guard to ensure we have a non-streaming response
      if ('id' in completion && 'choices' in completion) {
        logger.info(`OpenRouter API call successful, response ID: ${completion.id}`);
        return this.createSuccessResponse(completion as OpenAI.Chat.Completions.ChatCompletion, request);
      } else {
        throw new Error('Unexpected streaming response from OpenRouter');
      }
    } catch (error) {
      logger.error("OpenRouter API error:", error);
      return this.createErrorResponse(error, request);
    }
  }

  /**
   * Validates OpenRouter API key format
   *
   * OpenRouter API keys typically start with 'sk-or-' and have significant length.
   *
   * @param apiKey - The API key to validate
   * @returns True if the key format appears valid
   */
  validateApiKey(apiKey: string): boolean {
    // OpenRouter keys start with 'sk-or-' (may include version like 'sk-or-v1-')
    return apiKey.startsWith('sk-or-') && apiKey.length >= 40;
  }

  /**
   * Gets adapter information
   */
  getAdapterInfo() {
    return {
      providerId: "openrouter" as const,
      name: "OpenRouter Client Adapter",
      version: "1.0.0",
      baseURL: this.baseURL,
    };
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

    // Check if model supports system messages (default true for most OpenRouter models)
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
          logger.debug(
            `Model ${request.modelId} doesn't support system messages - prepended to first user message`
          );
        }
      }
    }

    return messages;
  }

  /**
   * Creates a standardized success response from OpenRouter's response
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
      throw new Error("No valid choices in OpenRouter completion response");
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
  private createErrorResponse(
    error: any,
    request: InternalLLMChatRequest
  ): LLMFailureResponse {
    // Use common error mapping
    const mappedError = getCommonMappedErrorDetails(error);

    // OpenRouter-specific error refinements
    if (mappedError.status === 400) {
      const errorMessage = (error?.message || '').toLowerCase();
      if (errorMessage.includes('model') && (errorMessage.includes('not available') || errorMessage.includes('not found'))) {
        mappedError.errorCode = ADAPTER_ERROR_CODES.MODEL_NOT_FOUND;
      }
    }

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
