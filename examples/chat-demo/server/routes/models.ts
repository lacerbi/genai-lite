import { Router } from 'express';
import { getModels } from '../services/llm.js';

export const modelsRouter = Router();

/**
 * GET /api/models/:providerId
 * Returns list of models available for a specific provider
 */
modelsRouter.get('/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;

    if (!providerId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Provider ID is required',
          code: 'INVALID_REQUEST'
        }
      });
    }

    const models = await getModels(providerId);

    if (models.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: `No models found for provider: ${providerId}`,
          code: 'PROVIDER_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      providerId,
      models
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'MODELS_ERROR'
      }
    });
  }
});
