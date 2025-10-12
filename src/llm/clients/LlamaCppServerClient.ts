// AI Summary: Utility client for interacting with llama.cpp server's non-LLM endpoints.
// Provides methods for tokenization, embeddings, health checks, and server management.

/**
 * Response from the /health endpoint
 */
export interface LlamaCppHealthResponse {
  status: 'loading' | 'error' | 'ok';
  error?: string;
}

/**
 * Response from the /tokenize endpoint
 */
export interface LlamaCppTokenizeResponse {
  tokens: number[];
}

/**
 * Response from the /detokenize endpoint
 */
export interface LlamaCppDetokenizeResponse {
  content: string;
}

/**
 * Response from the /embedding endpoint
 */
export interface LlamaCppEmbeddingResponse {
  embedding: number[];
}

/**
 * Response from the /infill endpoint
 */
export interface LlamaCppInfillResponse {
  content: string;
  tokens?: number[];
  stop?: boolean;
}

/**
 * Response from the /props endpoint
 */
export interface LlamaCppPropsResponse {
  assistant_name?: string;
  user_name?: string;
  default_generation_settings?: Record<string, any>;
  total_slots?: number;
  [key: string]: any;
}

/**
 * Response from the /metrics endpoint
 */
export interface LlamaCppMetricsResponse {
  [key: string]: any;
}

/**
 * Individual slot information from /slots endpoint
 */
export interface LlamaCppSlot {
  id: number;
  state: number;
  prompt?: string;
  [key: string]: any;
}

/**
 * Response from the /slots endpoint
 */
export interface LlamaCppSlotsResponse {
  slots: LlamaCppSlot[];
}

/**
 * Client for interacting with llama.cpp server's management and utility endpoints
 *
 * This class provides access to non-LLM endpoints like tokenization, embeddings,
 * health checks, and server properties. For chat completions, use LlamaCppClientAdapter.
 *
 * @example
 * ```typescript
 * const client = new LlamaCppServerClient('http://localhost:8080');
 *
 * // Check if server is ready
 * const health = await client.getHealth();
 * console.log(health.status); // 'ok', 'loading', or 'error'
 *
 * // Tokenize text
 * const { tokens } = await client.tokenize('Hello world');
 * console.log(tokens); // [123, 456, 789]
 *
 * // Generate embeddings
 * const { embedding } = await client.createEmbedding('Some text');
 * ```
 */
export class LlamaCppServerClient {
  private baseURL: string;

  /**
   * Creates a new llama.cpp server client
   *
   * @param baseURL - The base URL of the llama.cpp server (e.g., 'http://localhost:8080')
   */
  constructor(baseURL: string) {
    // Remove trailing slash if present
    this.baseURL = baseURL.replace(/\/$/, '');
  }

  /**
   * Checks the health and readiness of the server
   *
   * @returns Promise resolving to health status
   * @throws Error if the request fails
   */
  async getHealth(): Promise<LlamaCppHealthResponse> {
    const response = await fetch(`${this.baseURL}/health`);

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Converts text to tokens using the loaded model's tokenizer
   *
   * @param content - The text to tokenize
   * @returns Promise resolving to array of token IDs
   * @throws Error if the request fails
   */
  async tokenize(content: string): Promise<LlamaCppTokenizeResponse> {
    const response = await fetch(`${this.baseURL}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tokenize failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Converts tokens back to text using the loaded model's tokenizer
   *
   * @param tokens - Array of token IDs to convert
   * @returns Promise resolving to the decoded text
   * @throws Error if the request fails
   */
  async detokenize(tokens: number[]): Promise<LlamaCppDetokenizeResponse> {
    const response = await fetch(`${this.baseURL}/detokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Detokenize failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Generates an embedding vector for the given text
   *
   * @param content - The text to embed
   * @param imageData - Optional base64-encoded image data for multimodal models
   * @returns Promise resolving to the embedding vector
   * @throws Error if the request fails
   */
  async createEmbedding(content: string, imageData?: string): Promise<LlamaCppEmbeddingResponse> {
    const body: any = { content };
    if (imageData) {
      body.image_data = imageData;
    }

    const response = await fetch(`${this.baseURL}/embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Performs code infilling (completing code between prefix and suffix)
   *
   * @param inputPrefix - The code before the cursor/gap
   * @param inputSuffix - The code after the cursor/gap
   * @returns Promise resolving to the infilled completion
   * @throws Error if the request fails
   */
  async infill(inputPrefix: string, inputSuffix: string): Promise<LlamaCppInfillResponse> {
    const response = await fetch(`${this.baseURL}/infill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_prefix: inputPrefix,
        input_suffix: inputSuffix,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Infill failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Retrieves server properties and configuration
   *
   * @returns Promise resolving to server properties
   * @throws Error if the request fails
   */
  async getProps(): Promise<LlamaCppPropsResponse> {
    const response = await fetch(`${this.baseURL}/props`);

    if (!response.ok) {
      throw new Error(`Get props failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Retrieves performance metrics from the server
   *
   * @returns Promise resolving to metrics data
   * @throws Error if the request fails
   */
  async getMetrics(): Promise<LlamaCppMetricsResponse> {
    const response = await fetch(`${this.baseURL}/metrics`);

    if (!response.ok) {
      throw new Error(`Get metrics failed: ${response.status} ${response.statusText}`);
    }

    // Metrics endpoint might return Prometheus format or JSON
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    } else {
      // Return raw text for Prometheus format
      const text = await response.text();
      return { raw: text };
    }
  }

  /**
   * Retrieves processing slot status (debugging endpoint)
   *
   * WARNING: This endpoint may expose sensitive information including prompt content.
   * The llama.cpp documentation strongly advises against enabling this in production.
   * Only use this endpoint in development/debugging environments.
   *
   * @returns Promise resolving to slot status information
   * @throws Error if the request fails or endpoint is not enabled
   */
  async getSlots(): Promise<LlamaCppSlotsResponse> {
    const response = await fetch(`${this.baseURL}/slots`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Slots endpoint not enabled. Start server with --slots flag to enable.');
      }
      throw new Error(`Get slots failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }
}
