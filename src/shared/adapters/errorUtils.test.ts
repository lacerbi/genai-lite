import { getCommonMappedErrorDetails } from './errorUtils';
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
  });
});