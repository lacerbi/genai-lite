import express from 'express';
import { generateImage } from '../services/image.js';

export const imageRouter = express.Router();

/**
 * POST /api/generate
 * Generate image(s) from a text prompt
 */
imageRouter.post('/generate', async (req, res) => {
  try {
    const { providerId, modelId, prompt, count, settings } = req.body;

    // Validate required fields
    if (!providerId || !modelId || !prompt) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required fields: providerId, modelId, and prompt are required',
          code: 'VALIDATION_ERROR',
          type: 'validation_error'
        }
      });
    }

    // Validate count if provided
    if (count !== undefined && (count < 1 || count > 4)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Count must be between 1 and 4',
          code: 'VALIDATION_ERROR',
          type: 'validation_error'
        }
      });
    }

    // Progress callback - for now just log, can be upgraded to SSE later
    const onProgress = (progress: any) => {
      console.log(`[${new Date().toISOString()}] Generation progress:`, {
        stage: progress.stage,
        step: `${progress.currentStep}/${progress.totalSteps}`,
        percentage: progress.percentage?.toFixed(1) + '%'
      });
    };

    // Generate the image(s)
    const result = await generateImage({
      providerId,
      modelId,
      prompt,
      count,
      settings,
      onProgress
    });

    // Return the result
    if (result.success) {
      res.json(result);
    } else {
      // Map error types to appropriate HTTP status codes
      const statusCode = getStatusCodeForError(result.error?.type);
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Image generation endpoint error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'SERVER_ERROR',
        type: 'server_error'
      }
    });
  }
});

/**
 * Map error types to HTTP status codes
 */
function getStatusCodeForError(errorType?: string): number {
  switch (errorType) {
    case 'authentication_error':
      return 401;
    case 'rate_limit_error':
      return 429;
    case 'validation_error':
      return 400;
    case 'network_error':
      return 503;
    case 'provider_error':
      return 502;
    default:
      return 500;
  }
}
