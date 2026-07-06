// AI Summary: Interface definition for LLM client adapters that handle provider-specific API calls.
// Defines the contract that all LLM provider clients must implement with enhanced type safety.

import type {
  LLMChatRequest,
  LLMResponse,
  LLMFailureResponse,
  LLMSettings,
  LLMStreamEvent,
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
  ): AsyncIterable<LLMStreamEvent>;

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
} as const;

/**
 * Helper type for adapter error codes
 */
export type AdapterErrorCode =
  (typeof ADAPTER_ERROR_CODES)[keyof typeof ADAPTER_ERROR_CODES];
