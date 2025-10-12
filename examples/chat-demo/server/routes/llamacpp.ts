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
    const health = await llamacppClient.health();

    res.json({
      success: true,
      health: {
        status: health.status,
        slotsIdle: health.slots_idle,
        slotsProcessing: health.slots_processing
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
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'llama.cpp server not available',
        code: 'LLAMACPP_ERROR'
      }
    });
  }
});
