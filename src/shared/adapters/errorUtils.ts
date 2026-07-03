// AI Summary: Centralized error mapping utility for LLM client adapters.
// Maps common HTTP status codes and network errors to standardized AdapterErrorCode and errorType.
// Reduces duplication across OpenAI, Anthropic and other provider adapters.

import { ADAPTER_ERROR_CODES, type AdapterErrorCode } from '../../llm/clients/types';

/**
 * Mapped error details returned by the utility function
 */
export interface MappedErrorDetails {
  errorCode: AdapterErrorCode;
  errorMessage: string;
  errorType: string;
  status?: number;
  /** Provider-suggested wait before retrying (parsed from a Retry-After header) */
  retryAfterMs?: number;
}

/**
 * Parses a Retry-After header value (delta-seconds or HTTP-date) into milliseconds.
 *
 * @param value - The raw header value
 * @returns Milliseconds to wait, or undefined when unparseable/negative
 */
export function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (!Number.isNaN(seconds)) {
    return seconds >= 0 ? Math.round(seconds * 1000) : undefined;
  }

  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : undefined;
  }

  return undefined;
}

/**
 * Extracts a Retry-After value in ms from an SDK error object, tolerating the
 * different places SDKs keep response headers (openai/anthropic `error.headers`
 * as a Headers instance or plain object; Speakeasy-style `error.rawResponse`).
 */
export function extractRetryAfterMs(error: any): number | undefined {
  const headerSources = [error?.headers, error?.rawResponse?.headers];
  for (const headers of headerSources) {
    if (!headers) continue;
    let raw: string | null | undefined;
    if (typeof headers.get === 'function') {
      raw = headers.get('retry-after');
    } else if (typeof headers === 'object') {
      raw = headers['retry-after'] ?? headers['Retry-After'];
    }
    const parsed = parseRetryAfterMs(raw);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

/**
 * Matches an error against known error-class names. The openai/anthropic SDK
 * error classes never assign `this.name` (instances report name "Error"), so
 * the constructor name is checked as well.
 */
function matchesErrorName(e: any, names: readonly string[]): boolean {
  return !!e && (names.includes(e.name) || names.includes(e.constructor?.name));
}

/**
 * Matches the error shapes produced for connection-level failures (DNS lookup,
 * connection refused, connect timeout). Wrappers keep the real failure on
 * `cause`, sometimes nested (undici's `TypeError: fetch failed` inside
 * anthropic/openai `APIConnectionError`), so the cause chain is walked too.
 */
function isConnectionFailure(e: any, depth: number = 0): boolean {
  if (!e || depth > 4) return false;
  return (
    e.code === 'ENOTFOUND' ||
    e.code === 'ECONNREFUSED' ||
    e.code === 'ETIMEDOUT' ||
    matchesErrorName(e, ['ConnectTimeoutError', 'ConnectionError', 'APIConnectionError']) ||
    (typeof e.type === 'string' && e.type.includes('timeout')) ||
    isConnectionFailure(e.cause, depth + 1)
  );
}

/**
 * Maps common error patterns to standardized error codes and types
 *
 * This utility handles:
 * - Common HTTP status codes (401, 402, 404, 429, 4xx, 5xx)
 * - Network connection errors (ENOTFOUND, ECONNREFUSED, timeouts), including
 *   undici's `TypeError: fetch failed` wrapper carrying the failure on `cause`
 * - Generic JavaScript errors
 * 
 * Individual adapters can further refine the mappings for provider-specific cases,
 * particularly for 400 errors where message content determines the specific error type.
 * 
 * @param error - The error object from the provider SDK or network layer
 * @param providerMessageOverride - Optional override for the error message (e.g., from provider SDK)
 * @returns Mapped error details with standardized codes and types
 */
export function getCommonMappedErrorDetails(
  error: any,
  providerMessageOverride?: string
): MappedErrorDetails {
  let errorCode: AdapterErrorCode = ADAPTER_ERROR_CODES.UNKNOWN_ERROR;
  let errorMessage = providerMessageOverride || error?.message || 'Unknown error occurred';
  let errorType = 'server_error';
  let status: number | undefined;
  const retryAfterMs = extractRetryAfterMs(error);

  // Handle user-initiated aborts and client-side timeouts first — the SDKs raise
  // these as typed errors (openai/anthropic: APIUserAbortError/
  // APIConnectionTimeoutError, matched by constructor name since those classes
  // never set this.name; Speakeasy/mistral: RequestAbortedError/
  // RequestTimeoutError; fetch/undici: AbortError/TimeoutError DOMExceptions)
  if (matchesErrorName(error, ['APIUserAbortError', 'AbortError', 'RequestAbortedError'])) {
    return {
      errorCode: ADAPTER_ERROR_CODES.REQUEST_ABORTED,
      errorMessage: providerMessageOverride || error.message || 'Request was aborted',
      errorType: 'abort_error',
    };
  }
  if (
    matchesErrorName(error, [
      'APIConnectionTimeoutError',
      'TimeoutError',
      'RequestTimeoutError',
    ])
  ) {
    return {
      errorCode: ADAPTER_ERROR_CODES.REQUEST_TIMEOUT,
      errorMessage: providerMessageOverride || error.message || 'Request timed out',
      errorType: 'timeout_error',
    };
  }

  // Handle API errors with HTTP status codes — SDKs expose the status as either
  // `status` (openai/anthropic) or `statusCode` (Speakeasy/mistral MistralError)
  const numericStatus =
    error && typeof error.status === 'number'
      ? error.status
      : error && typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
  if (numericStatus !== undefined) {
    const httpStatus = numericStatus;
    status = httpStatus;
    errorMessage = providerMessageOverride || error.message || `HTTP ${httpStatus} error`;

    // Map common HTTP status codes
    // TypeScript knows httpStatus is defined here due to the typeof check above
    switch (httpStatus) {
      case 400:
        // Default mapping for 400 errors - adapters should refine based on message content
        errorCode = ADAPTER_ERROR_CODES.PROVIDER_ERROR;
        errorType = 'invalid_request_error';
        break;
      case 401:
        errorCode = ADAPTER_ERROR_CODES.INVALID_API_KEY;
        errorType = 'authentication_error';
        break;
      case 402:
        errorCode = ADAPTER_ERROR_CODES.INSUFFICIENT_CREDITS;
        errorType = 'rate_limit_error';
        break;
      case 404:
        errorCode = ADAPTER_ERROR_CODES.MODEL_NOT_FOUND;
        errorType = 'invalid_request_error';
        break;
      case 429:
        errorCode = ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED;
        errorType = 'rate_limit_error';
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        errorCode = ADAPTER_ERROR_CODES.PROVIDER_ERROR;
        errorType = 'server_error';
        break;
      default:
        if (httpStatus >= 400 && httpStatus < 500) {
          errorCode = ADAPTER_ERROR_CODES.PROVIDER_ERROR;
          errorType = 'invalid_request_error';
        } else if (httpStatus >= 500) {
          errorCode = ADAPTER_ERROR_CODES.PROVIDER_ERROR;
          errorType = 'server_error';
        } else {
          errorCode = ADAPTER_ERROR_CODES.PROVIDER_ERROR;
          errorType = 'server_error';
        }
    }
  }
  // Handle network connection errors — either directly (Node error shapes) or
  // wrapped with the real failure on `cause` (undici's `TypeError: fetch failed`,
  // anthropic/openai APIConnectionError, Speakeasy ConnectionError)
  else if (isConnectionFailure(error)) {
    errorCode = ADAPTER_ERROR_CODES.NETWORK_ERROR;
    errorType = 'connection_error';
    errorMessage = providerMessageOverride || error.message || 'Network connection failed';
    // Surface the underlying cause when the top-level message is generic
    // (undici's "fetch failed", Speakeasy's ConnectionError wrapper)
    if (
      typeof error?.cause?.message === 'string' &&
      error.cause.message &&
      !errorMessage.includes(error.cause.message)
    ) {
      errorMessage = `${errorMessage}: ${error.cause.message}`;
    }
  }
  // Handle generic JavaScript errors
  else if (error instanceof Error) {
    errorMessage = providerMessageOverride || error.message || 'Client error occurred';
    errorCode = ADAPTER_ERROR_CODES.UNKNOWN_ERROR;
    errorType = 'client_error';
  }
  // Handle unknown error types
  else {
    errorMessage = providerMessageOverride || 'Unknown error occurred';
    errorCode = ADAPTER_ERROR_CODES.UNKNOWN_ERROR;
    errorType = 'server_error';
  }

  return {
    errorCode,
    errorMessage,
    errorType,
    status,
    ...(retryAfterMs !== undefined && { retryAfterMs })
  };
}
