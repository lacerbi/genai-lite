import express from 'express';
import { LlamaCppServerClient } from 'genai-lite';

export const llamacppRouter = express.Router();

// Initialize llama.cpp server client
const baseURL = process.env.LLAMACPP_API_BASE_URL || 'http://localhost:8080';
const llamacppClient = new LlamaCppServerClient(baseURL);

/**
 * POST /api/llamacpp/tokenize
 * Tokenize text using llama.cpp server
 */
llamacppRouter.post('/tokenize', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Content is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    const result = await llamacppClient.tokenize(content);

    res.json({
      success: true,
      tokens: result.tokens,
      tokenCount: result.tokens.length
    });
  } catch (error) {
    console.error('Error tokenizing text:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'llama.cpp server not available',
        code: 'LLAMACPP_ERROR'
      }
    });
  }
});

/**
 * GET /api/llamacpp/health
 * Check llama.cpp server health
 */
llamacppRouter.get('/health', async (req, res) => {
  try {
    const health = await llamacppClient.getHealth();

    res.json({
      success: true,
      health: {
        status: health.status
      }
    });
  } catch (error) {
    console.error('Error checking llama.cpp health:', error);
    res.status(503).json({
      success: false,
      error: {
        message: 'llama.cpp server not available',
        code: 'LLAMACPP_UNAVAILABLE'
      }
    });
  }
});

/**
 * POST /api/llamacpp/embedding
 * Generate embeddings using llama.cpp server
 */
llamacppRouter.post('/embedding', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Content is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    const result = await llamacppClient.createEmbedding(content);

    res.json({
      success: true,
      embedding: result.embedding,
      dimension: result.embedding.length
    });
  } catch (error) {
    console.error('Error generating embedding:', error);

    // Check for 501 Not Implemented (embeddings not enabled)
    const errorMessage = error instanceof Error ? error.message : 'llama.cpp server not available';
    if (errorMessage.includes('501') || errorMessage.includes('not supported') || errorMessage.includes('--embeddings')) {
      res.status(501).json({
        success: false,
        error: {
          message: 'Embeddings not enabled. Restart llama-server with --embeddings flag',
          code: 'EMBEDDINGS_NOT_ENABLED',
          hint: 'llama-server -m /path/to/model.gguf --embeddings'
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          message: errorMessage,
          code: 'LLAMACPP_ERROR'
        }
      });
    }
  }
});

/**
 * GET /api/llamacpp/models
 * Get the currently loaded model from llama.cpp server
 */
llamacppRouter.get('/models', async (req, res) => {
  try {
    // Query the OpenAI-compatible /v1/models endpoint
    const response = await fetch(`${baseURL}/v1/models`);

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Extract model information from the response
    // llama.cpp returns: { data: [{ id: "model-name", ... }] }
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      return res.status(500).json({
        success: false,
        error: {
          message: 'No models loaded in llama.cpp server',
          code: 'NO_MODELS_LOADED'
        }
      });
    }

    // Get the first (and typically only) model
    const model = data.data[0];
    const modelId = model.id;

    // Strip "models/" prefix if present and remove .gguf extension for cleaner display
    const cleanModelId = modelId
      .replace(/^models\//, '')
      .replace(/\.gguf$/, '');

    res.json({
      success: true,
      models: [{
        id: cleanModelId,
        name: cleanModelId,
        providerId: 'llamacpp',
        contextWindow: 8192, // Default, actual value in model.meta if needed
        inputPrice: 0,
        outputPrice: 0,
        description: 'Currently loaded model from llama.cpp server',
        maxTokens: 4096,
        supportsImages: false,
        supportsPromptCache: false
      }]
    });
  } catch (error) {
    console.error('Error fetching llama.cpp models:', error);
    res.status(503).json({
      success: false,
      error: {
        message: 'llama.cpp server not available or cannot fetch models',
        code: 'LLAMACPP_UNAVAILABLE'
      }
    });
  }
});
