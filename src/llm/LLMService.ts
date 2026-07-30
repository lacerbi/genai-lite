// AI Summary: Main process service for LLM operations, integrating with ApiKeyProvider for secure key access.
// Orchestrates LLM requests through provider-specific client adapters with proper error handling.

import { randomUUID } from "node:crypto";
import type { ApiKeyProvider, PresetMode } from '../types';
import type { Logger, LogLevel } from '../logging/types';
import { createDefaultLogger } from '../logging/defaultLogger';
import type {
  LLMChatRequest,
  LLMChatRequestWithPreset,
  LLMResponse,
  LLMFailureResponse,
  ProviderInfo,
  ModelInfo,
  ApiProviderId,
  LLMSettings,
  ModelContext,
  LLMMessage,
  LLMServiceStreamEvent,
  LLMRequestCapabilityPreflight,
  LLMRequestCapabilityValidationResult,
  ModelCapabilities,
  ModelCapabilitiesResult,
  StructuredOutputSupport,
  CapabilitySource,
  PreparedCallMode,
  PreparedCall,
  PreparedCompleteCall,
  PreparedStreamCall,
  PrepareMessageResult,
  PreparedRequestInspection,
  EffectiveOutputTokenLimit,
  PreparedPromptAccounting,
  LLMAnswerAccountingByScope,
  LLMChoice,
  LLMRawAnswerAccounting,
  LLMRawContentPart,
  LLMTermination,
  LLMUsage,
  LLMUsageEvidence,
  ProviderEndpointRevision,
  ProviderEndpointRevisionProvider,
} from "./types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
  AdapterRequestOptions,
  AdapterPreparedRequest,
  AdapterLLMStreamEvent,
} from "./clients/types";
import type { ModelPreset } from "../types/presets";
import {
  SUPPORTED_PROVIDERS,
  ADAPTER_CONSTRUCTORS,
  ADAPTER_CONFIGS,
  getProviderById,
  getModelById,
  getModelsByProvider
} from "./config";
import { renderTemplate } from "../prompting/template";
import { extractInitialTaggedContent, parseRoleTags, parseTemplateWithMetadata } from "../prompting/parser";
import defaultPresets from "../config/llm-presets.json";
import { MockClientAdapter } from "./clients/MockClientAdapter";

// Import the extracted services
import { PresetManager } from "../shared/services/PresetManager";
import { AdapterRegistry } from "../shared/services/AdapterRegistry";
import { RequestValidator } from "./services/RequestValidator";
import { SettingsManager } from "./services/SettingsManager";
import { ModelResolver } from "./services/ModelResolver";
import { withRetry, type RetryPolicy } from "../shared/services/withRetry";
import { ADAPTER_ERROR_CODES } from "./clients/types";
import { deepFreeze } from "./clients/preparedAdapterUtils";
import {
  countContentTextTokens,
  resolveContentTokenProfile,
} from "./tokenization";

// Re-export PresetMode for backward compatibility
export type { PresetMode };

/**
 * Options for configuring the LLMService
 */
export interface LLMServiceOptions {
  /** An array of custom presets to integrate. */
  presets?: ModelPreset[];
  /** The strategy for integrating custom presets. Defaults to 'extend'. */
  presetMode?: PresetMode;
  /** Log level for filtering messages. Defaults to GENAI_LITE_LOG_LEVEL env var or 'warn'. */
  logLevel?: LogLevel;
  /** Custom logger implementation. If provided, logLevel is ignored. */
  logger?: Logger;
  /**
   * Retry policy for transient failures (rate limits, 5xx, network errors, timeouts).
   * Defaults: maxRetries 2, initialDelayMs 500, maxDelayMs 10000, backoffFactor 2,
   * retryOnTimeout true. Provider SDK-internal retries are disabled — this layer
   * is the single owner of retry behavior. Set `maxRetries: 0` to disable.
   */
  retry?: Partial<RetryPolicy> & {
    /** Whether REQUEST_TIMEOUT failures are retryable (default true) */
    retryOnTimeout?: boolean;
  };
  /** Default per-request timeout in ms (overridable per call). SDK defaults apply when unset. */
  timeoutMs?: number;
  /**
   * Optional live source of an authoritative provider endpoint revision.
   *
   * When configured, preparation captures its current value and every physical
   * prepared dispatch reads it again immediately before inference. The callback
   * must read live state on each invocation; it must not close over a revision
   * captured when the service or prepared call was created.
   */
  providerEndpointRevisionProvider?: ProviderEndpointRevisionProvider;
  /**
   * Reuse adapter preparation snapshots under the authoritative endpoint
   * revision. Requires `providerEndpointRevisionProvider`.
   *
   * The host asserts that the revision changes whenever cached model, server
   * build, or template state changes. Dispatch revalidation remains live.
   * @default false
   */
  cachePreparationStateByEndpointRevision?: boolean;
}

/**
 * Per-call options for LLMService.sendMessage
 */
export interface SendMessageOptions {
  /**
   * Abort signal to cancel the request (client-side — the provider may still
   * process and bill an already-dispatched request). Aborts are never retried.
   */
  signal?: AbortSignal;
  /** Per-request timeout in ms (overrides the service-level timeoutMs) */
  timeoutMs?: number;
  /** Per-request retry cap (overrides the service-level retry.maxRetries) */
  maxRetries?: number;
}

/**
 * Per-call options for LLMService.streamMessage
 */
export interface StreamMessageOptions {
  /**
   * Abort signal to cancel the request (client-side - the provider may still
   * process and bill an already-dispatched request).
   */
  signal?: AbortSignal;
  /** Per-request timeout in ms (overrides the service-level timeoutMs) */
  timeoutMs?: number;
}

/** Selects the immutable dispatch mode fixed during preparation. */
export interface PrepareMessageOptions<TMode extends PreparedCallMode> {
  mode: TMode;
}

/**
 * Result from createMessages method
 */
export interface CreateMessagesResult {
  /** The parsed messages with role assignments */
  messages: LLMMessage[];
  /** Model context variables that were injected during template rendering */
  modelContext: ModelContext | null;
  /** Settings extracted from the template's <META> block */
  settings: Partial<LLMSettings>;
}

interface PreparedLLMRequest {
  providerId: ApiProviderId;
  modelId: string;
  modelInfo: ModelInfo;
  resolvedRequest: LLMChatRequest;
  internalRequest: InternalLLMChatRequest;
  clientAdapter: ILLMClientAdapter;
  adapterPrepared: AdapterPreparedRequest;
}

interface CapabilityValidationContext {
  providerId: ApiProviderId;
  modelId: string;
  modelInfo: ModelInfo;
  resolvedRequest: LLMChatRequest;
  finalSettings: Required<LLMSettings>;
  capabilities: ModelCapabilities;
  adapterPreparationState?: unknown;
}

interface StreamPartialChoiceState {
  content: string;
  reasoning: string;
  rawContent?: string;
  rawContentParts?: LLMRawContentPart[];
  answerAccounting?: LLMAnswerAccountingByScope;
  rawAnswerAccounting?: LLMRawAnswerAccounting;
  finishReason?: string | null;
  termination?: LLMTermination;
}

interface StreamPartialState {
  provider: ApiProviderId;
  model: string;
  id?: string;
  created?: number;
  started: boolean;
  choices: Map<number, StreamPartialChoiceState>;
  usage?: LLMUsage;
  usageEvidence?: LLMUsageEvidence;
}

interface PreparationStateCacheEntry {
  key: string;
  endpointKey: string;
  adapter: ILLMClientAdapter;
  providerId: ApiProviderId;
  modelId: string;
  revision: ProviderEndpointRevision;
  statePromise: Promise<unknown>;
  state?: unknown;
  published: boolean;
  activeLeases: number;
}

interface PreparationStateCacheLease {
  entry: PreparationStateCacheEntry;
  state: unknown;
  released: boolean;
}

const PREPARATION_STATE_CACHE_MAX_ENDPOINTS = 32;

function mergeAnswerAccountingByScope(
  current: LLMAnswerAccountingByScope | undefined,
  incoming: LLMAnswerAccountingByScope | undefined,
  incomingLegacyRaw?: LLMRawAnswerAccounting
): LLMAnswerAccountingByScope | undefined {
  const rawContent =
    incoming?.rawContent ?? incomingLegacyRaw ?? current?.rawContent;
  const providerOutput =
    incoming?.providerOutput ?? current?.providerOutput;
  if (!rawContent && !providerOutput) {
    return undefined;
  }
  return {
    ...(rawContent && { rawContent }),
    ...(providerOutput && { providerOutput }),
  };
}

function canonicalizeChoiceAnswerAccounting(choice: LLMChoice): void {
  const accounting = mergeAnswerAccountingByScope(
    undefined,
    choice.answerAccounting,
    choice.rawAnswerAccounting
  );
  if (!accounting) {
    return;
  }
  choice.answerAccounting = accounting;
  if (accounting.rawContent) {
    choice.rawAnswerAccounting = accounting.rawContent;
  }
}

/**
 * Main process service for LLM operations
 *
 * This service:
 * - Manages LLM provider client adapters
 * - Integrates with ApiKeyServiceMain for secure API key access
 * - Validates requests and applies default settings
 * - Routes requests to appropriate provider adapters
 * - Handles errors and provides standardized responses
 * - Provides configurable model presets for common use cases
 */

export class LLMService {
  private getApiKey: ApiKeyProvider;
  private logger: Logger;
  private presetManager: PresetManager<ModelPreset>;
  private adapterRegistry: AdapterRegistry<ILLMClientAdapter, ApiProviderId>;
  private requestValidator: RequestValidator;
  private settingsManager: SettingsManager;
  private modelResolver: ModelResolver;
  private retryOptions: LLMServiceOptions['retry'];
  private defaultTimeoutMs?: number;
  private providerEndpointRevisionProvider?: ProviderEndpointRevisionProvider;
  private cachePreparationStateByEndpointRevision: boolean;
  private preparationStateCache = new Map<string, PreparationStateCacheEntry>();
  private preparationStateAdapterIds =
    new WeakMap<ILLMClientAdapter, number>();
  private nextPreparationStateAdapterId = 1;
  private preparedCalls = new WeakMap<object, PreparedLLMRequest>();

  constructor(getApiKey: ApiKeyProvider, options: LLMServiceOptions = {}) {
    if (
      options.cachePreparationStateByEndpointRevision === true &&
      !options.providerEndpointRevisionProvider
    ) {
      throw new TypeError(
        "cachePreparationStateByEndpointRevision requires " +
          "providerEndpointRevisionProvider."
      );
    }
    this.getApiKey = getApiKey;
    this.retryOptions = options.retry;
    this.defaultTimeoutMs = options.timeoutMs;
    this.providerEndpointRevisionProvider =
      options.providerEndpointRevisionProvider;
    this.cachePreparationStateByEndpointRevision =
      options.cachePreparationStateByEndpointRevision === true;

    // Initialize logger - custom logger takes precedence over logLevel
    this.logger = options.logger ?? createDefaultLogger(options.logLevel);

    // Initialize services with logger
    this.presetManager = new PresetManager<ModelPreset>(
      defaultPresets as ModelPreset[],
      options.presets,
      options.presetMode
    );
    this.adapterRegistry = new AdapterRegistry<ILLMClientAdapter, ApiProviderId>({
      supportedProviders: SUPPORTED_PROVIDERS,
      fallbackAdapter: new MockClientAdapter(),
      adapterConstructors: ADAPTER_CONSTRUCTORS,
      adapterConfigs: ADAPTER_CONFIGS,
    }, this.logger);
    this.requestValidator = new RequestValidator(this.logger);
    this.settingsManager = new SettingsManager(this.logger);
    this.modelResolver = new ModelResolver(this.presetManager, this.adapterRegistry, this.logger);
  }

  /**
   * Gets list of supported LLM providers
   *
   * @returns Promise resolving to array of provider information
   */
  async getProviders(): Promise<ProviderInfo[]> {
    this.logger.debug("LLMService.getProviders called");
    return [...SUPPORTED_PROVIDERS]; // Return a copy to prevent external modification
  }

  /**
   * Gets list of supported models for a specific provider
   *
   * @param providerId - The provider ID to get models for
   * @returns Promise resolving to array of model information
   */
  async getModels(providerId: ApiProviderId): Promise<ModelInfo[]> {
    this.logger.debug(`LLMService.getModels called for provider: ${providerId}`);

    // Validate provider exists
    const models = getModelsByProvider(providerId);
    if (models.length === 0) {
      this.logger.warn(`Requested models for unsupported provider: ${providerId}`);
      return [];
    }

    this.logger.debug(`Found ${models.length} models for provider: ${providerId}`);
    return [...models]; // Return a copy to prevent external modification
  }

  /**
   * Gets static capability metadata for a provider/model pair without retrieving
   * API keys, calling provider adapters, or performing network I/O.
   *
   * Unknown or unregistered models use the same fallback model resolution policy
   * as sendMessage(), but their optional capabilities are reported as unknown.
   */
  async getModelCapabilities(
    providerId: ApiProviderId,
    modelId: string
  ): Promise<ModelCapabilitiesResult | LLMFailureResponse> {
    this.logger.debug(
      `LLMService.getModelCapabilities called for provider: ${providerId}, model: ${modelId}`
    );

    const resolved = await this.modelResolver.resolve(
      { providerId, modelId },
      { detectLocalCapabilities: false }
    );
    if (resolved.error) {
      return resolved.error;
    }

    const resolvedProviderId = resolved.providerId! as ApiProviderId;
    const resolvedModelId = resolved.modelId!;
    const modelInfo = resolved.modelInfo!;
    const source = this.getCapabilitySource(resolvedProviderId, resolvedModelId);
    const capabilities = this.buildModelCapabilities(modelInfo, source);

    return {
      object: "model.capabilities",
      provider: resolvedProviderId,
      model: resolvedModelId,
      modelInfo: { ...modelInfo },
      structuredOutput: capabilities.structuredOutput,
      capabilities,
    };
  }

  /**
   * Convenience wrapper for checking structured-output support.
   *
   * Returns `unknown` when genai-lite has no explicit capability metadata. Callers
   * should decide whether unknown is acceptable for their use case.
   */
  async supportsStructuredOutput(
    providerId: ApiProviderId,
    modelId: string
  ): Promise<StructuredOutputSupport | LLMFailureResponse> {
    const capabilities = await this.getModelCapabilities(providerId, modelId);
    if (capabilities.object === "error") {
      return capabilities;
    }
    return capabilities.structuredOutput;
  }

  /**
   * Preflights provider/model capability requirements for a request without
   * retrieving API keys, calling provider adapters, or performing network I/O.
   *
   * This checks the effective settings after preset and model defaults are
   * applied. Unknown/unspecified capabilities are reported as unknown and remain
   * valid; explicitly unsupported capabilities return the same validation error
   * shape as sendMessage() where possible.
   */
  async validateRequestCapabilities(
    request: LLMRequestCapabilityPreflight
  ): Promise<LLMRequestCapabilityValidationResult> {
    this.logger.debug(
      `LLMService.validateRequestCapabilities called with presetId: ${request.presetId}, provider: ${request.providerId}, model: ${request.modelId}`
    );

    try {
      const validation = await this.resolveAndValidateCapabilities(request, {
        validateStructure: false,
        detectLocalCapabilities: false,
      });

      if ("error" in validation) {
        return {
          ...validation.error,
          valid: false,
          ...(validation.capabilities && { capabilities: validation.capabilities }),
        };
      }

      return {
        object: "capability.validation",
        valid: true,
        provider: validation.context.providerId,
        model: validation.context.modelId,
        capabilities: validation.context.capabilities,
      };
    } catch (error) {
      this.logger.error("Error in LLMService.validateRequestCapabilities:", error);
      return {
        provider: request.providerId || request.presetId || 'unknown',
        model: request.modelId || request.presetId || 'unknown',
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Unexpected error during capability preflight",
          code: "UNKNOWN_ERROR",
          type: "server_error",
          providerError: error,
        },
        object: "error",
        valid: false,
      };
    }
  }

  /**
   * Sends a chat message to an LLM provider
   *
   * @param request - The LLM chat request
   * @returns Promise resolving to either success or failure response
   */
  async sendMessage(
    request: LLMChatRequest | LLMChatRequestWithPreset,
    callOptions?: SendMessageOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    this.logger.info(
      `LLMService.sendMessage called with presetId: ${(request as LLMChatRequestWithPreset).presetId}, provider: ${request.providerId}, model: ${request.modelId}`
    );

    const canonical = await this.prepareMessage(request, { mode: "complete" });
    if (this.isFailureResponse(canonical)) {
      return canonical;
    }
    return this.sendPrepared(canonical, callOptions);

  }

  /**
   * Resolves and freezes the final semantic provider request without retrieving
   * credentials or creating transport state.
   */
  async prepareMessage<TMode extends PreparedCallMode>(
    request: LLMChatRequest | LLMChatRequestWithPreset,
    options: PrepareMessageOptions<TMode>
  ): Promise<PrepareMessageResult<TMode>> {
    if (
      !options ||
      (options.mode !== "complete" && options.mode !== "stream")
    ) {
      return this.createPreparedFailure(
        request.providerId ?? "unknown",
        request.modelId ?? "unknown",
        ADAPTER_ERROR_CODES.INVALID_PREPARED_CALL,
        "Prepared-call mode must be either 'complete' or 'stream'.",
        "validation_error"
      );
    }
    const result = await this.prepareCanonicalRequest(request, options.mode);
    if ("error" in result) {
      return result.error;
    }

    const handle = Object.create(null) as PreparedCall<TMode>;
    Object.defineProperties(handle, {
      mode: {
        value: options.mode,
        enumerable: true,
        configurable: false,
        writable: false,
      },
      toJSON: {
        value: () => {
          throw new TypeError("Prepared LLM calls cannot be serialized.");
        },
        enumerable: false,
        configurable: false,
        writable: false,
      },
    });
    Object.freeze(handle);
    this.preparedCalls.set(handle, result.prepared);
    return handle;
  }

  /** Returns the immutable inspection view for a service-owned prepared call. */
  async inspectPrepared(
    handle: PreparedCall<PreparedCallMode>
  ): Promise<PreparedRequestInspection | LLMFailureResponse> {
    const prepared = this.preparedCalls.get(handle as object);
    if (!prepared) {
      return this.createPreparedHandleError(
        handle,
        ADAPTER_ERROR_CODES.INVALID_PREPARED_CALL,
        "The prepared call is invalid, forged, or belongs to another LLMService instance."
      );
    }

    return deepFreeze({
      provider: prepared.providerId,
      model: prepared.modelId,
      mode: prepared.adapterPrepared.mode,
      request: structuredClone(prepared.adapterPrepared.requestView),
      promptAccounting: structuredClone(
        prepared.adapterPrepared.promptAccounting
      ),
      ...(prepared.adapterPrepared.outputTokenLimit && {
        outputTokenLimit: structuredClone(
          prepared.adapterPrepared.outputTokenLimit
        ),
      }),
      bindings: structuredClone(prepared.adapterPrepared.bindings),
    });
  }

  /** Dispatches a reusable complete-mode prepared call. */
  async sendPrepared(
    handle: PreparedCompleteCall,
    callOptions?: SendMessageOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    const resolved = this.resolvePreparedHandle(handle, "complete");
    if ("error" in resolved) {
      return resolved.error;
    }
    const prepared = resolved.prepared;
    const adapter = prepared.clientAdapter;
    if (!adapter.sendPrepared) {
      return this.createPreparedFailure(
        prepared.providerId,
        prepared.modelId,
        ADAPTER_ERROR_CODES.PREPARED_CALL_UNSUPPORTED,
        `Prepared calls are not supported for provider '${prepared.providerId}'.`,
        "unsupported_feature"
      );
    }

    const apiKey = await this.resolveDispatchApiKey(prepared);
    if (this.isFailureResponse(apiKey)) {
      return apiKey;
    }
    const adapterOptions = this.createAdapterOptions(callOptions);
    const retryOnTimeout = this.retryOptions?.retryOnTimeout ?? true;
    const retryableCodes = new Set<string>([
      ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED,
      ADAPTER_ERROR_CODES.NETWORK_ERROR,
      ...(retryOnTimeout ? [ADAPTER_ERROR_CODES.REQUEST_TIMEOUT] : []),
    ]);

    try {
      const result = await withRetry(
        async () => {
          const revalidation = await this.revalidatePrepared(
            prepared,
            adapterOptions
          );
          if (revalidation) {
            return revalidation;
          }
          return adapter.sendPrepared!(
            prepared.adapterPrepared,
            apiKey,
            adapterOptions
          );
        },
        (response) => {
          if (response.object !== "error") {
            return { retry: false };
          }
          const code = String(response.error.code);
          const status = response.error.status;
          return {
            retry:
              retryableCodes.has(code) ||
              (code === ADAPTER_ERROR_CODES.PROVIDER_ERROR &&
                typeof status === "number" &&
                (status === 408 || status === 409 || status >= 500)),
            retryAfterMs: response.error.retryAfterMs,
          };
        },
        {
          ...this.retryOptions,
          ...(callOptions?.maxRetries !== undefined && {
            maxRetries: callOptions.maxRetries,
          }),
          signal: callOptions?.signal,
          logger: this.logger,
          label: `${prepared.providerId}/${prepared.modelId}`,
        }
      );
      return this.postProcessResponse(result, prepared);
    } catch (error) {
      return this.createUnexpectedDispatchFailure(prepared, error);
    }
  }

  /**
   * Streams a chat message from an LLM provider.
   *
   * The final `complete` event contains the same normalized response shape as
   * sendMessage(). Validation/API key failures and unsupported streaming adapters
   * are yielded as a single `error` event.
   */
  async *streamMessage(
    request: LLMChatRequest | LLMChatRequestWithPreset,
    callOptions?: StreamMessageOptions
  ): AsyncGenerator<LLMServiceStreamEvent> {
    const attemptId = randomUUID();
    this.logger.info(
      `LLMService.streamMessage called with presetId: ${(request as LLMChatRequestWithPreset).presetId}, provider: ${request.providerId}, model: ${request.modelId}`
    );

    const canonical = await this.prepareMessage(request, { mode: "stream" });
    if (this.isFailureResponse(canonical)) {
      yield { attemptId, type: "error", error: canonical };
      return;
    }
    yield* this.streamPreparedWithAttempt(canonical, callOptions, attemptId);
    return;

  }

  /** Dispatches a reusable stream-mode prepared call with no automatic retries. */
  async *streamPrepared(
    handle: PreparedStreamCall,
    callOptions?: StreamMessageOptions
  ): AsyncGenerator<LLMServiceStreamEvent> {
    yield* this.streamPreparedWithAttempt(handle, callOptions, randomUUID());
  }

  private async *streamPreparedWithAttempt(
    handle: PreparedStreamCall,
    callOptions: StreamMessageOptions | undefined,
    attemptId: string
  ): AsyncGenerator<LLMServiceStreamEvent> {
    const resolved = this.resolvePreparedHandle(handle, "stream");
    if ("error" in resolved) {
      yield { attemptId, type: "error", error: resolved.error };
      return;
    }
    const prepared = resolved.prepared;
    const adapter = prepared.clientAdapter;
    if (!adapter.streamPrepared) {
      yield {
        attemptId,
        type: "error",
        error: this.createPreparedFailure(
          prepared.providerId,
          prepared.modelId,
          ADAPTER_ERROR_CODES.PREPARED_CALL_UNSUPPORTED,
          `Prepared streaming is not supported for provider '${prepared.providerId}'.`,
          "unsupported_feature"
        ),
      };
      return;
    }

    const apiKey = await this.resolveDispatchApiKey(prepared);
    if (this.isFailureResponse(apiKey)) {
      yield { attemptId, type: "error", error: apiKey };
      return;
    }

    const cancellation = new AbortController();
    const signal = callOptions?.signal
      ? AbortSignal.any([callOptions.signal, cancellation.signal])
      : cancellation.signal;
    const adapterOptions = this.createAdapterOptions({
      ...callOptions,
      signal,
    });
    const partialState: StreamPartialState = {
      provider: prepared.providerId,
      model: prepared.modelId,
      started: false,
      choices: new Map(),
    };
    let iterator: AsyncIterator<AdapterLLMStreamEvent> | undefined;
    let terminal = false;
    try {
      const revalidation = await this.revalidatePrepared(
        prepared,
        adapterOptions
      );
      if (revalidation) {
        yield { attemptId, type: "error", error: revalidation };
        return;
      }

      iterator = adapter
        .streamPrepared(prepared.adapterPrepared, apiKey, adapterOptions)
        [Symbol.asyncIterator]();
      while (!terminal) {
        const step = await this.nextStreamEvent(iterator, signal);
        if (step.done) {
          break;
        }
        const event = step.value;
        this.observeStreamPartial(partialState, event);
        if (event.type === "adapter_evidence") {
          continue;
        }
        if (event.type === "complete") {
          const processed = this.postProcessResponse(event.response, prepared);
          if (processed.object === "error") {
            const failure = this.finalizeStreamFailure(
              processed,
              partialState,
              attemptId,
              prepared
            );
            terminal = true;
            yield {
              attemptId,
              type: "error",
              error: failure,
            };
          } else {
            terminal = true;
            yield { attemptId, type: "complete", response: processed };
          }
          break;
        }
        if (event.type === "error") {
          const failure = this.finalizeStreamFailure(
            event.error,
            partialState,
            attemptId,
            prepared
          );
          terminal = true;
          yield {
            attemptId,
            type: "error",
            error: failure,
          };
          break;
        }
        const {
          observedEvidence: _observedEvidence,
          ...publicEvent
        } = event;
        yield { ...publicEvent, attemptId } as LLMServiceStreamEvent;
      }

      if (!terminal) {
        terminal = true;
        const aborted = signal.aborted;
        yield {
          attemptId,
          type: "error",
          error: this.finalizeStreamFailure(
            this.createPreparedFailure(
              prepared.providerId,
              prepared.modelId,
              aborted
                ? ADAPTER_ERROR_CODES.REQUEST_ABORTED
                : ADAPTER_ERROR_CODES.PROVIDER_ERROR,
              aborted
                ? "The streaming request was aborted."
                : "The provider stream ended without a terminal event.",
              aborted ? "abort_error" : "server_error"
            ),
            partialState,
            attemptId,
            prepared
          ),
        };
      }
    } catch (error) {
      if (!terminal) {
        terminal = true;
        const aborted = signal.aborted;
        yield {
          attemptId,
          type: "error",
          error: this.finalizeStreamFailure(
            this.createPreparedFailure(
              prepared.providerId,
              prepared.modelId,
              aborted
                ? ADAPTER_ERROR_CODES.REQUEST_ABORTED
                : ADAPTER_ERROR_CODES.PROVIDER_ERROR,
              aborted
                ? "The streaming request was aborted."
                : error instanceof Error
                  ? error.message
                  : "An unknown streaming error occurred.",
              aborted ? "abort_error" : "server_error",
              error
            ),
            partialState,
            attemptId,
            prepared
          ),
        };
      }
    } finally {
      cancellation.abort();
      if (iterator?.return) {
        try {
          void Promise.resolve(iterator.return()).catch(() => undefined);
        } catch {
          // Iterator cleanup is best-effort and must never replace the terminal.
        }
      }
    }
  }

  private async resolveAndValidateCapabilities(
    request: LLMChatRequest | LLMChatRequestWithPreset | LLMRequestCapabilityPreflight,
    options: {
      validateStructure: boolean;
      detectLocalCapabilities: boolean;
      adapterPreparationState?: unknown;
    }
  ): Promise<
    { context: CapabilityValidationContext } |
    { error: LLMFailureResponse; capabilities?: ModelCapabilities }
  > {
    const resolved = await this.modelResolver.resolve(request, {
      detectLocalCapabilities: options.detectLocalCapabilities,
      ...(options.adapterPreparationState !== undefined && {
        adapterPreparationState: options.adapterPreparationState,
      }),
    });
    if (resolved.error) {
      return { error: resolved.error };
    }

    const providerId = resolved.providerId! as ApiProviderId;
    const modelId = resolved.modelId!;
    const modelInfo = resolved.modelInfo!;
    const source = this.getCapabilitySource(providerId, modelId);
    const capabilities = this.buildModelCapabilities(modelInfo, source);

    const resolvedRequest: LLMChatRequest = {
      ...(request as Partial<LLMChatRequest>),
      providerId,
      modelId,
      messages: "messages" in request && Array.isArray(request.messages)
        ? request.messages
        : [],
    };

    if (options.validateStructure) {
      const structureValidationResult = this.requestValidator.validateRequestStructure(resolvedRequest);
      if (structureValidationResult) {
        return { error: structureValidationResult, capabilities };
      }
    }

    const combinedSettings = {
      ...(resolved.settings || {}),
      ...(request.settings || {}),
    };

    const settingsValidation = this.requestValidator.validateSettings(
      combinedSettings,
      providerId,
      modelId
    );
    if (settingsValidation) {
      return { error: settingsValidation, capabilities };
    }

    const finalSettings = this.settingsManager.mergeSettingsForModel(
      modelId,
      providerId,
      combinedSettings,
      modelInfo
    );

    const reasoningValidation = this.requestValidator.validateReasoningSettings(
      modelInfo,
      finalSettings.reasoning,
      resolvedRequest
    );
    if (reasoningValidation) {
      return { error: reasoningValidation, capabilities };
    }

    const structuredOutputValidation = this.requestValidator.validateStructuredOutputSettings(
      modelInfo,
      finalSettings.structuredOutput,
      resolvedRequest
    );
    if (structuredOutputValidation) {
      return { error: structuredOutputValidation, capabilities };
    }

    return {
      context: {
        providerId,
        modelId,
        modelInfo,
        resolvedRequest,
        finalSettings,
        capabilities,
        ...(resolved.adapterPreparationState !== undefined && {
          adapterPreparationState: resolved.adapterPreparationState,
        }),
      },
    };
  }

  private buildModelCapabilities(
    modelInfo: ModelInfo,
    source: CapabilitySource
  ): ModelCapabilities {
    const structuredOutput = this.getStructuredOutputSupport(modelInfo, source);
    const tokenProfile = resolveContentTokenProfile(
      modelInfo.providerId,
      modelInfo.id
    );
    const reportsUsage =
      modelInfo.providerId === "openai" ||
      modelInfo.providerId === "anthropic" ||
      modelInfo.providerId === "gemini" ||
      modelInfo.providerId === "mistral" ||
      modelInfo.providerId === "openrouter" ||
      modelInfo.providerId === "llamacpp";
    return {
      structuredOutput,
      ...(modelInfo.contextWindow !== undefined && {
        contextWindow: {
          tokens: modelInfo.contextWindow,
          source,
        },
      }),
      contentTokenCounting:
        tokenProfile.status === "available"
          ? tokenProfile.profile.quality
          : "unavailable",
      preparedMessageTokenCounting:
        modelInfo.providerId === "llamacpp" ? "runtime" : "unavailable",
      ...(tokenProfile.status === "available" && {
        tokenProfileId: tokenProfile.profile.id,
        tokenProfileMappingRevision: tokenProfile.mappingRevision,
      }),
      ...(reportsUsage && {
        reportsPromptUsage: true,
        reportsCompletionUsage: true,
      }),
      distinguishesLimitCause:
        modelInfo.providerId === "anthropic" ||
        modelInfo.providerId === "gemini",
      structuredOutputDelivery: {
        native: structuredOutput,
        prompt: "instruction_only",
      },
    };
  }

  private getStructuredOutputSupport(
    modelInfo: ModelInfo,
    source: CapabilitySource
  ): StructuredOutputSupport {
    if (modelInfo.structuredOutput === undefined) {
      return {
        status: "unknown",
        source,
      };
    }

    return {
      status: modelInfo.structuredOutput.supported ? "supported" : "unsupported",
      ...(modelInfo.structuredOutput.strictMode !== undefined && {
        strictMode: modelInfo.structuredOutput.strictMode,
      }),
      ...(modelInfo.structuredOutput.notes && {
        notes: modelInfo.structuredOutput.notes,
      }),
      source,
    };
  }

  private getCapabilitySource(
    providerId: ApiProviderId,
    modelId: string
  ): CapabilitySource {
    return getModelById(modelId, providerId) ? "registry" : "fallback";
  }

  private isFailureResponse(value: unknown): value is LLMFailureResponse {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as { object?: unknown }).object === "error"
    );
  }

  private createPreparedFailure(
    provider: string,
    model: string,
    code: string,
    message: string,
    type: string,
    providerError?: unknown
  ): LLMFailureResponse {
    return {
      provider,
      model,
      error: {
        message,
        code,
        type,
        ...(providerError !== undefined && { providerError }),
      },
      object: "error",
    };
  }

  private createPreparedHandleError(
    handle: unknown,
    code: string,
    message: string
  ): LLMFailureResponse {
    const mode =
      typeof handle === "object" && handle !== null && "mode" in handle
        ? String((handle as { mode?: unknown }).mode ?? "unknown")
        : "unknown";
    return this.createPreparedFailure(
      "unknown",
      "unknown",
      code,
      message,
      mode === "unknown" ? "invalid_request_error" : "validation_error"
    );
  }

  private resolvePreparedHandle(
    handle: unknown,
    expectedMode: PreparedCallMode
  ):
    | { prepared: PreparedLLMRequest }
    | { error: LLMFailureResponse } {
    if (
      (typeof handle !== "object" && typeof handle !== "function") ||
      handle === null
    ) {
      return {
        error: this.createPreparedHandleError(
          handle,
          ADAPTER_ERROR_CODES.INVALID_PREPARED_CALL,
          "The prepared call is invalid or forged."
        ),
      };
    }
    const prepared = this.preparedCalls.get(handle as object);
    if (!prepared) {
      return {
        error: this.createPreparedHandleError(
          handle,
          ADAPTER_ERROR_CODES.INVALID_PREPARED_CALL,
          "The prepared call is invalid, forged, or belongs to another LLMService instance."
        ),
      };
    }
    if (prepared.adapterPrepared.mode !== expectedMode) {
      return {
        error: this.createPreparedFailure(
          prepared.providerId,
          prepared.modelId,
          ADAPTER_ERROR_CODES.PREPARED_CALL_MODE_MISMATCH,
          `A '${prepared.adapterPrepared.mode}' prepared call cannot be dispatched as '${expectedMode}'.`,
          "validation_error"
        ),
      };
    }
    return { prepared };
  }

  private async resolveDispatchApiKey(
    prepared: PreparedLLMRequest
  ): Promise<string | LLMFailureResponse> {
    try {
      const apiKey = await this.getApiKey(prepared.providerId);
      if (!apiKey) {
        return this.createPreparedFailure(
          prepared.providerId,
          prepared.modelId,
          "API_KEY_ERROR",
          `API key for provider '${prepared.providerId}' could not be retrieved. Ensure your ApiKeyProvider is configured correctly.`,
          "authentication_error"
        );
      }
      if (
        prepared.clientAdapter.validateApiKey &&
        !prepared.clientAdapter.validateApiKey(apiKey)
      ) {
        return this.createPreparedFailure(
          prepared.providerId,
          prepared.modelId,
          ADAPTER_ERROR_CODES.INVALID_API_KEY,
          `Invalid API key format for provider '${prepared.providerId}'. Please check your API key.`,
          "authentication_error"
        );
      }
      return apiKey;
    } catch (error) {
      return this.createPreparedFailure(
        prepared.providerId,
        prepared.modelId,
        ADAPTER_ERROR_CODES.PROVIDER_ERROR,
        error instanceof Error
          ? error.message
          : "An unknown error occurred while retrieving credentials.",
        "server_error",
        error
      );
    }
  }

  private createAdapterOptions(
    callOptions?: StreamMessageOptions
  ): AdapterRequestOptions {
    const timeoutMs = callOptions?.timeoutMs ?? this.defaultTimeoutMs;
    return {
      ...(callOptions?.signal && { signal: callOptions.signal }),
      ...(timeoutMs !== undefined && { timeoutMs }),
    };
  }

  private async revalidatePrepared(
    prepared: PreparedLLMRequest,
    options: AdapterRequestOptions
  ): Promise<LLMFailureResponse | undefined> {
    if (prepared.clientAdapter.revalidatePreparedRequest) {
      const result = await prepared.clientAdapter.revalidatePreparedRequest(
        prepared.adapterPrepared,
        options
      );
      if (!result.valid) {
        if (
          result.error.error.code ===
          ADAPTER_ERROR_CODES.PREPARED_CALL_STALE
        ) {
          this.evictPreparationStateCache(
            prepared.providerId,
            prepared.modelId,
            prepared.clientAdapter
          );
        }
        return result.error;
      }
    }
    const endpointError =
      await this.revalidateProviderEndpointRevision(prepared);
    if (
      endpointError?.error.code ===
      ADAPTER_ERROR_CODES.PREPARED_CALL_STALE
    ) {
      this.evictPreparationStateCache(
        prepared.providerId,
        prepared.modelId,
        prepared.clientAdapter
      );
    }
    return endpointError;
  }

  private isValidProviderEndpointRevision(
    revision: unknown
  ): revision is ProviderEndpointRevision {
    return (
      (typeof revision === "string" && revision.length > 0) ||
      (typeof revision === "number" && Number.isFinite(revision))
    );
  }

  private createStaleEndpointRevisionFailure(
    providerId: ApiProviderId,
    modelId: string,
    message: string,
    cause?: unknown
  ): LLMFailureResponse {
    return this.createPreparedFailure(
      providerId,
      modelId,
      ADAPTER_ERROR_CODES.PREPARED_CALL_STALE,
      message,
      "validation_error",
      cause
    );
  }

  private getPreparationStateAdapterId(
    adapter: ILLMClientAdapter
  ): number {
    let id = this.preparationStateAdapterIds.get(adapter);
    if (id === undefined) {
      id = this.nextPreparationStateAdapterId;
      this.nextPreparationStateAdapterId += 1;
      this.preparationStateAdapterIds.set(adapter, id);
    }
    return id;
  }

  private encodeProviderEndpointRevision(
    revision: ProviderEndpointRevision
  ): string {
    if (typeof revision === "string") {
      return `string:${JSON.stringify(revision)}`;
    }
    return Object.is(revision, -0)
      ? "number:-0"
      : `number:${String(revision)}`;
  }

  private getPreparationStateCacheKeys(
    adapter: ILLMClientAdapter,
    providerId: ApiProviderId,
    modelId: string,
    revision: ProviderEndpointRevision
  ): { key: string; endpointKey: string } {
    const endpointKey = JSON.stringify([
      this.getPreparationStateAdapterId(adapter),
      providerId,
      modelId,
    ]);
    return {
      endpointKey,
      key: `${endpointKey}:${this.encodeProviderEndpointRevision(revision)}`,
    };
  }

  private evictPreparationStateCache(
    providerId: ApiProviderId,
    modelId: string,
    adapter?: ILLMClientAdapter
  ): void {
    for (const [key, entry] of this.preparationStateCache) {
      if (
        entry.providerId === providerId &&
        entry.modelId === modelId &&
        (adapter === undefined || entry.adapter === adapter)
      ) {
        this.preparationStateCache.delete(key);
      }
    }
  }

  private trimPreparationStateCache(): void {
    while (
      this.preparationStateCache.size >
      PREPARATION_STATE_CACHE_MAX_ENDPOINTS
    ) {
      const oldestKey = this.preparationStateCache.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.preparationStateCache.delete(oldestKey);
    }
  }

  private async acquirePreparationStateCacheLease(
    adapter: ILLMClientAdapter,
    providerId: ApiProviderId,
    modelId: string,
    revision: ProviderEndpointRevision
  ): Promise<PreparationStateCacheLease | undefined> {
    if (!adapter.getPreparationSnapshot) {
      return undefined;
    }

    const { key, endpointKey } = this.getPreparationStateCacheKeys(
      adapter,
      providerId,
      modelId,
      revision
    );
    for (const [cachedKey, cached] of this.preparationStateCache) {
      const replacedAdapter =
        cached.providerId === providerId && cached.adapter !== adapter;
      const olderRevision =
        cached.endpointKey === endpointKey &&
        !Object.is(cached.revision, revision);
      if (replacedAdapter || olderRevision) {
        this.preparationStateCache.delete(cachedKey);
      }
    }

    let entry = this.preparationStateCache.get(key);
    if (!entry) {
      const getSnapshot = adapter.getPreparationSnapshot.bind(adapter);
      const statePromise = Promise.resolve().then(() =>
        getSnapshot(modelId)
      );
      entry = {
        key,
        endpointKey,
        adapter,
        providerId,
        modelId,
        revision,
        statePromise,
        published: false,
        activeLeases: 0,
      };
      this.preparationStateCache.set(key, entry);
      this.trimPreparationStateCache();
    } else {
      this.preparationStateCache.delete(key);
      this.preparationStateCache.set(key, entry);
    }

    entry.activeLeases += 1;
    try {
      const state = entry.state ?? await entry.statePromise;
      entry.state = state;
      return { entry, state, released: false };
    } catch (error) {
      entry.activeLeases -= 1;
      if (this.preparationStateCache.get(key) === entry) {
        this.preparationStateCache.delete(key);
      }
      throw error;
    }
  }

  private releasePreparationStateCacheLease(
    lease: PreparationStateCacheLease | undefined,
    publish: boolean
  ): void {
    if (!lease || lease.released) {
      return;
    }
    lease.released = true;
    const { entry, state } = lease;
    let cacheable = false;
    if (publish) {
      try {
        cacheable =
          entry.adapter.isPreparationSnapshotCacheable?.(
            state,
            entry.modelId
          ) === true;
      } catch {
        cacheable = false;
      }
    }
    if (
      cacheable &&
      this.preparationStateCache.get(entry.key) === entry
    ) {
      entry.published = true;
      this.preparationStateCache.delete(entry.key);
      this.preparationStateCache.set(entry.key, entry);
    }
    entry.activeLeases -= 1;
    if (
      !entry.published &&
      entry.activeLeases === 0 &&
      this.preparationStateCache.get(entry.key) === entry
    ) {
      this.preparationStateCache.delete(entry.key);
    }
  }

  private async captureProviderEndpointRevision(
    providerId: ApiProviderId,
    modelId: string
  ): Promise<ProviderEndpointRevision | LLMFailureResponse | undefined> {
    if (!this.providerEndpointRevisionProvider) {
      return undefined;
    }
    try {
      const revision = await this.providerEndpointRevisionProvider({
        providerId,
        modelId,
      });
      if (!this.isValidProviderEndpointRevision(revision)) {
        return this.createStaleEndpointRevisionFailure(
          providerId,
          modelId,
          "The configured provider endpoint revision is missing during preparation."
        );
      }
      return revision;
    } catch (error) {
      return this.createStaleEndpointRevisionFailure(
        providerId,
        modelId,
        "The configured provider endpoint revision could not be read during preparation.",
        error
      );
    }
  }

  private getProviderEndpointRevisionContext(
    request: LLMChatRequest | LLMChatRequestWithPreset
  ): { providerId: ApiProviderId; modelId: string } | undefined {
    const presetId = (request as LLMChatRequestWithPreset).presetId;
    if (presetId) {
      const preset = this.presetManager.resolvePreset(presetId);
      return preset
        ? {
            providerId: preset.providerId,
            modelId: preset.modelId,
          }
        : undefined;
    }
    return request.providerId && request.modelId
      ? {
          providerId: request.providerId,
          modelId: request.modelId,
        }
      : undefined;
  }

  private async revalidateProviderEndpointRevision(
    prepared: PreparedLLMRequest
  ): Promise<LLMFailureResponse | undefined> {
    if (!this.providerEndpointRevisionProvider) {
      return undefined;
    }
    const expected =
      prepared.adapterPrepared.bindings.providerEndpointRevision;
    try {
      const current = await this.providerEndpointRevisionProvider({
        providerId: prepared.providerId,
        modelId: prepared.modelId,
      });
      if (
        !this.isValidProviderEndpointRevision(current) ||
        !this.isValidProviderEndpointRevision(expected) ||
        !Object.is(current, expected)
      ) {
        return this.createStaleEndpointRevisionFailure(
          prepared.providerId,
          prepared.modelId,
          "The provider endpoint revision is missing or changed after preparation."
        );
      }
      return undefined;
    } catch (error) {
      return this.createStaleEndpointRevisionFailure(
        prepared.providerId,
        prepared.modelId,
        "The provider endpoint revision could not be revalidated before dispatch.",
        error
      );
    }
  }

  private async nextStreamEvent(
    iterator: AsyncIterator<AdapterLLMStreamEvent>,
    signal: AbortSignal
  ): Promise<IteratorResult<AdapterLLMStreamEvent>> {
    if (signal.aborted) {
      throw new Error("Streaming request aborted");
    }
    return new Promise<IteratorResult<AdapterLLMStreamEvent>>(
      (resolve, reject) => {
        const onAbort = () => {
          reject(new Error("Streaming request aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        Promise.resolve(iterator.next()).then(
          (result) => {
            signal.removeEventListener("abort", onAbort);
            resolve(result);
          },
          (error) => {
            signal.removeEventListener("abort", onAbort);
            reject(error);
          }
        );
      }
    );
  }

  private observeStreamPartial(
    state: StreamPartialState,
    event: AdapterLLMStreamEvent
  ): void {
    const observed = event.observedEvidence;
    if (observed?.choice) {
      const choice = this.getStreamPartialChoice(
        state,
        observed.choice.index
      );
      if (observed.choice.rawContentDelta !== undefined) {
        choice.rawContent =
          (choice.rawContent ?? "") + observed.choice.rawContentDelta;
      }
      if (observed.choice.rawContentParts) {
        choice.rawContentParts = [
          ...(choice.rawContentParts ?? []),
          ...observed.choice.rawContentParts,
        ];
      }
      if (
        observed.choice.answerAccounting ||
        observed.choice.rawAnswerAccounting
      ) {
        choice.answerAccounting = mergeAnswerAccountingByScope(
          choice.answerAccounting,
          observed.choice.answerAccounting,
          observed.choice.rawAnswerAccounting
        );
        choice.rawAnswerAccounting =
          choice.answerAccounting?.rawContent;
      }
      if (observed.choice.finishReason !== undefined) {
        choice.finishReason = observed.choice.finishReason;
      }
      if (observed.choice.termination) {
        choice.termination = observed.choice.termination;
      }
    }
    if (observed?.usageEvidence) {
      state.usageEvidence = {
        ...(state.usageEvidence ?? {}),
        ...observed.usageEvidence,
      };
    }
    if (observed?.usage) {
      state.usage = {
        ...(state.usage ?? {}),
        ...Object.fromEntries(
          Object.entries(observed.usage).filter(
            ([, value]) => value !== undefined
          )
        ),
      };
    }
    if (event.type === "adapter_evidence") {
      return;
    }
    if (event.type === "start") {
      state.started = true;
      state.provider = event.provider;
      state.model = event.model;
      state.id = event.id;
      state.created = event.created;
      return;
    }
    if (event.type === "content_delta" || event.type === "reasoning_delta") {
      const choice = this.getStreamPartialChoice(state, event.index);
      if (event.type === "content_delta") {
        choice.content += event.delta;
      } else {
        choice.reasoning += event.delta;
      }
      return;
    }
    if (event.type === "usage") {
      state.usage = {
        ...(state.usage ?? {}),
        ...Object.fromEntries(
          Object.entries(event.usage).filter(
            ([, value]) => value !== undefined
          )
        ),
      };
    }
  }

  private getStreamPartialChoice(
    state: StreamPartialState,
    index: number
  ): StreamPartialChoiceState {
    let choice = state.choices.get(index);
    if (!choice) {
      choice = { content: "", reasoning: "" };
      state.choices.set(index, choice);
    }
    return choice;
  }

  private finalizeStreamFailure(
    failure: LLMFailureResponse,
    state: StreamPartialState,
    attemptId: string,
    prepared: PreparedLLMRequest
  ): LLMFailureResponse {
    const processed = this.postProcessResponse(
      this.attachStreamPartial(failure, state, attemptId),
      prepared
    );
    return processed as LLMFailureResponse;
  }

  private attachStreamPartial(
    failure: LLMFailureResponse,
    state: StreamPartialState,
    attemptId: string
  ): LLMFailureResponse {
    const hasEvidence =
      state.started ||
      state.choices.size > 0 ||
      state.usage !== undefined ||
      state.usageEvidence !== undefined;
    if (!hasEvidence) {
      return failure;
    }

    const choices = Array.from(state.choices.entries())
      .sort(([left], [right]) => left - right)
      .map(([index, choice]) => ({
        index,
        message: {
          role: "assistant" as const,
          content: choice.content,
        },
        ...(choice.reasoning.length > 0 && {
          reasoning: choice.reasoning,
        }),
        ...(choice.rawContent !== undefined && {
          rawContent: choice.rawContent,
        }),
        ...(choice.rawContentParts && {
          rawContentParts: choice.rawContentParts,
        }),
        ...(choice.answerAccounting && {
          answerAccounting: choice.answerAccounting,
        }),
        ...(choice.rawAnswerAccounting && {
          rawAnswerAccounting: choice.rawAnswerAccounting,
        }),
        finish_reason: choice.finishReason ?? null,
        termination: choice.termination ?? {
          rawReason: null,
          kind: "unknown" as const,
        },
      }));
    const observed: Omit<LLMResponse, "object"> = {
      id: state.id ?? attemptId,
      provider: state.provider,
      model: state.model,
      created: state.created ?? Math.floor(Date.now() / 1000),
      choices,
      ...(state.usage && { usage: state.usage }),
      ...(state.usageEvidence && {
        usageEvidence: state.usageEvidence,
      }),
    };
    if (!failure.partialResponse) {
      return { ...failure, partialResponse: observed };
    }

    const provided = failure.partialResponse;
    const choicesByIndex = new Map(
      observed.choices.map((choice, position) => [
        choice.index ?? position,
        choice,
      ])
    );
    for (const [position, choice] of provided.choices.entries()) {
      const index = choice.index ?? position;
      const prior = choicesByIndex.get(index);
      const answerAccounting = mergeAnswerAccountingByScope(
        prior?.answerAccounting,
        choice.answerAccounting,
        choice.rawAnswerAccounting
      );
      choicesByIndex.set(index, {
        ...(prior ?? {}),
        ...choice,
        message: {
          ...(prior?.message ?? { role: "assistant", content: "" }),
          ...choice.message,
        },
        ...(choice.rawContentParts === undefined &&
          prior?.rawContentParts && {
            rawContentParts: prior.rawContentParts,
          }),
        ...(answerAccounting && {
          answerAccounting,
          ...(answerAccounting.rawContent && {
            rawAnswerAccounting: answerAccounting.rawContent,
          }),
        }),
      });
    }
    const usage = {
      ...(observed.usage ?? {}),
      ...Object.fromEntries(
        Object.entries(provided.usage ?? {}).filter(
          ([, value]) => value !== undefined
        )
      ),
    };
    const usageEvidence = {
      ...(observed.usageEvidence ?? {}),
      ...Object.fromEntries(
        Object.entries(provided.usageEvidence ?? {}).filter(
          ([, value]) => value !== undefined
        )
      ),
    };
    return {
      ...failure,
      partialResponse: {
        ...observed,
        ...provided,
        choices: Array.from(choicesByIndex.entries())
          .sort(([left], [right]) => left - right)
          .map(([, choice]) => choice),
        ...(Object.keys(usage).length > 0 && { usage }),
        ...(Object.keys(usageEvidence).length > 0 && {
          usageEvidence,
        }),
      },
    };
  }

  private isValidPreparedAccounting(
    accounting: PreparedPromptAccounting
  ): boolean {
    if (accounting.status === "unavailable") {
      return true;
    }
    return accounting.count !== undefined || accounting.upperBound !== undefined;
  }

  private createEffectiveOutputTokenLimit(
    request: LLMChatRequest | LLMChatRequestWithPreset,
    providerId: ApiProviderId,
    modelInfo: ModelInfo,
    filteredMaxTokens: number | undefined
  ): EffectiveOutputTokenLimit | undefined {
    if (
      filteredMaxTokens === undefined ||
      !Number.isSafeInteger(filteredMaxTokens) ||
      filteredMaxTokens <= 0
    ) {
      return undefined;
    }

    const presetId = (request as LLMChatRequestWithPreset).presetId;
    const preset = presetId
      ? this.presetManager
          .getPresets()
          .find((candidate) => candidate.id === presetId)
      : undefined;
    const source: EffectiveOutputTokenLimit["source"] =
      request.settings?.maxTokens !== undefined
        ? "request"
        : preset?.settings.maxTokens !== undefined
          ? "preset"
          : modelInfo.defaultSettings?.maxTokens !== undefined ||
              modelInfo.maxTokens !== undefined
            ? "model_default"
            : "library_default";
    const hardLimit = modelInfo.hardOutputTokenLimit;
    const tokens = hardLimit
      ? Math.min(filteredMaxTokens, hardLimit.tokens)
      : filteredMaxTokens;
    const counts: EffectiveOutputTokenLimit["counts"] =
      hardLimit?.counts ??
      (providerId === "mistral"
        ? "visible_output"
        : providerId === "openrouter"
          ? "provider_defined"
          : providerId === "openai" ||
              providerId === "anthropic" ||
              providerId === "gemini" ||
              providerId === "llamacpp"
            ? "visible_and_reasoning"
            : "unknown");

    return {
      tokens,
      source,
      ...(tokens !== filteredMaxTokens && {
        requestedTokens: filteredMaxTokens,
        clamp: {
          tokens,
          source: hardLimit!.source,
        },
      }),
      counts,
    };
  }

  private createUnexpectedDispatchFailure(
    prepared: PreparedLLMRequest,
    error: unknown
  ): LLMFailureResponse {
    return this.createPreparedFailure(
      prepared.providerId,
      prepared.modelId,
      ADAPTER_ERROR_CODES.PROVIDER_ERROR,
      error instanceof Error
        ? error.message
        : "An unknown error occurred during prepared dispatch.",
      "server_error",
      error
    );
  }

  private async prepareCanonicalRequest(
    request: LLMChatRequest | LLMChatRequestWithPreset,
    mode: PreparedCallMode
  ): Promise<{ prepared: PreparedLLMRequest } | { error: LLMFailureResponse }> {
    const endpointRevisionContext =
      this.getProviderEndpointRevisionContext(request);
    const endpointRevision = endpointRevisionContext
      ? await this.captureProviderEndpointRevision(
          endpointRevisionContext.providerId,
          endpointRevisionContext.modelId
        )
      : undefined;
    if (this.isFailureResponse(endpointRevision)) {
      return { error: endpointRevision };
    }

    let cacheLease: PreparationStateCacheLease | undefined;
    let cacheAdapter: ILLMClientAdapter | undefined;
    try {
      if (
        this.cachePreparationStateByEndpointRevision &&
        endpointRevisionContext &&
        endpointRevision !== undefined
      ) {
        cacheAdapter = this.adapterRegistry.getAdapter(
          endpointRevisionContext.providerId
        );
        cacheLease = await this.acquirePreparationStateCacheLease(
          cacheAdapter,
          endpointRevisionContext.providerId,
          endpointRevisionContext.modelId,
          endpointRevision
        );
      }

      const result = await this.prepareCanonicalRequestWithRevision(
        request,
        mode,
        endpointRevision,
        cacheLease?.state,
        cacheAdapter
      );
      if ("error" in result) {
        if (
          result.error.error.code ===
            ADAPTER_ERROR_CODES.PREPARED_CALL_STALE &&
          endpointRevisionContext
        ) {
          this.evictPreparationStateCache(
            endpointRevisionContext.providerId,
            endpointRevisionContext.modelId,
            cacheAdapter
          );
        }
        this.releasePreparationStateCacheLease(cacheLease, false);
        return result;
      }

      if (
        this.cachePreparationStateByEndpointRevision &&
        endpointRevisionContext &&
        endpointRevision !== undefined
      ) {
        const endingRevision =
          await this.captureProviderEndpointRevision(
            endpointRevisionContext.providerId,
            endpointRevisionContext.modelId
          );
        if (
          this.isFailureResponse(endingRevision) ||
          endingRevision === undefined ||
          !Object.is(endingRevision, endpointRevision)
        ) {
          this.evictPreparationStateCache(
            endpointRevisionContext.providerId,
            endpointRevisionContext.modelId,
            cacheAdapter
          );
          this.releasePreparationStateCacheLease(cacheLease, false);
          return {
            error: this.isFailureResponse(endingRevision)
              ? endingRevision
              : this.createStaleEndpointRevisionFailure(
                  endpointRevisionContext.providerId,
                  endpointRevisionContext.modelId,
                  "The provider endpoint revision changed during preparation."
                ),
          };
        }
        this.releasePreparationStateCacheLease(cacheLease, true);
      }

      return result;
    } catch (error) {
      this.releasePreparationStateCacheLease(cacheLease, false);
      return {
        error: this.createPreparedFailure(
          endpointRevisionContext?.providerId ?? request.providerId ?? "unknown",
          endpointRevisionContext?.modelId ?? request.modelId ?? "unknown",
          ADAPTER_ERROR_CODES.PROVIDER_ERROR,
          "The provider preparation state could not be captured.",
          "server_error",
          error
        ),
      };
    }
  }

  private async prepareCanonicalRequestWithRevision(
    request: LLMChatRequest | LLMChatRequestWithPreset,
    mode: PreparedCallMode,
    endpointRevision: ProviderEndpointRevision | undefined,
    cachedPreparationState?: unknown,
    expectedAdapter?: ILLMClientAdapter
  ): Promise<{ prepared: PreparedLLMRequest } | { error: LLMFailureResponse }> {
    const validation = await this.resolveAndValidateCapabilities(request, {
      validateStructure: true,
      detectLocalCapabilities: true,
      ...(cachedPreparationState !== undefined && {
        adapterPreparationState: cachedPreparationState,
      }),
    });
    if ("error" in validation) {
      return { error: validation.error };
    }

    const {
      providerId,
      modelId,
      modelInfo,
      resolvedRequest,
      finalSettings,
      adapterPreparationState,
    } = validation.context;

    // Get provider info for parameter filtering
    const providerInfo = getProviderById(providerId);
    if (!providerInfo) {
      return {
        error: {
          provider: providerId,
          model: modelId,
          error: {
            message: `Provider information not found: ${providerId}`,
            code: "PROVIDER_ERROR",
            type: "server_error",
          },
          object: "error",
        },
      };
    }

    // Filter out unsupported parameters
    const filteredSettings = this.settingsManager.filterUnsupportedParameters(
      finalSettings,
      modelInfo,
      providerInfo
    );
    const outputTokenLimit = this.createEffectiveOutputTokenLimit(
      request,
      providerId,
      modelInfo,
      filteredSettings.maxTokens
    );
    if (
      outputTokenLimit?.clamp &&
      filteredSettings.maxTokens !== outputTokenLimit.tokens
    ) {
      filteredSettings.maxTokens = outputTokenLimit.tokens;
    }

    const internalRequest: InternalLLMChatRequest = {
      ...resolvedRequest,
      settings: filteredSettings as Required<LLMSettings>,
    };

    this.logger.debug(
      `Processing LLM request with (potentially filtered) settings:`,
      {
        provider: providerId,
        model: modelId,
        settings: filteredSettings,
        messageCount: resolvedRequest.messages.length,
      }
    );

    // Get client adapter
    const clientAdapter = this.adapterRegistry.getAdapter(providerId);
    if (expectedAdapter && clientAdapter !== expectedAdapter) {
      return {
        error: this.createStaleEndpointRevisionFailure(
          providerId,
          modelId,
          "The provider adapter changed during preparation."
        ),
      };
    }

    if (!clientAdapter.prepareRequest) {
      return {
        error: this.createPreparedFailure(
          providerId,
          modelId,
          ADAPTER_ERROR_CODES.PREPARED_CALL_UNSUPPORTED,
          `Prepared calls are not supported for provider '${providerId}'.`,
          "unsupported_feature"
        ),
      };
    }

    try {
      const adapterResult = await clientAdapter.prepareRequest(internalRequest, {
        mode,
        modelInfo,
        outputTokenLimit,
        ...(endpointRevision !== undefined && {
          providerEndpointRevision: endpointRevision,
        }),
        ...(this.cachePreparationStateByEndpointRevision && {
          cachePreparationStateByEndpointRevision: true,
        }),
        ...(adapterPreparationState !== undefined && {
          providerState: adapterPreparationState,
        }),
      });
      if (
        expectedAdapter &&
        this.adapterRegistry.getAdapter(providerId) !== expectedAdapter
      ) {
        return {
          error: this.createStaleEndpointRevisionFailure(
            providerId,
            modelId,
            "The provider adapter changed during preparation."
          ),
        };
      }
      if ("error" in adapterResult) {
        return { error: adapterResult.error };
      }
      if (!this.isValidPreparedAccounting(adapterResult.prepared.promptAccounting)) {
        return {
          error: this.createPreparedFailure(
            providerId,
            modelId,
            ADAPTER_ERROR_CODES.INVALID_PREPARED_CALL,
            "The adapter returned invalid prepared prompt accounting.",
            "server_error"
          ),
        };
      }
      if (adapterResult.prepared.mode !== mode) {
        return {
          error: this.createPreparedFailure(
            providerId,
            modelId,
            ADAPTER_ERROR_CODES.INVALID_PREPARED_CALL,
            `The adapter prepared mode '${String(
              adapterResult.prepared.mode
            )}' instead of '${mode}'.`,
            "server_error"
          ),
        };
      }
      const adapterPrepared = deepFreeze(
        endpointRevision === undefined
          ? adapterResult.prepared
          : {
              ...adapterResult.prepared,
              bindings: {
                ...adapterResult.prepared.bindings,
                providerEndpointRevision: endpointRevision,
              },
            }
      );

      return {
        prepared: {
          providerId,
          modelId,
          modelInfo,
          resolvedRequest,
          internalRequest,
          clientAdapter,
          adapterPrepared,
        },
      };
    } catch (error) {
      return {
        error: this.createPreparedFailure(
          providerId,
          modelId,
          ADAPTER_ERROR_CODES.PROVIDER_ERROR,
          error instanceof Error
            ? error.message
            : "An unknown error occurred during request preparation.",
          "server_error",
          error
        ),
      };
    }

  }

  private postProcessResponse(
    result: LLMResponse | LLMFailureResponse,
    prepared: PreparedLLMRequest
  ): LLMResponse | LLMFailureResponse {
    if (result.object === "error") {
      if (!result.partialResponse) {
        return result;
      }
      const processed = this.postProcessResponse(
        {
          ...result.partialResponse,
          object: "chat.completion",
        },
        prepared
      );
      if (processed.object === "error") {
        return {
          ...result,
          ...(processed.partialResponse && {
            partialResponse: processed.partialResponse,
          }),
        };
      }
      const { object: _object, ...partialResponse } = processed;
      return { ...result, partialResponse };
    }

    const tokenProfile = resolveContentTokenProfile(
      prepared.providerId,
      prepared.modelId
    );
    for (const choice of result.choices) {
      canonicalizeChoiceAnswerAccounting(choice);
      const rawContent = choice.rawContent ?? choice.message.content;
      choice.rawContent ??= rawContent;
      if (
        tokenProfile.status === "available" &&
        !choice.answerAccounting?.rawContent
      ) {
        const counted = countContentTextTokens(
          rawContent,
          tokenProfile.profile
        );
        if (counted.status === "available") {
          const rawAccounting: LLMRawAnswerAccounting = {
            tokens: counted.count.tokens,
            method: counted.count.method,
            source: "library",
            tokenizerId: counted.count.tokenizerId,
            tokenProfileRevision: counted.count.tokenProfileRevision,
            reasoning:
              choice.reasoning && choice.reasoning.length > 0
                ? "excluded"
                : "unknown",
          };
          choice.answerAccounting = mergeAnswerAccountingByScope(
            choice.answerAccounting,
            { rawContent: rawAccounting }
          );
          choice.rawAnswerAccounting = rawAccounting;
        }
      }
    }

    // Post-process for thinking tag fallback
    // This feature extracts reasoning from XML tags when native reasoning is not active.
    // It's a fallback mechanism for models without native reasoning or when native is disabled.
    const fallbackSettings = prepared.internalRequest.settings.thinkingTagFallback;
    if (fallbackSettings && fallbackSettings.enabled !== false) {
      const tagName = fallbackSettings.tagName || 'thinking';

      // Check if native reasoning is active for this request
      const isNativeReasoningActive =
        prepared.modelInfo.reasoning?.supported === true &&
        (prepared.internalRequest.settings.reasoning?.enabled === true ||
         (prepared.modelInfo.reasoning?.enabledByDefault === true &&
          prepared.internalRequest.settings.reasoning?.enabled !== false) ||
         prepared.modelInfo.reasoning?.canDisable === false);

      // Process the response - extract thinking tags if present
      const choice = result.choices[0];
      if (choice?.message?.content) {
        choice.rawContent ??= choice.message.content;
        const { extracted, remaining } = extractInitialTaggedContent(choice.message.content, tagName);

        if (extracted !== null) {
          // Success: thinking tag found
          this.logger.debug(`Extracted <${tagName}> block from response.`);

          // Handle the edge case: append to existing reasoning if present (e.g., native reasoning + thinking tags)
          const existingReasoning = choice.reasoning || '';

          if (existingReasoning) {
            // Use a neutral markdown header that works for any consumer (human or AI)
            choice.reasoning = `${existingReasoning}\n\n#### Additional Reasoning\n\n${extracted}`;
          } else {
            // No existing reasoning, just use the extracted content directly
            choice.reasoning = extracted;
          }
          choice.message.content = remaining;
          const rawAccounting =
            choice.answerAccounting?.rawContent ??
            choice.rawAnswerAccounting;
          if (rawAccounting) {
            const extractedAccounting = {
              ...rawAccounting,
              reasoning: "included_extracted" as const,
            };
            choice.answerAccounting = mergeAnswerAccountingByScope(
              choice.answerAccounting,
              { rawContent: extractedAccounting }
            );
            choice.rawAnswerAccounting = extractedAccounting;
          }
        } else {
          // Tag was not found
          // Enforce only if: (1) enforce: true AND (2) native reasoning is NOT active
          if (fallbackSettings.enforce === true && !isNativeReasoningActive) {
            const nativeReasoningCapable = prepared.modelInfo.reasoning?.supported === true;

            return {
              provider: prepared.providerId,
              model: prepared.modelId,
              error: {
                message: `Model response missing required <${tagName}> tags.`,
                code: "THINKING_TAGS_MISSING",
                type: "validation_error",
                param: nativeReasoningCapable && !isNativeReasoningActive
                  ? `You disabled native reasoning for this model (${prepared.modelId}). ` +
                    `To see its reasoning, you must prompt it to use <${tagName}> tags. ` +
                    `Example: "Write your step-by-step reasoning in <${tagName}> tags before answering."`
                  : `This model (${prepared.modelId}) does not support native reasoning. ` +
                    `To get reasoning, you must prompt it to use <${tagName}> tags. ` +
                    `Example: "Write your step-by-step reasoning in <${tagName}> tags before answering."`,
              },
              object: "error",
              partialResponse: {
                id: result.id,
                provider: result.provider,
                model: result.model,
                created: result.created,
                choices: result.choices,
                usage: result.usage,
                usageEvidence: result.usageEvidence,
              }
            };
          }
          // If enforce: false or native reasoning is active, do nothing
        }
      }
    }

    // Post-process for structured output auto-parsing
    // Parse JSON response when structuredOutput is enabled and autoParse is not disabled
    const structuredOutputSettings = prepared.internalRequest.settings.structuredOutput;
    if (structuredOutputSettings &&
        structuredOutputSettings.enabled !== false && structuredOutputSettings.autoParse !== false) {
      for (const choice of result.choices) {
        if (choice.message?.content) {
          try {
            choice.parsedContent = JSON.parse(choice.message.content);
          } catch (e) {
            choice.parseError = `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`;
            this.logger.warn(`Failed to parse structured output for choice ${choice.index}: ${choice.parseError}`);
          }
        }
      }
    }

    return result;
  }

  /**
   * Gets all configured model presets
   * 
   * @returns Array of model presets
   */
  getPresets(): ModelPreset[] {
    return this.presetManager.getPresets();
  }

  /**
   * Creates messages from a template with role tags and model-aware variable substitution
   *
   * This unified method combines the functionality of template rendering, model context
   * injection, and role tag parsing into a single, intuitive API. It replaces the need
   * to chain prepareMessage and buildMessagesFromTemplate for model-aware multi-turn prompts.
   *
   * **Model Context Injection:**
   * When a presetId or providerId/modelId is provided, this method automatically injects
   * model context variables into your templates:
   * - `native_reasoning_active`: Whether native reasoning is currently active
   * - `native_reasoning_capable`: Whether the model supports native reasoning
   * - `requires_tags_for_thinking`: Whether thinking tags are needed (true when native reasoning not active)
   * - `model_id`, `provider_id`, `reasoning_effort`, `reasoning_max_tokens`
   *
   * **Best Practice for Thinking Tags:**
   * When adding thinking tag instructions, use requires_tags_for_thinking:
   * `{{ requires_tags_for_thinking ? 'Write your reasoning in <thinking> tags first.' : '' }}`
   *
   * @param options Options for creating messages
   * @returns Promise resolving to parsed messages, model context, and template settings
   *
   * @example
   * ```typescript
   * // Basic usage
   * const { messages } = await llm.createMessages({
   *   template: `
   *     <SYSTEM>You are a helpful assistant.</SYSTEM>
   *     <USER>Help me with {{ task }}</USER>
   *   `,
   *   variables: { task: 'understanding async/await' },
   *   presetId: 'openai-gpt-4.1-default'
   * });
   *
   * // Model-aware template with thinking tags
   * const { messages, modelContext } = await llm.createMessages({
   *   template: `
   *     <SYSTEM>
   *       You are a problem-solving assistant.
   *       {{ requires_tags_for_thinking ? 'For complex problems, write your reasoning in <thinking> tags first.' : '' }}
   *     </SYSTEM>
   *     <USER>{{ question }}</USER>
   *   `,
   *   variables: { question: 'Explain recursion' },
   *   presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
   * });
   * ```
   */
  async createMessages(options: {
    template: string;
    variables?: Record<string, any>;
    presetId?: string;
    providerId?: string;
    modelId?: string;
    settings?: Partial<LLMSettings>;
  }): Promise<CreateMessagesResult> {
    this.logger.debug('LLMService.createMessages called');

    // NEW: Step 1 - Parse the template for metadata and content
    const { metadata, content: templateContent } = parseTemplateWithMetadata(options.template);
    // Validate the settings from the template
    const templateSettings = this.settingsManager.validateTemplateSettings(metadata.settings || {});

    // Step 2: Get model context if model information is provided
    let modelContext: ModelContext | null = null;
    
    if (options.presetId || (options.providerId && options.modelId)) {
      // Resolve model information
      const resolved = await this.modelResolver.resolve({
        presetId: options.presetId,
        providerId: options.providerId as ApiProviderId,
        modelId: options.modelId,
        settings: options.settings
      });

      if (resolved.error) {
        // If resolution fails, proceed without model context
        this.logger.warn('Model resolution failed, proceeding without model context:', resolved.error);
      } else {
        const { providerId, modelId, modelInfo, settings } = resolved;
        
        // Merge settings with model defaults
        const mergedSettings = this.settingsManager.mergeSettingsForModel(
          modelId!,
          providerId!,
          settings || {},
          modelInfo
        );
        
        // Calculate native reasoning status
        const nativeReasoningActive = !!(modelInfo!.reasoning?.supported &&
                                        (mergedSettings.reasoning?.enabled === true ||
                                         (modelInfo!.reasoning?.enabledByDefault && mergedSettings.reasoning?.enabled !== false)));

        // Create model context with new property names
        modelContext = {
          native_reasoning_active: nativeReasoningActive,
          native_reasoning_capable: !!modelInfo!.reasoning?.supported,
          requires_tags_for_thinking: !nativeReasoningActive,
          model_id: modelId!,
          provider_id: providerId!,
          reasoning_effort: mergedSettings.reasoning?.effort,
          reasoning_max_tokens: mergedSettings.reasoning?.maxTokens,
        };
      }
    }

    // Step 2: Combine variables with model context
    // Model context comes first so user variables can override
    const allVariables = {
      ...(modelContext || {}),
      ...options.variables
    };

    // Step 3: Render the template with all variables
    let renderedTemplate: string;
    try {
      // Use templateContent which is the template without the <META> block
      renderedTemplate = renderTemplate(templateContent, allVariables);
    } catch (error) {
      throw new Error(`Template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 4: Parse role tags from the rendered template
    const parsedMessages = parseRoleTags(renderedTemplate);

    // Step 5: Convert to LLMMessage format
    const messages: LLMMessage[] = parsedMessages.map(({ role, content }) => ({
      role: role as 'system' | 'user' | 'assistant',
      content
    }));

    return {
      messages,
      modelContext,
      settings: templateSettings // NEW: Add the extracted settings
    };
  }

  /**
   * Gets information about registered adapters
   *
   * @returns Map of provider IDs to adapter info
   */
  getRegisteredAdapters() {
    return this.adapterRegistry.getRegisteredAdapters();
  }

  /**
   * Gets a summary of available providers and their adapter status
   *
   * @returns Summary of provider availability
   */
  getProviderSummary() {
    return this.adapterRegistry.getProviderSummary();
  }
}
