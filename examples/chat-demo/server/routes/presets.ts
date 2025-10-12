import express from 'express';
import { getPresets } from '../services/llm.js';

export const presetsRouter = express.Router();

/**
 * GET /api/presets
 * Get all configured model presets
 */
presetsRouter.get('/', async (req, res) => {
  try {
    const presets = getPresets();
    res.json({ presets });
  } catch (error) {
    console.error('Error fetching presets:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'PRESETS_ERROR'
      }
    });
  }
});
