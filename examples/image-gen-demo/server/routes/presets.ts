import express from 'express';
import { getImagePresets } from '../services/image.js';

export const presetsRouter = express.Router();

/**
 * GET /api/image-presets
 * Returns list of all configured image generation presets
 */
presetsRouter.get('/', (req, res) => {
  try {
    const presets = getImagePresets();
    res.json({ presets });
  } catch (error) {
    console.error('Error fetching presets:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Failed to fetch presets',
        code: 'SERVER_ERROR'
      }
    });
  }
});
