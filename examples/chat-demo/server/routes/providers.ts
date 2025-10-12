import { Router } from 'express';
import { getProviders } from '../services/llm.js';

export const providersRouter = Router();

/**
 * GET /api/providers
 * Returns list of all supported LLM providers with availability status
 */
providersRouter.get('/', async (req, res) => {
  try {
    const providers = await getProviders();

    res.json({
      success: true,
      providers
    });
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'PROVIDERS_ERROR'
      }
    });
  }
});
