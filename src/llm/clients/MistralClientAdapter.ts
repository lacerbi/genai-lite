// AI Summary: Client adapter for Mistral AI API using the official Mistral SDK.
// Provides access to Mistral models including Codestral and Mistral Large.

import { Mistral } from "@mistralai/mistralai";
import type { LLMResponse, LLMFailureResponse } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
  AdapterRequestOptions,
  AdapterLLMStreamEvent,
  AdapterPreparationContext,
  AdapterPreparationResult,
  AdapterPreparedRequest,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "../../shared/adapters/errorUtils";
import {
  createProviderOutputAccounting,
  normalizeTermination,
  normalizeUsage,
} from "../../shared/adapters/usageUtils";
import {
  collectSystemContent,
  prependSystemToFirstUserMessage,
} from "../../shared/adapters/systemMessageUtils";
import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";
import {
  applyPromptStructuredOutput,
  createPreparedRequestView,
  freezeProviderRequest,
  toPreparedRequestValue,
} from "./preparedAdapterUtils";

interface MistralPreparedRequest {
  mistral: Mistral;
  requestOptions: any;
}

interface MistralPreparedProviderRequest {
  request: InternalLLMChatRequest;
  requestOptions: Record<string, unknown>;
}

const MISTRAL_ADAPTER_REVISION = "mistral-adapter-v1";
const MISTRAL_REQUEST_SHAPE_REVISION = "mistral-chat-v1";

interface MistralStreamChoiceState {
  content: string;
  reasoning: string;
  hasGeneratedOutput: boolean;
  finishReason: string | null;
  rawContentParts: unknown[];
}

function hasMistralGeneratedContent(content: unknown): boolean {
  if (typeof content === "string") {
    return content.length > 0;
  }
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some((part: any) => {
    if (typeof part === "string") {
      return part.length > 0;
    }
    if (!part || typeof part !== "object") {
      return false;
    }
    if (typeof part.text === "string" && part.text.length > 0) {
      return true;
    }
    if (
      Array.isArray(part.thinking) &&
      part.thinking.some(
        (item: any) =>
          typeof item?.text === "string" && item.text.length > 0
      )
    ) {
      return true;
    }
    return Object.entries(part).some(
      ([key, value]) =>
        !["type", "text", "thinking"].includes(key) &&
        value !== undefined &&
        value !== null
    );
  });
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

  async prepareRequest(
    request: InternalLLMChatRequest,
    context: AdapterPreparationContext
  ): Promise<AdapterPreparationResult> {
    try {
      request = applyPromptStructuredOutput(request);
      const baseOptions = this.prepareCompletionParams(request);
      const requestOptions =
        context.mode === "stream"
          ? { ...baseOptions, stream: true }
          : baseOptions;
      const providerRequest =
        freezeProviderRequest<MistralPreparedProviderRequest>({
          request,
          requestOptions,
        });
      return {
        prepared: {
          mode: context.mode,
          providerRequest,
          requestView: createPreparedRequestView({
            operation: "mistral.chat",
            mode: context.mode,
            payload: requestOptions,
            structuredOutput: request.settings.structuredOutput,
          }),
          promptAccounting: { status: "unavailable" },
          outputTokenLimit: context.outputTokenLimit,
          bindings: {
            adapterRevision: MISTRAL_ADAPTER_REVISION,
            requestShapeRevision: MISTRAL_REQUEST_SHAPE_REVISION,
          },
        },
      };
    } catch (error) {
      return { error: this.createErrorResponse(error, request) };
    }
  }

  async sendPrepared(
    prepared: AdapterPreparedRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    const providerRequest =
      prepared.providerRequest as MistralPreparedProviderRequest;
    const request = providerRequest.request;
    try {
      const mistral = this.createClient(apiKey);
      const requestOptions = structuredClone(providerRequest.requestOptions);
      const transportOptions = this.createTransportOptions(options);
      const completion =
        Object.keys(transportOptions).length > 0
          ? await mistral.chat.complete(requestOptions as any, transportOptions as any)
          : await mistral.chat.complete(requestOptions as any);
      return this.createSuccessResponse(completion, request);
    } catch (error) {
      this.logger.error("Mistral prepared API error:", error);
      return this.createErrorResponse(error, request);
    }
  }

  async *streamPrepared(
    prepared: AdapterPreparedRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    const providerRequest =
      prepared.providerRequest as MistralPreparedProviderRequest;
    yield* this.streamCompletion(
      providerRequest.request,
      structuredClone(providerRequest.requestOptions),
      apiKey,
      options
    );
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
    request = applyPromptStructuredOutput(request);
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
  ): AsyncIterable<AdapterLLMStreamEvent> {
    request = applyPromptStructuredOutput(request);
    yield* this.streamCompletion(
      request,
      { ...this.prepareCompletionParams(request), stream: true },
      apiKey,
      options
    );
  }

  private async *streamCompletion(
    request: InternalLLMChatRequest,
    streamRequestOptions: Record<string, unknown>,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    const choiceStates = new Map<number, MistralStreamChoiceState>();
    let responseId = "";
    let responseModel = request.modelId;
    let created = Math.floor(Date.now() / 1000);
    let usage: any | undefined;
    let choiceCardinalityAmbiguous = false;

    try {
      const mistral = this.createClient(apiKey);

      this.logger.info(`Making Mistral streaming API call for model: ${request.modelId}`);
      const transportOptions = this.createTransportOptions(options);
      const stream =
        Object.keys(transportOptions).length > 0
          ? await mistral.chat.stream(streamRequestOptions as any, transportOptions as any)
          : await mistral.chat.stream(streamRequestOptions as any);

      let started = false;
      for await (const event of stream as AsyncIterable<any>) {
        const chunk = event?.data ?? event;
        responseId = chunk?.id || responseId;
        responseModel = chunk?.model || responseModel;
        created = chunk?.created || created;
        const evidenceEvents: AdapterLLMStreamEvent[] = [];
        const publicEvents: AdapterLLMStreamEvent[] = [];

        if (chunk?.usage) {
          usage = chunk.usage;
          const normalized = this.normalizeMistralUsage(chunk.usage);
          if (normalized.usage) {
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                usage: normalized.usage,
                usageEvidence: normalized.usageEvidence,
              },
            });
            publicEvents.push({
              type: "usage",
              usage: normalized.usage,
              observedEvidence: {
                usageEvidence: normalized.usageEvidence,
              },
            });
          }
        }

        const chunkChoices = chunk?.choices || [];
        if (
          chunkChoices.length > 1 &&
          chunkChoices.some(
            (choice: any) => !Number.isInteger(choice.index)
          )
        ) {
          choiceCardinalityAmbiguous = true;
        }
        for (const choice of chunkChoices) {
          const index = choice.index ?? 0;
          const state = this.getStreamChoiceState(choiceStates, index);
          const rawFinishReason =
            choice.finishReason ?? choice.finish_reason;
          state.finishReason = rawFinishReason ?? state.finishReason;
          if (rawFinishReason != null) {
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index,
                  finishReason: rawFinishReason,
                  termination: normalizeTermination(rawFinishReason),
                },
              },
            });
          }

          const rawDelta = choice.delta?.content;
          const rawContentParts =
            typeof rawDelta === "string"
              ? [{ type: "text", text: rawDelta }]
              : Array.isArray(rawDelta)
                ? rawDelta.map((part: any) => {
                    const thinkingText =
                      part?.type === "thinking" &&
                      Array.isArray(part.thinking)
                        ? part.thinking
                            .filter(
                              (item: any) =>
                                typeof item?.text === "string"
                            )
                            .map((item: any) => item.text)
                            .join("")
                        : undefined;
                    return {
                      type: String(part?.type ?? "unknown"),
                      ...(typeof part?.text === "string" && {
                        text: part.text,
                      }),
                      ...(thinkingText !== undefined && {
                        text: thinkingText,
                        reasoning: true,
                      }),
                      ...(toPreparedRequestValue(part) !== undefined && {
                        value: toPreparedRequestValue(part),
                      }),
                    };
                  })
                : [];
          if (typeof rawDelta === "string") {
            state.rawContentParts.push({
              type: "text",
              text: rawDelta,
            });
          } else if (Array.isArray(rawDelta)) {
            state.rawContentParts.push(
              ...rawDelta.map((part: unknown) =>
                toPreparedRequestValue(part)
              ).filter((part: unknown) => part !== undefined)
            );
          }
          const deltas = this.extractMistralContentDeltas(rawDelta);
          if (hasMistralGeneratedContent(rawDelta)) {
            state.hasGeneratedOutput = true;
          }
          if (rawContentParts.length > 0) {
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index,
                  ...(deltas.content.length > 0 && {
                    rawContentDelta: deltas.content.join(""),
                  }),
                  rawContentParts,
                },
              },
            });
          }
          for (const reasoningDelta of deltas.reasoning) {
            state.reasoning += reasoningDelta;
            if (request.settings.reasoning?.exclude !== true) {
              publicEvents.push({
                type: "reasoning_delta",
                delta: reasoningDelta,
                index,
              });
            }
          }

          for (const contentDelta of deltas.content) {
            state.content += contentDelta;
            publicEvents.push({
              type: "content_delta",
              delta: contentDelta,
              index,
            });
          }
        }

        if (
          chunk?.usage &&
          !choiceCardinalityAmbiguous &&
          choiceStates.size === 1
        ) {
          const [index, state] = choiceStates.entries().next().value as [
            number,
            MistralStreamChoiceState,
          ];
          const providerOutput = createProviderOutputAccounting({
            source: chunk.usage,
            directFields: ["completionTokens", "completion_tokens"],
            choiceCount: 1,
            hasGeneratedOutput: state.hasGeneratedOutput,
            reasoning: "unknown",
          });
          if (providerOutput) {
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index,
                  answerAccounting: { providerOutput },
                },
              },
            });
          }
        }

        for (const bufferedEvent of evidenceEvents) {
          yield bufferedEvent;
        }
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
        for (const bufferedEvent of publicEvents) {
          yield bufferedEvent;
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
          usageEvidence: partial.usageEvidence,
        };
      } else if (usage) {
        const normalizedUsage = normalizeUsage(usage, {
          prompt: ["promptTokens", "prompt_tokens"],
          completion: ["completionTokens", "completion_tokens"],
          total: ["totalTokens", "total_tokens"],
        });
        errorResponse.partialResponse = {
          id: responseId,
          provider: request.providerId,
          model: responseModel,
          created,
          choices: [],
          ...normalizedUsage,
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
    return {
      mistral: this.createClient(apiKey),
      requestOptions: this.prepareCompletionParams(request),
    };
  }

  private createClient(apiKey: string): Mistral {
    return new Mistral({
      apiKey,
      serverURL: this.baseURL !== 'https://api.mistral.ai' ? this.baseURL : undefined,
    });
  }

  private prepareCompletionParams(
    request: InternalLLMChatRequest
  ): Record<string, unknown> {
    // Format messages for Mistral API
    const messages = this.formatMessages(request);

    // Build request options
    const requestOptions: Record<string, any> = {
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
    if (
      request.settings.structuredOutput?.schema &&
      request.settings.structuredOutput.enabled !== false &&
      request.settings.structuredOutput.delivery !== "prompt"
    ) {
      requestOptions.responseFormat = { type: 'json_object' };
      this.logger.warn(
        `Mistral does not support JSON schema validation. ` +
        `Using json_object mode - schema validation will be client-side only.`
      );
    }

    return requestOptions;
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
        hasGeneratedOutput: false,
        finishReason: null,
        rawContentParts: [],
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
          content:
            state.rawContentParts.length > 0
              ? state.rawContentParts
              : state.content,
          ...(state.reasoning && { reasoning: state.reasoning }),
        },
        finishReason: state.finishReason,
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

  private normalizeMistralUsage(usage: any) {
    return normalizeUsage(usage, {
      prompt: ["promptTokens", "prompt_tokens"],
      completion: ["completionTokens", "completion_tokens"],
      total: ["totalTokens", "total_tokens"],
    });
  }

  private mapMistralUsage(usage: any) {
    return this.normalizeMistralUsage(usage).usage ?? {};
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

    const normalizedUsage = normalizeUsage(completion.usage, {
      prompt: ["promptTokens", "prompt_tokens"],
      completion: ["completionTokens", "completion_tokens"],
      total: ["totalTokens", "total_tokens"],
    });

    return {
      id: completion.id || `mistral-${Date.now()}`,
      provider: request.providerId,
      model: completion.model || request.modelId,
      created: completion.created || Math.floor(Date.now() / 1000),
      choices: completion.choices.map((c: any, index: number) => {
        const providerContent = c.message?.content;
        const extractedContent =
          this.extractMistralContentDeltas(providerContent);
        const rawContent = extractedContent.content.join("");
        const rawFinishReason =
          c.finishReason ?? c.finish_reason ?? null;
        const responseChoice: any = {
          message: {
            role: "assistant",
            content: rawContent,
          },
          rawContent,
          ...(Array.isArray(providerContent) && {
            rawContentParts: providerContent.map((part: any) => {
              const thinkingText =
                part?.type === "thinking" && Array.isArray(part.thinking)
                  ? part.thinking
                      .filter(
                        (item: any) => typeof item?.text === "string"
                      )
                      .map((item: any) => item.text)
                      .join("")
                  : undefined;
              return {
                type: String(part?.type ?? "unknown"),
                ...(typeof part?.text === "string" && { text: part.text }),
                ...(thinkingText !== undefined && {
                  text: thinkingText,
                  reasoning: true,
                }),
                ...(toPreparedRequestValue(part) !== undefined && {
                  value: toPreparedRequestValue(part),
                }),
              };
            }),
          }),
          finish_reason: rawFinishReason,
          termination: normalizeTermination(rawFinishReason),
          index: c.index ?? index,
        };

        const reasoning =
          c.reasoning ||
          c.message?.reasoning ||
          c.message?.reasoningContent ||
          extractedContent.reasoning.join("");
        if (reasoning && request.settings.reasoning && !request.settings.reasoning.exclude) {
          responseChoice.reasoning = reasoning;
        }

        const providerOutput = createProviderOutputAccounting({
          source: completion.usage,
          directFields: ["completionTokens", "completion_tokens"],
          choiceCount: completion.choices.length,
          hasGeneratedOutput:
            rawContent.length > 0 ||
            Boolean(reasoning) ||
            hasMistralGeneratedContent(providerContent),
          reasoning: "unknown",
        });
        if (providerOutput) {
          responseChoice.answerAccounting = { providerOutput };
        }

        return responseChoice;
      }),
      ...normalizedUsage,
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
