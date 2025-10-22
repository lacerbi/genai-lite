import express from 'express';
import { getImageProviders } from '../services/image.js';

export const providersRouter = express.Router();

/**
 * GET /api/image-providers
 * Returns list of all image providers with availability status
 */
providersRouter.get('/', async (req, res) => {
  try {
    const providers = await getImageProviders();
    res.json({ providers });
  } catch (error) {
    console.error('Error fetching image providers:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Failed to fetch providers',
        code: 'SERVER_ERROR'
      }
    });
  }
});
