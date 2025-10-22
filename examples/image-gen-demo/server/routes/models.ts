import express from 'express';
import { getImageModels } from '../services/image.js';

export const modelsRouter = express.Router();

/**
 * GET /api/image-models/:providerId
 * Returns list of models for a specific provider
 */
modelsRouter.get('/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;

    if (!providerId) {
      return res.status(400).json({
        error: {
          message: 'Provider ID is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    const models = await getImageModels(providerId);
    res.json({ models });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Failed to fetch models',
        code: 'SERVER_ERROR'
      }
    });
  }
});
