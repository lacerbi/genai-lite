// AI Summary: Client adapter for llama.cpp server using OpenAI-compatible API.
// Provides LLM chat completions via llama.cpp's /v1/chat/completions endpoint.

import OpenAI from "openai";
import type { LLMResponse, LLMFailureResponse, ModelInfo } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
  AdapterRequestOptions,
  AdapterLLMStreamEvent,
  AdapterPreparationContext,
  AdapterPreparationResult,
  AdapterPreparedRequest,
  AdapterRevalidationResult,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "../../shared/adapters/errorUtils";
import {
  collectSystemContent,
  prependSystemToFirstUserMessage,
} from "../../shared/adapters/systemMessageUtils";
import {
  LlamaCppServerClient,
  type LlamaCppModelsResponse,
} from "./LlamaCppServerClient";
import { detectGgufCapabilities } from "../config";
import { extractMarkerDelimitedContent } from "../../prompting/parser";
import { mapOpenAIChatLogprobs } from "../../shared/adapters/logprobsUtils";
import {
  normalizeTermination,
  normalizeUsage,
} from "../../shared/adapters/usageUtils";
import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";
import {
  applyPromptStructuredOutput,
  createPreparedRequestView,
  freezeProviderRequest,
} from "./preparedAdapterUtils";
import {
  createLlamaCppStateBinding,
  selectLlamaCppModel,
  type LlamaCppStateBinding,
} from "./llamaCppState";

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

interface LlamaCppCompletionRequest {
  openai: OpenAI;
  completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams;
  detectedCaps: Partial<ModelInfo> | null;
}

interface LlamaCppSemanticRequest {
  completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams;
  detectedCaps: Partial<ModelInfo> | null;
}

interface LlamaCppPreparedProviderRequest extends LlamaCppSemanticRequest {
  request: InternalLLMChatRequest;
  stateBinding?: LlamaCppStateBinding;
}

/** Opaque dynamic state shared from service resolution into preparation. */
interface LlamaCppPreparationSnapshot {
  kind: "llamacpp-preparation-v1";
  selectedModel: string;
  detectedCaps: Partial<ModelInfo> | null;
  stateBinding?: LlamaCppStateBinding;
}

const LLAMACPP_ADAPTER_REVISION = "llamacpp-adapter-v1";
const LLAMACPP_REQUEST_SHAPE_REVISION = "llamacpp-chat-completions-v1";
const LLAMACPP_PREFLIGHT_TIMEOUT_MS = 5000;

interface LlamaCppStreamChoiceState {
  content: string;
  reasoningContent: string;
  finishReason: string | null;
  logprobs: any[];
  prefixBuffer: string;
  prefixResolved: boolean;
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
  private cachedModelCapabilities = new Map<
    string,
    Partial<ModelInfo> | null
  >();
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
   * Captures the selected model capabilities and observable state in one
   * snapshot so service-level defaults and adapter preparation cannot diverge.
   */
  async getPreparationSnapshot(
    selectedModel = "llamacpp"
  ): Promise<LlamaCppPreparationSnapshot> {
    try {
      const [props, models] = await Promise.all([
        this.serverClient.getProps({
          model: selectedModel,
          timeoutMs: LLAMACPP_PREFLIGHT_TIMEOUT_MS,
        }),
        this.serverClient.getModels({
          timeoutMs: LLAMACPP_PREFLIGHT_TIMEOUT_MS,
        }),
      ]);
      const stateBinding = createLlamaCppStateBinding(
        props,
        models,
        selectedModel
      );
      return {
        kind: "llamacpp-preparation-v1",
        selectedModel,
        detectedCaps: this.detectModelCapabilities(
          models,
          selectedModel
        ),
        ...(stateBinding && { stateBinding }),
      };
    } catch (error) {
      this.logger.warn(
        "Observable llama.cpp state is unavailable during resolution:",
        error
      );
      return {
        kind: "llamacpp-preparation-v1",
        selectedModel,
        detectedCaps: null,
      };
    }
  }

  async prepareRequest(
    request: InternalLLMChatRequest,
    context: AdapterPreparationContext
  ): Promise<AdapterPreparationResult> {
    request = applyPromptStructuredOutput(request);
    const providedSnapshot = context.providerState as
      | LlamaCppPreparationSnapshot
      | undefined;
    const snapshot =
      providedSnapshot?.kind === "llamacpp-preparation-v1" &&
      providedSnapshot.selectedModel === request.modelId
        ? providedSnapshot
        : await this.getPreparationSnapshot(request.modelId);
    const stateBinding = snapshot.stateBinding;

    const semantic = await this.prepareCompletionParams(
      request,
      snapshot.detectedCaps
    );
    if ("error" in semantic) {
      return semantic;
    }
    const completionParams =
      context.mode === "stream"
        ? ({
            ...semantic.completionParams,
            stream: true,
            stream_options: { include_usage: true },
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming)
        : semantic.completionParams;
    let promptAccounting: AdapterPreparedRequest["promptAccounting"] = {
      status: "unavailable",
    };
    if (stateBinding) {
      try {
        const counted = await this.serverClient.countChatCompletionInputTokens(
          completionParams as unknown as Record<string, unknown>,
          {
            model: request.modelId,
            timeoutMs: LLAMACPP_PREFLIGHT_TIMEOUT_MS,
          }
        );
        const [currentProps, currentModels] = await Promise.all([
          this.serverClient.getProps({
            model: request.modelId,
            timeoutMs: LLAMACPP_PREFLIGHT_TIMEOUT_MS,
          }),
          this.serverClient.getModels({
            timeoutMs: LLAMACPP_PREFLIGHT_TIMEOUT_MS,
          }),
        ]);
        const currentBinding = createLlamaCppStateBinding(
          currentProps,
          currentModels,
          request.modelId
        );
        if (
          currentBinding?.serverStateFingerprint ===
          stateBinding.serverStateFingerprint
        ) {
          promptAccounting = {
            status: "available",
            count: {
              tokens: counted.input_tokens,
              method: "exact",
              tokenizerId: `llamacpp-active:${stateBinding.metadata.model}`,
              tokenProfileRevision:
                `llamacpp-state:${stateBinding.serverStateFingerprint}`,
            },
          };
        } else {
          this.logger.warn(
            "llama.cpp state changed while preparing the exact prompt count; accounting is unavailable."
          );
        }
      } catch (error) {
        this.logger.warn(
          "Exact llama.cpp prepared-message counting is unavailable:",
          error
        );
      }
    }

    const providerRequest =
      freezeProviderRequest<LlamaCppPreparedProviderRequest>({
        request,
        completionParams,
        detectedCaps: semantic.detectedCaps,
        ...(stateBinding && { stateBinding }),
      });
    return {
      prepared: {
        mode: context.mode,
        providerRequest,
        requestView: createPreparedRequestView({
          operation: "llamacpp.chat.completions",
          mode: context.mode,
          payload: completionParams as unknown as Record<string, unknown>,
          structuredOutput: request.settings.structuredOutput,
          extensionFields: ["chat_template_kwargs", "grammar"],
        }),
        promptAccounting,
        outputTokenLimit: context.outputTokenLimit,
        bindings: {
          adapterRevision: LLAMACPP_ADAPTER_REVISION,
          requestShapeRevision: LLAMACPP_REQUEST_SHAPE_REVISION,
          ...(stateBinding && {
            tokenProfileRevision:
              `llamacpp-state:${stateBinding.serverStateFingerprint}`,
            serverStateFingerprint: stateBinding.serverStateFingerprint,
            chatTemplateFingerprint: stateBinding.chatTemplateFingerprint,
          }),
        },
      },
    };
  }

  async revalidatePreparedRequest(
    prepared: AdapterPreparedRequest,
    options?: AdapterRequestOptions
  ): Promise<AdapterRevalidationResult> {
    const providerRequest =
      prepared.providerRequest as LlamaCppPreparedProviderRequest;
    if (!providerRequest.stateBinding) {
      return { valid: true };
    }
    try {
      const utilityOptions = {
        model: providerRequest.request.modelId,
        ...(options?.signal && { signal: options.signal }),
        timeoutMs: options?.timeoutMs ?? LLAMACPP_PREFLIGHT_TIMEOUT_MS,
      };
      const [props, models] = await Promise.all([
        this.serverClient.getProps(utilityOptions),
        this.serverClient.getModels(utilityOptions),
      ]);
      const current = createLlamaCppStateBinding(
        props,
        models,
        providerRequest.request.modelId
      );
      if (
        !current ||
        current.serverStateFingerprint !==
          providerRequest.stateBinding.serverStateFingerprint ||
        current.chatTemplateFingerprint !==
          providerRequest.stateBinding.chatTemplateFingerprint
      ) {
        this.clearModelCache();
        return {
          valid: false,
          error: {
            provider: providerRequest.request.providerId,
            model: providerRequest.request.modelId,
            error: {
              message:
                "The llama.cpp model, server build, or chat template changed after preparation.",
              code: ADAPTER_ERROR_CODES.PREPARED_CALL_STALE,
              type: "validation_error",
            },
            object: "error",
          },
        };
      }
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: this.createErrorResponse(error, providerRequest.request),
      };
    }
  }

  async sendPrepared(
    prepared: AdapterPreparedRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    const providerRequest =
      prepared.providerRequest as LlamaCppPreparedProviderRequest;
    const request = providerRequest.request;
    try {
      const openai = this.createClient(apiKey);
      const completionParams = structuredClone(
        providerRequest.completionParams
      ) as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
      const transportOptions = this.createTransportOptions(options);
      const completion =
        Object.keys(transportOptions).length > 0
          ? await openai.chat.completions.create(
              completionParams,
              transportOptions
            )
          : await openai.chat.completions.create(completionParams);
      return this.createSuccessResponse(
        completion,
        request,
        providerRequest.detectedCaps
      );
    } catch (error) {
      this.handleConnectionError(error);
      return this.createErrorResponse(error, request);
    }
  }

  async *streamPrepared(
    prepared: AdapterPreparedRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    const providerRequest =
      prepared.providerRequest as LlamaCppPreparedProviderRequest;
    yield* this.streamCompletion(
      providerRequest.request,
      structuredClone(
        providerRequest.completionParams
      ) as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
      providerRequest.detectedCaps,
      apiKey,
      options
    );
  }

  /**
   * Gets model capabilities by detecting the loaded GGUF model
   *
   * The observable model list is refreshed on each call so router selection
   * cannot reuse stale identity. Capability classification is cached by the
   * selected model's full observable identity and cleared on connection errors.
   *
   * @returns Detected model capabilities or null if detection fails
   */
  async getModelCapabilities(
    selectedModel?: string
  ): Promise<Partial<ModelInfo> | null> {
    // Attempt detection
    try {
      this.logger.debug(`Detecting model capabilities from llama.cpp server at ${this.baseURL}`);
      const models = await this.serverClient.getModels();
      const { data } = models;

      if (!data || data.length === 0) {
        this.logger.warn('No models loaded in llama.cpp server');
        return null;
      }
      return this.detectModelCapabilities(models, selectedModel);
    } catch (error) {
      this.logger.warn('Failed to detect model capabilities:', error);
      return null;
    }
  }

  private detectModelCapabilities(
    models: LlamaCppModelsResponse,
    selectedModel?: string
  ): Partial<ModelInfo> | null {
    const selected = selectLlamaCppModel(models, selectedModel);
    if (!selected) {
      this.logger.warn(
        `Could not identify llama.cpp router model '${selectedModel ?? ""}'.`
      );
      return null;
    }
    const cacheKey = JSON.stringify({
      id: selected.id,
      aliases: selected.aliases,
      meta: selected.meta,
    });
    if (this.cachedModelCapabilities.has(cacheKey)) {
      return this.cachedModelCapabilities.get(cacheKey) ?? null;
    }
    const capabilities = detectGgufCapabilities(selected.id);
    this.cachedModelCapabilities.set(cacheKey, capabilities);
    if (capabilities) {
      this.logger.debug(`Cached model capabilities for: ${selected.id}`);
    } else {
      this.logger.debug(`No known pattern matched for: ${selected.id}`);
    }
    return capabilities;
  }

  /**
   * Clears the cached model capabilities
   *
   * Called automatically on connection errors, or can be called manually
   * if the server has been restarted with a different model.
   */
  clearModelCache(): void {
    this.cachedModelCapabilities.clear();
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
    request = applyPromptStructuredOutput(request);
    try {
      const prepared = await this.prepareCompletionRequest(request, apiKey);
      if ("error" in prepared) {
        return prepared.error;
      }

      const { openai, completionParams, detectedCaps } = prepared;

      this.logger.debug(`llama.cpp API parameters:`, {
        baseURL: this.baseURL,
        model: completionParams.model,
        temperature: completionParams.temperature,
        max_tokens: completionParams.max_tokens,
        top_p: completionParams.top_p,
      });

      this.logger.info(`Making llama.cpp API call for model: ${request.modelId}`);

      const transportOptions = this.createTransportOptions(options);
      const completion =
        Object.keys(transportOptions).length > 0
          ? await openai.chat.completions.create(completionParams, transportOptions)
          : await openai.chat.completions.create(completionParams);

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

  async *streamMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    request = applyPromptStructuredOutput(request);
    const prepared = await this.prepareCompletionRequest(request, apiKey);
    if ("error" in prepared) {
      yield { type: "error", error: prepared.error };
      return;
    }
    const streamParams = {
      ...prepared.completionParams,
      stream: true,
      stream_options: { include_usage: true },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
    yield* this.streamCompletion(
      request,
      streamParams,
      prepared.detectedCaps,
      apiKey,
      options
    );
  }

  private async *streamCompletion(
    request: InternalLLMChatRequest,
    streamParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    initialDetectedCaps: Partial<ModelInfo> | null,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    const choiceStates = new Map<number, LlamaCppStreamChoiceState>();
    let responseId = "";
    let responseModel = request.modelId;
    let created = Math.floor(Date.now() / 1000);
    let usage: OpenAI.Completions.CompletionUsage | undefined;
    const detectedCaps = initialDetectedCaps;

    try {
      const openai = this.createClient(apiKey);
      const transportOptions = this.createTransportOptions(options);
      const stream =
        Object.keys(transportOptions).length > 0
          ? await openai.chat.completions.create(streamParams, transportOptions)
          : await openai.chat.completions.create(streamParams);

      let started = false;
      for await (const chunk of stream) {
        responseId = chunk.id || responseId;
        responseModel = chunk.model || responseModel;
        created = chunk.created || created;
        const evidenceEvents: AdapterLLMStreamEvent[] = [];
        const publicEvents: AdapterLLMStreamEvent[] = [];

        if (chunk.usage) {
          usage = chunk.usage;
          const normalized = normalizeUsage(
            chunk.usage as unknown as Record<string, unknown>,
            {
              prompt: ["prompt_tokens"],
              completion: ["completion_tokens"],
              total: ["total_tokens"],
            }
          );
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

        for (const choice of chunk.choices || []) {
          const state = this.getStreamChoiceState(choiceStates, choice.index);
          state.finishReason = choice.finish_reason ?? state.finishReason;
          if (choice.finish_reason != null) {
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index: choice.index,
                  finishReason: choice.finish_reason,
                  termination: normalizeTermination(choice.finish_reason),
                },
              },
            });
          }

          const delta = choice.delta as any;
          const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning;
          if (typeof reasoningDelta === "string" && reasoningDelta.length > 0) {
            state.reasoningContent += reasoningDelta;
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index: choice.index,
                  rawContentParts: [{
                    type: "reasoning",
                    text: reasoningDelta,
                    reasoning: true,
                  }],
                },
              },
            });
            if (request.settings.reasoning?.exclude !== true) {
              publicEvents.push({
                type: "reasoning_delta",
                delta: reasoningDelta,
                index: choice.index,
              });
            }
          }

          if (typeof delta?.content === "string" && delta.content.length > 0) {
            state.content += delta.content;
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index: choice.index,
                  rawContentDelta: delta.content,
                  rawContentParts: [{
                    type: "text",
                    text: delta.content,
                  }],
                },
              },
            });
            const visibleDelta = this.filterLiveNothinkPrefixDelta(
              state,
              delta.content,
              detectedCaps?.localReasoning?.nothinkPrefix
            );
            if (visibleDelta) {
              publicEvents.push({
                type: "content_delta",
                delta: visibleDelta,
                index: choice.index,
              });
            }
          }

          const mappedLogprobs = mapOpenAIChatLogprobs(choice.logprobs);
          if (mappedLogprobs) {
            state.logprobs.push(...((choice.logprobs as any)?.content || []));
          }
        }

        for (const event of evidenceEvents) {
          yield event;
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
        for (const event of publicEvents) {
          yield event;
        }
      }

      for (const [index, state] of choiceStates) {
        if (!state.prefixResolved && state.prefixBuffer) {
          yield {
            type: "content_delta",
            delta: state.prefixBuffer,
            index,
          };
          state.prefixBuffer = "";
          state.prefixResolved = true;
        }
      }

      const response = this.createSuccessResponse(
        this.createSyntheticCompletion(
          request,
          responseId,
          responseModel,
          created,
          choiceStates,
          usage
        ),
        request,
        detectedCaps
      );

      yield { type: "complete", response };
    } catch (error) {
      this.logger.error("llama.cpp streaming API error:", error);

      this.handleConnectionError(error);

      const errorResponse = this.createErrorResponse(error, request);
      if (choiceStates.size > 0) {
        const partial = this.createSuccessResponse(
          this.createSyntheticCompletion(
            request,
            responseId,
            responseModel,
            created,
            choiceStates,
            usage
          ),
          request,
          detectedCaps
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
        const normalizedUsage = normalizeUsage(
          usage as unknown as Record<string, unknown>,
          {
            prompt: ["prompt_tokens"],
            completion: ["completion_tokens"],
            total: ["total_tokens"],
          }
        );
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

  private async prepareCompletionRequest(
    request: InternalLLMChatRequest,
    apiKey: string
  ): Promise<LlamaCppCompletionRequest | { error: LLMFailureResponse }> {
    // Optional health check before making request
    if (this.checkHealth) {
      try {
        const health = await this.serverClient.getHealth();
        if (health.status !== 'ok') {
          return {
            error: {
              provider: request.providerId,
              model: request.modelId,
              error: {
                message: `llama.cpp server not ready: ${health.status}${health.error ? ' - ' + health.error : ''}`,
                code: ADAPTER_ERROR_CODES.PROVIDER_ERROR,
                type: 'server_not_ready',
              },
              object: 'error',
            },
          };
        }
      } catch (healthError) {
        this.logger.warn('Health check failed, proceeding with request anyway:', healthError);
      }
    }

    const semantic = await this.prepareCompletionParams(request);
    if ("error" in semantic) {
      return semantic;
    }
    return {
      openai: this.createClient(apiKey),
      ...semantic,
    };
  }

  private async prepareCompletionParams(
    request: InternalLLMChatRequest,
    detectedCapsSnapshot?: Partial<ModelInfo> | null
  ): Promise<LlamaCppSemanticRequest | { error: LLMFailureResponse }> {
    const messages = this.formatMessages(request);
    const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: request.modelId,
      messages,
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

    if (
      request.settings.structuredOutput?.schema &&
      request.settings.structuredOutput.enabled !== false &&
      request.settings.structuredOutput.delivery !== "prompt"
    ) {
      const so = request.settings.structuredOutput;
      (completionParams as any).response_format = {
        type: 'json_object',
        schema: so.schema,
      };
    }

    const detectedCaps =
      detectedCapsSnapshot === undefined
        ? await this.getModelCapabilities(request.modelId)
        : detectedCapsSnapshot;
    const localReasoning = detectedCaps?.localReasoning;
    const derivedKwargs: Record<string, string | number | boolean> = {};
    if (localReasoning?.toggleKwarg) {
      derivedKwargs[localReasoning.toggleKwarg] =
        request.settings.reasoning?.enabled === true;
    }
    const chatTemplateKwargs = {
      ...derivedKwargs,
      ...(request.settings.llamacpp?.chatTemplateKwargs || {}),
    };
    if (Object.keys(chatTemplateKwargs).length > 0) {
      const thinkingKwarg = localReasoning?.toggleKwarg ?? 'enable_thinking';
      const effectiveThinking = chatTemplateKwargs[thinkingKwarg] === true;
      const lastMessage = messages[messages.length - 1];
      if (effectiveThinking && lastMessage?.role === 'assistant') {
        return {
          error: {
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
          },
        };
      }

      (completionParams as any).chat_template_kwargs = chatTemplateKwargs;
    }

    if (request.settings.llamacpp?.grammar) {
      (completionParams as any).grammar = request.settings.llamacpp.grammar;
    }

    if (request.settings.logprobs === true) {
      (completionParams as any).logprobs = true;
      if (request.settings.topLogprobs !== undefined) {
        (completionParams as any).top_logprobs = request.settings.topLogprobs;
      }
    }

    return { completionParams, detectedCaps };
  }

  private createClient(apiKey: string): OpenAI {
    return new OpenAI({
      apiKey: apiKey || "not-needed",
      baseURL: `${this.baseURL}/v1`,
      maxRetries: 0,
    });
  }

  private handleConnectionError(error: unknown): void {
    const errorMessage = (error as any)?.message || String(error);
    if (
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("fetch failed") ||
      errorMessage.includes("connect")
    ) {
      this.clearModelCache();
    }
  }

  private createTransportOptions(options?: AdapterRequestOptions) {
    return {
      ...(options?.signal && { signal: options.signal }),
      ...(options?.timeoutMs !== undefined && { timeout: options.timeoutMs }),
    };
  }

  private getStreamChoiceState(
    states: Map<number, LlamaCppStreamChoiceState>,
    index: number
  ): LlamaCppStreamChoiceState {
    let state = states.get(index);
    if (!state) {
      state = {
        content: "",
        reasoningContent: "",
        finishReason: null,
        logprobs: [],
        prefixBuffer: "",
        prefixResolved: false,
      };
      states.set(index, state);
    }
    return state;
  }

  private filterLiveNothinkPrefixDelta(
    state: LlamaCppStreamChoiceState,
    delta: string,
    nothinkPrefix?: string
  ): string {
    if (!nothinkPrefix || state.prefixResolved) {
      return delta;
    }

    state.prefixBuffer += delta;
    if (nothinkPrefix.startsWith(state.prefixBuffer)) {
      if (state.prefixBuffer === nothinkPrefix) {
        state.prefixBuffer = "";
        state.prefixResolved = true;
      }
      return "";
    }

    if (state.prefixBuffer.startsWith(nothinkPrefix)) {
      const visible = state.prefixBuffer.slice(nothinkPrefix.length);
      state.prefixBuffer = "";
      state.prefixResolved = true;
      return visible;
    }

    const visible = state.prefixBuffer;
    state.prefixBuffer = "";
    state.prefixResolved = true;
    return visible;
  }

  private createSyntheticCompletion(
    request: InternalLLMChatRequest,
    id: string,
    model: string,
    created: number,
    choiceStates: Map<number, LlamaCppStreamChoiceState>,
    usage?: OpenAI.Completions.CompletionUsage
  ): OpenAI.Chat.Completions.ChatCompletion {
    const choices = Array.from(choiceStates.entries())
      .sort(([a], [b]) => a - b)
      .map(([index, state]) => ({
        index,
        message: {
          role: "assistant" as const,
          content: state.content,
          ...(state.reasoningContent && {
            reasoning_content: state.reasoningContent,
          }),
        },
        finish_reason: state.finishReason,
        ...(state.logprobs.length > 0 && {
          logprobs: { content: state.logprobs },
        }),
      }));

    return {
      id: id || `llamacpp-stream-${Date.now()}`,
      object: "chat.completion",
      created,
      model: model || request.modelId,
      choices: choices as any,
      ...(usage && { usage }),
    };
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

    const normalizedUsage = normalizeUsage(
      completion.usage as unknown as Record<string, unknown> | undefined,
      {
        prompt: ["prompt_tokens"],
        completion: ["completion_tokens"],
        total: ["total_tokens"],
      }
    );

    return {
      id: completion.id,
      provider: request.providerId,
      model: completion.model || request.modelId,
      created: completion.created,
      choices: completion.choices.map((c) => {
        const rawContent = c.message.content || "";
        let content = rawContent;

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
          rawContent,
          rawContentParts: [
            {
              type: "text",
              text: rawContent,
            },
            ...((c.message as any).reasoning_content
              ? [{
                  type: "reasoning",
                  text: String((c.message as any).reasoning_content),
                  reasoning: true,
                }]
              : []),
          ],
          finish_reason: c.finish_reason,
          termination: normalizeTermination(c.finish_reason),
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
