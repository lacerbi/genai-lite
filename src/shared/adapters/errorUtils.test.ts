import {
  getCommonMappedErrorDetails,
  parseRetryAfterMs,
  extractRetryAfterMs,
} from './errorUtils';
import { ADAPTER_ERROR_CODES } from '../../llm/clients/types';

describe('adapterErrorUtils', () => {
  describe('getCommonMappedErrorDetails', () => {
    it('should map 400 status to provider error', () => {
      const error = { status: 400, message: 'Bad request' };
      const result = getCommonMappedErrorDetails(error);
      
      expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.PROVIDER_ERROR);
      expect(result.errorType).toBe('invalid_request_error');
      expect(result.errorMessage).toBe('Bad request');
      expect(result.status).toBe(400);
    });

    it('should map 401 status to invalid API key', () => {
      const error = { status: 401, message: 'Unauthorized' };
      const result = getCommonMappedErrorDetails(error);
      
      expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.INVALID_API_KEY);
      expect(result.errorType).toBe('authentication_error');
      expect(result.errorMessage).toBe('Unauthorized');
      expect(result.status).toBe(401);
    });

    it('should map 402 status to insufficient credits', () => {
      const error = { status: 402, message: 'Payment required' };
      const result = getCommonMappedErrorDetails(error);
      
      expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.INSUFFICIENT_CREDITS);
      expect(result.errorType).toBe('rate_limit_error');
      expect(result.errorMessage).toBe('Payment required');
      expect(result.status).toBe(402);
    });

    it('should map 404 status to model not found', () => {
      const error = { status: 404, message: 'Not found' };
      const result = getCommonMappedErrorDetails(error);
      
      expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.MODEL_NOT_FOUND);
      expect(result.errorType).toBe('invalid_request_error');
      expect(result.errorMessage).toBe('Not found');
      expect(result.status).toBe(404);
    });

    it('should map 429 status to rate limit exceeded', () => {
      const error = { status: 429, message: 'Too many requests' };
      const result = getCommonMappedErrorDetails(error);
      
      expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
      expect(result.errorType).toBe('rate_limit_error');
      expect(result.errorMessage).toBe('Too many requests');
      expect(result.status).toBe(429);
    });

    it('should map 5xx status codes to provider error', () => {
      const testCases = [500, 502, 503, 504];
      
      testCases.forEach(status => {
        const error = { status, message: `Server error ${status}` };
        const result = getCommonMappedErrorDetails(error);
        
        expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.PROVIDER_ERROR);
        expect(result.errorType).toBe('server_error');
        expect(result.errorMessage).toBe(`Server error ${status}`);
        expect(result.status).toBe(status);
      });
    });

    it('should map other 4xx status codes to provider error', () => {
      const error = { status: 403, message: 'Forbidden' };
      const result = getCommonMappedErrorDetails(error);
      
      expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.PROVIDER_ERROR);
      expect(result.errorType).toBe('invalid_request_error');
      expect(result.errorMessage).toBe('Forbidden');
      expect(result.status).toBe(403);
    });

    it('should map network errors to network error', () => {
      const networkErrors = [
        { code: 'ENOTFOUND', message: 'DNS lookup failed' },
        { code: 'ECONNREFUSED', message: 'Connection refused' },
        { code: 'ETIMEDOUT', message: 'Request timed out' },
        { name: 'ConnectTimeoutError', message: 'Connection timeout' },
        { type: 'request-timeout', message: 'Request timeout' }
      ];
      
      networkErrors.forEach(error => {
        const result = getCommonMappedErrorDetails(error);
        
        expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
        expect(result.errorType).toBe('connection_error');
        expect(result.errorMessage).toBe(error.message);
        expect(result.status).toBeUndefined();
      });
    });

    it('should map undici fetch-failed wrappers via cause code to network error', () => {
      // Native fetch (undici) rejects with `TypeError: fetch failed` and keeps
      // the real failure on `cause` — the shape @google/genai rethrows unwrapped
      const error = Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('connect ECONNREFUSED 142.250.74.106:443'), {
          code: 'ECONNREFUSED',
        }),
      });

      const result = getCommonMappedErrorDetails(error);

      expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
      expect(result.errorType).toBe('connection_error');
      expect(result.errorMessage).toBe(
        'fetch failed: connect ECONNREFUSED 142.250.74.106:443'
      );
      expect(result.status).toBeUndefined();
    });

    it('should map undici connect-timeout causes to network error', () => {
      const error = Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('Connect Timeout Error'), {
          name: 'ConnectTimeoutError',
          code: 'UND_ERR_CONNECT_TIMEOUT',
        }),
      });

      const result = getCommonMappedErrorDetails(error);

      expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.NETWORK_ERROR);
      expect(result.errorType).toBe('connection_error');
    });

    it('should not treat non-network causes as network errors', () => {
      const error = Object.assign(new Error('wrapper'), {
        cause: new Error('some unrelated inner failure'),
      });

      const result = getCommonMappedErrorDetails(error);

      expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
      expect(result.errorType).toBe('client_error');
    });

    it('should handle generic Error instances', () => {
      const error = new Error('Something went wrong');
      const result = getCommonMappedErrorDetails(error);
      
      expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
      expect(result.errorType).toBe('client_error');
      expect(result.errorMessage).toBe('Something went wrong');
      expect(result.status).toBeUndefined();
    });

    it('should handle unknown error types', () => {
      const testCases = [
        null,
        undefined,
        'string error',
        123,
        { random: 'object' }
      ];
      
      testCases.forEach(error => {
        const result = getCommonMappedErrorDetails(error);
        
        expect(result.errorCode).toBe(ADAPTER_ERROR_CODES.UNKNOWN_ERROR);
        expect(result.errorType).toBe('server_error');
        expect(result.errorMessage).toBe('Unknown error occurred');
        expect(result.status).toBeUndefined();
      });
    });

    it('should use provider message override when provided', () => {
      const error = { status: 400, message: 'Original message' };
      const override = 'Custom error message';
      const result = getCommonMappedErrorDetails(error, override);
      
      expect(result.errorMessage).toBe(override);
    });

    it('should handle errors without message property', () => {
      const error = { status: 400 };
      const result = getCommonMappedErrorDetails(error);
      
      expect(result.errorMessage).toBe('HTTP 400 error');
    });

    it('should handle errors with empty message', () => {
      const error = { status: 400, message: '' };
      const result = getCommonMappedErrorDetails(error);

      expect(result.errorMessage).toBe('HTTP 400 error');
    });

    it('should map user aborts to REQUEST_ABORTED', () => {
      const abortError = new Error('Request was aborted.');
      abortError.name = 'APIUserAbortError';

      const details = getCommonMappedErrorDetails(abortError);

      expect(details.errorCode).toBe(ADAPTER_ERROR_CODES.REQUEST_ABORTED);
      expect(details.errorType).toBe('abort_error');
    });

    it('should map DOMException-style AbortError to REQUEST_ABORTED', () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      const details = getCommonMappedErrorDetails(abortError);

      expect(details.errorCode).toBe(ADAPTER_ERROR_CODES.REQUEST_ABORTED);
    });

    it('should map connection timeouts to REQUEST_TIMEOUT', () => {
      const timeoutError = new Error('Request timed out.');
      timeoutError.name = 'APIConnectionTimeoutError';

      const details = getCommonMappedErrorDetails(timeoutError);

      expect(details.errorCode).toBe(ADAPTER_ERROR_CODES.REQUEST_TIMEOUT);
      expect(details.errorType).toBe('timeout_error');
    });

    it('should include retryAfterMs on errors carrying a Retry-After header', () => {
      const rateLimitError: any = new Error('Rate limited');
      rateLimitError.status = 429;
      rateLimitError.headers = { 'retry-after': '12' };

      const details = getCommonMappedErrorDetails(rateLimitError);

      expect(details.errorCode).toBe(ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED);
      expect(details.retryAfterMs).toBe(12000);
    });
  });

  describe('parseRetryAfterMs', () => {
    it('parses delta-seconds values', () => {
      expect(parseRetryAfterMs('30')).toBe(30000);
      expect(parseRetryAfterMs('0')).toBe(0);
      expect(parseRetryAfterMs('1.5')).toBe(1500);
    });

    it('parses HTTP-date values relative to now', () => {
      const future = new Date(Date.now() + 42000).toUTCString();
      const parsed = parseRetryAfterMs(future);
      expect(parsed).toBeGreaterThan(40000);
      expect(parsed).toBeLessThanOrEqual(42000);
    });

    it('returns undefined for missing, negative, or garbage values', () => {
      expect(parseRetryAfterMs(undefined)).toBeUndefined();
      expect(parseRetryAfterMs(null)).toBeUndefined();
      expect(parseRetryAfterMs('-5')).toBeUndefined();
      expect(parseRetryAfterMs('soon')).toBeUndefined();
      // Past dates yield no wait
      expect(parseRetryAfterMs(new Date(Date.now() - 60000).toUTCString())).toBeUndefined();
    });
  });

  describe('extractRetryAfterMs', () => {
    it('reads Headers-style objects (openai/anthropic SDK errors)', () => {
      const error = { headers: new Map([['retry-after', '7']]) };
      // Map has .get, mimicking the Headers interface
      expect(extractRetryAfterMs(error)).toBe(7000);
    });

    it('reads plain-object headers', () => {
      expect(extractRetryAfterMs({ headers: { 'retry-after': '2' } })).toBe(2000);
      expect(extractRetryAfterMs({ headers: { 'Retry-After': '3' } })).toBe(3000);
    });

    it('reads rawResponse headers (Speakeasy-style errors)', () => {
      const error = { rawResponse: { headers: { 'retry-after': '4' } } };
      expect(extractRetryAfterMs(error)).toBe(4000);
    });

    it('returns undefined when no header is present', () => {
      expect(extractRetryAfterMs({})).toBeUndefined();
      expect(extractRetryAfterMs(new Error('boom'))).toBeUndefined();
    });
  });
});