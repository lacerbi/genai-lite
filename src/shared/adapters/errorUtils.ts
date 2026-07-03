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
 * Matches the error shapes Node's networking stack produces for connection-level
 * failures (DNS lookup, connection refused, connect timeout). Native fetch
 * (undici) wraps these in a generic `TypeError: fetch failed` and keeps the
 * real failure on `cause`, so callers should check both the error and its cause.
 */
function isConnectionFailure(e: any): boolean {
  return !!e && (
    e.code === 'ENOTFOUND' ||
    e.code === 'ECONNREFUSED' ||
    e.code === 'ETIMEDOUT' ||
    e.name === 'ConnectTimeoutError' ||
    (typeof e.type === 'string' && e.type.includes('timeout'))
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
  // these as named errors (openai: APIUserAbortError/APIConnectionTimeoutError;
  // fetch/undici: AbortError/TimeoutError DOMExceptions)
  if (
    error &&
    (error.name === 'APIUserAbortError' ||
      error.name === 'AbortError' ||
      (error instanceof DOMException && error.name === 'AbortError'))
  ) {
    return {
      errorCode: ADAPTER_ERROR_CODES.REQUEST_ABORTED,
      errorMessage: providerMessageOverride || error.message || 'Request was aborted',
      errorType: 'abort_error',
    };
  }
  if (
    error &&
    (error.name === 'APIConnectionTimeoutError' || error.name === 'TimeoutError')
  ) {
    return {
      errorCode: ADAPTER_ERROR_CODES.REQUEST_TIMEOUT,
      errorMessage: providerMessageOverride || error.message || 'Request timed out',
      errorType: 'timeout_error',
    };
  }

  // Handle API errors with HTTP status codes
  if (error && typeof error.status === 'number') {
    const httpStatus = error.status;
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
  // wrapped by native fetch/undici as `TypeError: fetch failed` with the real
  // failure on `cause` (e.g. @google/genai rethrows these unwrapped)
  else if (isConnectionFailure(error) || isConnectionFailure(error?.cause)) {
    errorCode = ADAPTER_ERROR_CODES.NETWORK_ERROR;
    errorType = 'connection_error';
    errorMessage = providerMessageOverride || error.message || 'Network connection failed';
    // Surface the underlying cause when the top-level message is just
    // undici's generic "fetch failed"
    if (
      !isConnectionFailure(error) &&
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
