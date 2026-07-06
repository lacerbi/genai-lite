// AI Summary: Client adapter for Mistral AI API using the official Mistral SDK.
// Provides access to Mistral models including Codestral and Mistral Large.

import { Mistral } from "@mistralai/mistralai";
import type { LLMResponse, LLMFailureResponse, LLMStreamEvent } from "../types";
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
import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";

interface MistralPreparedRequest {
  mistral: Mistral;
  requestOptions: any;
}

interface MistralStreamChoiceState {
  content: string;
  reasoning: string;
  finishReason: string | null;
}

/**
 * Configuration options for MistralClientAdapter
 */
export interface MistralClientConfig {
  /** Base URL of the Mistral API (default: https://api.mistral.ai) */
  baseURL?: string;
  /** Logger instance for adapter logging */
  logger?: Logger;
}

/**
 * Client adapter for Mistral AI API integration
 *
 * Mistral AI provides powerful language models including:
 * - mistral-small-latest: Cost-effective model for general tasks
 * - mistral-large-2512: Frontier model with 256K context
 * - codestral-2501: Specialized for code generation
 *
 * Key features:
 * - Uses official @mistralai/mistralai SDK
 * - Supports standard chat parameters (temperature, max_tokens, top_p, stop)
 * - Does NOT support frequency_penalty or presence_penalty
 *
 * @example
 * ```typescript
 * // Create adapter
 * const adapter = new MistralClientAdapter();
 *
 * // Use via LLMService
 * const response = await service.sendMessage({
 *   providerId: 'mistral',
 *   modelId: 'mistral-small-latest',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export class MistralClientAdapter implements ILLMClientAdapter {
  private baseURL: string;
  private logger: Logger;

  /**
   * Creates a new Mistral client adapter
   *
   * @param config Optional configuration for the adapter
   */
  constructor(config?: MistralClientConfig) {
    this.baseURL = config?.baseURL || process.env.MISTRAL_API_BASE_URL || 'https://api.mistral.ai';
    this.logger = config?.logger ?? createDefaultLogger();
  }

  /**
   * Sends a chat message to Mistral API
   *
   * @param request - The internal LLM request with applied settings
   * @param apiKey - The Mistral API key
   * @returns Promise resolving to success or failure response
   */
  async sendMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    try {
      // Initialize Mistral client (Speakeasy SDK retry default is "none" — retries
      // are owned by the unified LLMService retry layer)
      const { mistral, requestOptions } = this.prepareCompletionRequest(request, apiKey);

      this.logger.debug(`Mistral API parameters:`, {
        baseURL: this.baseURL,
        model: request.modelId,
        temperature: request.settings.temperature,
        max_tokens: request.settings.maxTokens,
        top_p: request.settings.topP,
      });

      this.logger.info(`Making Mistral API call for model: ${request.modelId}`);

      // Make the API call (per-request transport options: timeout + abort signal).
      // The SDK ignores timeoutMs whenever a signal is supplied, so when both are
      // set they must be composed into one signal. AbortSignal.timeout carries a
      // TimeoutError reason, which the SDK maps to RequestTimeoutError (vs a
      // caller abort's AbortError -> RequestAbortedError), so classification in
      // errorUtils keeps working.
      const transportOptions = this.createTransportOptions(options);
      const completion =
        Object.keys(transportOptions).length > 0
          ? await mistral.chat.complete(requestOptions, transportOptions as any)
          : await mistral.chat.complete(requestOptions);

      if (completion && completion.choices && completion.choices.length > 0) {
        this.logger.info(`Mistral API call successful, response ID: ${completion.id}`);
        return this.createSuccessResponse(completion, request);
      } else {
        throw new Error('No valid choices in Mistral completion response');
      }
    } catch (error) {
      this.logger.error("Mistral API error:", error);
      return this.createErrorResponse(error, request);
    }
  }

  async *streamMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<LLMStreamEvent> {
    const choiceStates = new Map<number, MistralStreamChoiceState>();
    let responseId = "";
    let responseModel = request.modelId;
    let created = Math.floor(Date.now() / 1000);
    let usage: any | undefined;

    try {
      const { mistral, requestOptions } = this.prepareCompletionRequest(request, apiKey);
      const streamRequestOptions = {
        ...requestOptions,
        stream: true,
      };

      this.logger.info(`Making Mistral streaming API call for model: ${request.modelId}`);
      const transportOptions = this.createTransportOptions(options);
      const stream =
        Object.keys(transportOptions).length > 0
          ? await mistral.chat.stream(streamRequestOptions, transportOptions as any)
          : await mistral.chat.stream(streamRequestOptions);

      let started = false;
      for await (const event of stream as AsyncIterable<any>) {
        const chunk = event?.data ?? event;
        responseId = chunk?.id || responseId;
        responseModel = chunk?.model || responseModel;
        created = chunk?.created || created;

        if (!started) {
          started = true;
          yield {
            type: "start",
            provider: request.providerId,
            model: responseModel,
            id: responseId,
            created,
          };
        }

        if (chunk?.usage) {
          usage = chunk.usage;
          yield {
            type: "usage",
            usage: this.mapMistralUsage(chunk.usage),
          };
        }

        for (const choice of chunk?.choices || []) {
          const index = choice.index ?? 0;
          const state = this.getStreamChoiceState(choiceStates, index);
          state.finishReason = choice.finishReason || choice.finish_reason || state.finishReason;

          const deltas = this.extractMistralContentDeltas(choice.delta?.content);
          for (const reasoningDelta of deltas.reasoning) {
            state.reasoning += reasoningDelta;
            if (request.settings.reasoning?.exclude !== true) {
              yield {
                type: "reasoning_delta",
                delta: reasoningDelta,
                index,
              };
            }
          }

          for (const contentDelta of deltas.content) {
            state.content += contentDelta;
            yield {
              type: "content_delta",
              delta: contentDelta,
              index,
            };
          }
        }
      }

      const response = this.createSuccessResponse(
        this.createSyntheticCompletion(request, responseId, responseModel, created, choiceStates, usage),
        request
      );

      yield { type: "complete", response };
    } catch (error) {
      this.logger.error("Mistral streaming API error:", error);
      const errorResponse = this.createErrorResponse(error, request);
      if (choiceStates.size > 0) {
        const partial = this.createSuccessResponse(
          this.createSyntheticCompletion(request, responseId, responseModel, created, choiceStates, usage),
          request
        );
        errorResponse.partialResponse = {
          id: partial.id,
          provider: partial.provider,
          model: partial.model,
          created: partial.created,
          choices: partial.choices,
          usage: partial.usage,
        };
      }

      yield { type: "error", error: errorResponse };
    }
  }

  /**
   * Validates Mistral API key format
   *
   * Mistral API keys don't have a standard prefix, so we just check
   * that the key has reasonable length and character set.
   *
   * @param apiKey - The API key to validate
   * @returns True if the key format appears valid
   */
  validateApiKey(apiKey: string): boolean {
    // Mistral keys are typically 32+ characters, alphanumeric
    return apiKey.length >= 32 && /^[a-zA-Z0-9]+$/.test(apiKey);
  }

  /**
   * Gets adapter information
   */
  getAdapterInfo() {
    return {
      providerId: "mistral" as const,
      name: "Mistral Client Adapter",
      version: "1.0.0",
      baseURL: this.baseURL,
    };
  }

  private prepareCompletionRequest(
    request: InternalLLMChatRequest,
    apiKey: string
  ): MistralPreparedRequest {
    // Initialize Mistral client (Speakeasy SDK retry default is "none" - retries
    // are owned by the unified LLMService retry layer)
    const mistral = new Mistral({
      apiKey,
      serverURL: this.baseURL !== 'https://api.mistral.ai' ? this.baseURL : undefined,
    });

    // Format messages for Mistral API
    const messages = this.formatMessages(request);

    // Build request options
    const requestOptions: any = {
      model: request.modelId,
      messages: messages,
      temperature: request.settings.temperature,
      maxTokens: request.settings.maxTokens,
      topP: request.settings.topP,
      ...(request.settings.stopSequences.length > 0 && {
        stop: request.settings.stopSequences,
      }),
      ...(request.settings.seed !== undefined && {
        randomSeed: request.settings.seed,
      }),
      // Note: Mistral does not support frequency_penalty or presence_penalty
    };

    // Handle structured output configuration for Mistral
    // Mistral only supports json_object mode, no schema validation
    if (request.settings.structuredOutput?.schema && request.settings.structuredOutput.enabled !== false) {
      requestOptions.responseFormat = { type: 'json_object' };
      this.logger.warn(
        `Mistral does not support JSON schema validation. ` +
        `Using json_object mode - schema validation will be client-side only.`
      );
    }

    return { mistral, requestOptions };
  }

  private createTransportOptions(options?: AdapterRequestOptions): { timeoutMs?: number; signal?: AbortSignal } {
    const transportOptions: { timeoutMs?: number; signal?: AbortSignal } = {};
    if (options?.signal && options?.timeoutMs !== undefined) {
      transportOptions.signal = AbortSignal.any([
        options.signal,
        AbortSignal.timeout(options.timeoutMs),
      ]);
    } else if (options?.signal) {
      transportOptions.signal = options.signal;
    } else if (options?.timeoutMs !== undefined) {
      transportOptions.timeoutMs = options.timeoutMs;
    }
    return transportOptions;
  }

  private getStreamChoiceState(
    states: Map<number, MistralStreamChoiceState>,
    index: number
  ): MistralStreamChoiceState {
    let state = states.get(index);
    if (!state) {
      state = {
        content: "",
        reasoning: "",
        finishReason: null,
      };
      states.set(index, state);
    }
    return state;
  }

  private extractMistralContentDeltas(content: any): { content: string[]; reasoning: string[] } {
    if (typeof content === "string") {
      return { content: content.length > 0 ? [content] : [], reasoning: [] };
    }

    if (!Array.isArray(content)) {
      return { content: [], reasoning: [] };
    }

    const contentDeltas: string[] = [];
    const reasoningDeltas: string[] = [];

    for (const chunk of content) {
      if (chunk?.type === "thinking" && Array.isArray(chunk.thinking)) {
        const thinkingText = chunk.thinking
          .filter((part: any) => typeof part?.text === "string")
          .map((part: any) => part.text)
          .join("");
        if (thinkingText.length > 0) {
          reasoningDeltas.push(thinkingText);
        }
      } else if (typeof chunk?.text === "string" && chunk.text.length > 0) {
        contentDeltas.push(chunk.text);
      }
    }

    return { content: contentDeltas, reasoning: reasoningDeltas };
  }

  private createSyntheticCompletion(
    request: InternalLLMChatRequest,
    id: string,
    model: string,
    created: number,
    choiceStates: Map<number, MistralStreamChoiceState>,
    usage?: any
  ): any {
    const choices = Array.from(choiceStates.entries())
      .sort(([a], [b]) => a - b)
      .map(([index, state]) => ({
        index,
        message: {
          role: "assistant",
          content: state.content,
          ...(state.reasoning && { reasoning: state.reasoning }),
        },
        finishReason: state.finishReason || "stop",
      }));

    return {
      id: id || `mistral-stream-${Date.now()}`,
      object: "chat.completion",
      created,
      model: model || request.modelId,
      choices,
      ...(usage && { usage }),
    };
  }

  private mapMistralUsage(usage: any) {
    return {
      prompt_tokens: usage.promptTokens || usage.prompt_tokens || 0,
      completion_tokens: usage.completionTokens || usage.completion_tokens || 0,
      total_tokens: usage.totalTokens || usage.total_tokens || 0,
    };
  }

  /**
   * Formats messages for Mistral API
   *
   * @param request - The internal LLM request
   * @returns Formatted messages array
   */
  private formatMessages(
    request: InternalLLMChatRequest
  ): Array<{ role: "user" | "assistant" | "system"; content: string }> {
    const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
    const inlineSystemMessages: string[] = [];

    // Mistral supports system messages natively
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
        const modifiedIndex = prependSystemToFirstUserMessage(
          messages,
          combinedSystemContent,
          request.settings.systemMessageFallback
        );
        if (modifiedIndex !== -1) {
          this.logger.debug(
            `Model ${request.modelId} doesn't support system messages - prepended to first user message`
          );
        }
      }
    }

    return messages;
  }

  /**
   * Creates a standardized success response from Mistral's response
   *
   * @param completion - Raw Mistral completion response
   * @param request - Original request for context
   * @returns Standardized LLM response
   */
  private createSuccessResponse(
    completion: any,
    request: InternalLLMChatRequest
  ): LLMResponse {
    const choice = completion.choices[0];

    if (!choice || !choice.message) {
      throw new Error("No valid choices in Mistral completion response");
    }

    return {
      id: completion.id || `mistral-${Date.now()}`,
      provider: request.providerId,
      model: completion.model || request.modelId,
      created: completion.created || Math.floor(Date.now() / 1000),
      choices: completion.choices.map((c: any, index: number) => {
        const responseChoice: any = {
          message: {
            role: "assistant",
            content: typeof c.message?.content === "string" ? c.message.content : "",
          },
          finish_reason: c.finishReason || c.finish_reason || "stop",
          index: c.index ?? index,
        };

        const reasoning = c.reasoning || c.message?.reasoning || c.message?.reasoningContent;
        if (reasoning && request.settings.reasoning && !request.settings.reasoning.exclude) {
          responseChoice.reasoning = reasoning;
        }

        return responseChoice;
      }),
      usage: completion.usage
        ? {
            prompt_tokens: completion.usage.promptTokens || completion.usage.prompt_tokens || 0,
            completion_tokens: completion.usage.completionTokens || completion.usage.completion_tokens || 0,
            total_tokens: completion.usage.totalTokens || completion.usage.total_tokens || 0,
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

    // Mistral-specific error refinements
    if (mappedError.status === 400) {
      const errorMessage = (error?.message || '').toLowerCase();
      if (errorMessage.includes('model') && (errorMessage.includes('not available') || errorMessage.includes('not found'))) {
        mappedError.errorCode = ADAPTER_ERROR_CODES.MODEL_NOT_FOUND;
      }
      if (errorMessage.includes('context') || errorMessage.includes('token')) {
        mappedError.errorCode = ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED;
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
        ...(mappedError.retryAfterMs !== undefined && { retryAfterMs: mappedError.retryAfterMs }),
        providerError: error,
      },
      object: "error",
    };
  }
}
