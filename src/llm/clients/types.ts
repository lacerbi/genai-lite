// AI Summary: Interface definition for LLM client adapters that handle provider-specific API calls.
// Defines the contract that all LLM provider clients must implement with enhanced type safety.

import type {
  LLMChatRequest,
  LLMAnswerAccountingByScope,
  LLMResponse,
  LLMFailureResponse,
  LLMRawAnswerAccounting,
  LLMRawContentPart,
  LLMSettings,
  LLMStreamEvent,
  LLMTermination,
  LLMUsage,
  LLMUsageEvidence,
  ModelInfo,
  ProviderEndpointRevision,
  PreparedCallMode,
  PreparedPromptAccounting,
  PreparedProviderRequestView,
  PreparedRequestBindings,
  EffectiveOutputTokenLimit,
} from "../types";

/**
 * Internal request structure used by client adapters with applied defaults
 * This ensures all settings have values and adapters don't need to handle undefined values
 */
export interface InternalLLMChatRequest
  extends Omit<LLMChatRequest, "settings"> {
  settings: Required<LLMSettings>;
}

/**
 * Per-request transport options passed from the service layer to adapters.
 */
export interface AdapterRequestOptions {
  /**
   * Abort signal for cancelling the in-flight request. Note that aborting only
   * cancels the client-side wait — the provider may still process (and bill) the request.
   */
  signal?: AbortSignal;
  /** Request timeout in milliseconds (mapped to each SDK's timeout mechanism) */
  timeoutMs?: number;
}

/** Raw/provenance evidence observed by an adapter while streaming. */
export interface AdapterStreamObservedEvidence {
  choice?: {
    index: number;
    rawContentDelta?: string;
    rawContentParts?: LLMRawContentPart[];
    answerAccounting?: LLMAnswerAccountingByScope;
    /**
     * @deprecated Use `answerAccounting.rawContent`.
     */
    rawAnswerAccounting?: LLMRawAnswerAccounting;
    finishReason?: string | null;
    termination?: LLMTermination;
  };
  usage?: LLMUsage;
  usageEvidence?: LLMUsageEvidence;
}

/**
 * Stream event emitted by adapters before the service assigns an attempt ID.
 *
 * Existing adapters may keep emitting the legacy LLMStreamEvent union. Built-in
 * adapters can attach evidence to a public event or emit an adapter-only
 * evidence event, which LLMService consumes without forwarding.
 */
export type AdapterLLMStreamEvent =
  | (LLMStreamEvent & {
      observedEvidence?: AdapterStreamObservedEvidence;
    })
  | {
      type: "adapter_evidence";
      observedEvidence: AdapterStreamObservedEvidence;
    };

/** Context supplied to credential-free adapter preparation. */
export interface AdapterPreparationContext {
  mode: PreparedCallMode;
  modelInfo: ModelInfo;
  outputTokenLimit?: EffectiveOutputTokenLimit;
  /** Authoritative endpoint revision captured before preparation, when known. */
  providerEndpointRevision?: ProviderEndpointRevision;
  /**
   * Whether the host asserts that endpoint revision fully covers cached
   * model/build/template state for this preparation.
   */
  cachePreparationStateByEndpointRevision?: boolean;
  /** Opaque adapter-owned state captured during dynamic model resolution. */
  providerState?: unknown;
}

/** Opaque adapter-owned command plus stable inspection evidence. */
export interface AdapterPreparedRequest<TProviderRequest = unknown> {
  mode: PreparedCallMode;
  providerRequest: TProviderRequest;
  requestView: PreparedProviderRequestView;
  promptAccounting: PreparedPromptAccounting;
  outputTokenLimit?: EffectiveOutputTokenLimit;
  bindings: PreparedRequestBindings;
}

/** Result of credential-free adapter preparation. */
export type AdapterPreparationResult =
  | { prepared: AdapterPreparedRequest }
  | { error: LLMFailureResponse };

/** Result of revalidating observable prepared-call bindings. */
export type AdapterRevalidationResult =
  | { valid: true }
  | { valid: false; error: LLMFailureResponse };

/**
 * Interface that all LLM client adapters must implement
 *
 * Client adapters handle the provider-specific logic for:
 * - Formatting requests according to provider API requirements
 * - Making HTTP calls to provider endpoints
 * - Parsing responses into standardized format
 * - Handling provider-specific errors
 * - Managing provider-specific authentication
 */
export interface ILLMClientAdapter {
  /**
   * Optional credential-free provider-state snapshot shared by model
   * resolution and adapter preparation.
   */
  getPreparationSnapshot?(selectedModel: string): Promise<unknown>;
  /**
   * Whether a successful snapshot is safe to retain under an authoritative
   * endpoint revision. Absence means snapshots remain per-preparation only.
   */
  isPreparationSnapshotCacheable?(
    snapshot: unknown,
    selectedModel?: string
  ): boolean;
  /**
   * Sends a chat message to the LLM provider
   *
   * @param request - The LLM request with applied default settings
   * @param apiKey - The decrypted API key for the provider
   * @param options - Optional per-request transport options (abort signal, timeout)
   * @returns Promise resolving to either a successful response or failure response
   *
   * @throws Should not throw - all errors should be caught and returned as LLMFailureResponse
   */
  sendMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse>;

  /**
   * Streams a chat message from the LLM provider.
   *
   * Adapters that implement this should yield provider-normalized deltas and a
   * final complete/error event. Adapters that do not implement it will be
   * reported by LLMService as unsupported for streaming.
   */
  streamMessage?(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent>;

  /**
   * Optional credential-free canonical preparation capability.
   *
   * Built-in adapters implement this. Legacy custom adapters remain
   * source-compatible and are reported as unsupported when it is absent.
   */
  prepareRequest?(
    request: InternalLLMChatRequest,
    context: AdapterPreparationContext
  ): Promise<AdapterPreparationResult>;

  /** Dispatches a canonical non-streaming provider request. */
  sendPrepared?(
    prepared: AdapterPreparedRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse>;

  /** Dispatches a canonical streaming provider request. */
  streamPrepared?(
    prepared: AdapterPreparedRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent>;

  /** Revalidates locally observable state before an inference request. */
  revalidatePreparedRequest?(
    prepared: AdapterPreparedRequest,
    options?: AdapterRequestOptions
  ): Promise<AdapterRevalidationResult>;

  /**
   * Optional method to validate API key format before making requests
   *
   * @param apiKey - The API key to validate
   * @returns True if the key format appears valid for this provider
   */
  validateApiKey?(apiKey: string): boolean;

  /**
   * Optional method to get provider-specific information
   *
   * @returns Information about this adapter's capabilities or configuration
   */
  getAdapterInfo?(): {
    providerId: string;
    name: string;
    version?: string;
  };
}

/**
 * Base error codes that adapters should use for consistency
 */
export const ADAPTER_ERROR_CODES = {
  INVALID_API_KEY: "INVALID_API_KEY",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  CONTEXT_LENGTH_EXCEEDED: "CONTEXT_LENGTH_EXCEEDED",
  CONTENT_FILTER: "CONTENT_FILTER",
  NETWORK_ERROR: "NETWORK_ERROR",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  /** The request exceeded its timeout (retryable by default) */
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  /** The request was cancelled via AbortSignal (never retried) */
  REQUEST_ABORTED: "REQUEST_ABORTED",
  /** The adapter does not implement canonical prepared calls. */
  PREPARED_CALL_UNSUPPORTED: "PREPARED_CALL_UNSUPPORTED",
  /** Observable local state changed after preparation. */
  PREPARED_CALL_STALE: "PREPARED_CALL_STALE",
  /** A prepared handle is invalid, forged, or belongs to another service. */
  INVALID_PREPARED_CALL: "INVALID_PREPARED_CALL",
  /** A prepared handle was dispatched with the wrong mode. */
  PREPARED_CALL_MODE_MISMATCH: "PREPARED_CALL_MODE_MISMATCH",
} as const;

/**
 * Helper type for adapter error codes
 */
export type AdapterErrorCode =
  (typeof ADAPTER_ERROR_CODES)[keyof typeof ADAPTER_ERROR_CODES];
