import { LlamaCppServerClient } from './LlamaCppServerClient';

// Mock global fetch
global.fetch = jest.fn();

describe('LlamaCppServerClient', () => {
  let client: LlamaCppServerClient;
  const baseURL = 'http://localhost:8080';

  beforeEach(() => {
    client = new LlamaCppServerClient(baseURL);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should remove trailing slash from baseURL', () => {
      const clientWithSlash = new LlamaCppServerClient('http://localhost:8080/');
      expect((clientWithSlash as any).baseURL).toBe('http://localhost:8080');
    });

    it('should preserve baseURL without trailing slash', () => {
      expect((client as any).baseURL).toBe('http://localhost:8080');
    });
  });

  describe('getHealth', () => {
    it('should return health status when server is ok', async () => {
      const mockResponse = { status: 'ok' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getHealth();

      expect(global.fetch).toHaveBeenCalledWith(`${baseURL}/health`);
      expect(result).toEqual(mockResponse);
    });

    it('should return loading status', async () => {
      const mockResponse = { status: 'loading' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getHealth();
      expect(result.status).toBe('loading');
    });

    it('should return error status with message', async () => {
      const mockResponse = { status: 'error', error: 'Model load failed' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getHealth();
      expect(result.status).toBe('error');
      expect(result.error).toBe('Model load failed');
    });

    it('should throw error when request fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.getHealth()).rejects.toThrow('Health check failed: 500 Internal Server Error');
    });
  });

  describe('tokenize', () => {
    it('should tokenize text and return token IDs', async () => {
      const mockResponse = { tokens: [12, 345, 6789] };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.tokenize('Hello world');

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseURL}/tokenize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Hello world' }),
        }
      );
      expect(result).toEqual(mockResponse);
      expect(result.tokens).toHaveLength(3);
    });

    it('should handle empty string', async () => {
      const mockResponse = { tokens: [] };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.tokenize('');
      expect(result.tokens).toEqual([]);
    });

    it('should throw error when tokenization fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid input',
      });

      await expect(client.tokenize('test')).rejects.toThrow('Tokenize failed: 400 Bad Request - Invalid input');
    });
  });

  describe('detokenize', () => {
    it('should convert tokens back to text', async () => {
      const mockResponse = { content: 'Hello world' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.detokenize([12, 345, 6789]);

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseURL}/detokenize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: [12, 345, 6789] }),
        }
      );
      expect(result).toEqual(mockResponse);
      expect(result.content).toBe('Hello world');
    });

    it('should handle empty token array', async () => {
      const mockResponse = { content: '' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.detokenize([]);
      expect(result.content).toBe('');
    });

    it('should throw error when detokenization fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid tokens',
      });

      await expect(client.detokenize([1, 2, 3])).rejects.toThrow('Detokenize failed: 400 Bad Request - Invalid tokens');
    });
  });

  describe('createEmbedding', () => {
    it('should generate embedding for text', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      const mockResponse = { embedding: mockEmbedding };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createEmbedding('Hello world');

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseURL}/embedding`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Hello world' }),
        }
      );
      expect(result.embedding).toEqual(mockEmbedding);
    });

    it('should include image data when provided', async () => {
      const mockResponse = { embedding: [0.1, 0.2] };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const imageData = 'base64encodedimage';
      await client.createEmbedding('Text with image', imageData);

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseURL}/embedding`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: 'Text with image',
            image_data: imageData,
          }),
        }
      );
    });

    it('should throw error when embedding fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'Model error',
      });

      await expect(client.createEmbedding('test')).rejects.toThrow('Embedding failed: 500 Server Error - Model error');
    });
  });

  describe('infill', () => {
    it('should complete code between prefix and suffix', async () => {
      const mockResponse = { content: '    return x + y;\n', tokens: [1, 2, 3], stop: true };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.infill('def add(x, y):\n', '\nprint(add(2, 3))');

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseURL}/infill`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_prefix: 'def add(x, y):\n',
            input_suffix: '\nprint(add(2, 3))',
          }),
        }
      );
      expect(result.content).toBe('    return x + y;\n');
      expect(result.stop).toBe(true);
    });

    it('should throw error when infill fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid code',
      });

      await expect(client.infill('prefix', 'suffix')).rejects.toThrow('Infill failed: 400 Bad Request - Invalid code');
    });
  });

  describe('getProps', () => {
    it('should retrieve server properties', async () => {
      const mockResponse = {
        assistant_name: 'Assistant',
        user_name: 'User',
        default_generation_settings: { temperature: 0.8 },
        total_slots: 4,
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getProps();

      expect(global.fetch).toHaveBeenCalledWith(`${baseURL}/props`);
      expect(result).toEqual(mockResponse);
      expect(result.total_slots).toBe(4);
    });

    it('should throw error when getting props fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.getProps()).rejects.toThrow('Get props failed: 404 Not Found');
    });
  });

  describe('getMetrics', () => {
    it('should retrieve JSON metrics', async () => {
      const mockResponse = { requests_total: 100, tokens_generated: 50000 };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockResponse,
      });

      const result = await client.getMetrics();

      expect(global.fetch).toHaveBeenCalledWith(`${baseURL}/metrics`);
      expect(result).toEqual(mockResponse);
    });

    it('should handle Prometheus format metrics', async () => {
      const prometheusText = '# HELP metric_name Description\nmetric_name 42\n';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => prometheusText,
      });

      const result = await client.getMetrics();

      expect(result).toEqual({ raw: prometheusText });
    });

    it('should throw error when getting metrics fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      });

      await expect(client.getMetrics()).rejects.toThrow('Get metrics failed: 500 Server Error');
    });
  });

  describe('getSlots', () => {
    it('should retrieve slot information', async () => {
      const mockResponse = {
        slots: [
          { id: 0, state: 1, prompt: 'Hello' },
          { id: 1, state: 0 },
        ],
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getSlots();

      expect(global.fetch).toHaveBeenCalledWith(`${baseURL}/slots`);
      expect(result.slots).toHaveLength(2);
      expect(result.slots[0].id).toBe(0);
    });

    it('should throw specific error when endpoint is not enabled', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.getSlots()).rejects.toThrow('Slots endpoint not enabled. Start server with --slots flag to enable.');
    });

    it('should throw error for other failures', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      });

      await expect(client.getSlots()).rejects.toThrow('Get slots failed: 500 Server Error');
    });
  });
});
