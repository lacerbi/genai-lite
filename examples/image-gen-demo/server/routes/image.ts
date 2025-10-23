/**
 * Image Generation Routes
 *
 * Provides two endpoints for image generation:
 * 1. POST /api/generate - Standard JSON response (for OpenAI)
 * 2. POST /api/generate-stream - Server-Sent Events streaming (for genai-electron)
 *
 * The streaming endpoint provides real-time progress updates via SSE,
 * while the standard endpoint returns the complete result in one response.
 */

import express from 'express';
import { generateImage } from '../services/image.js';

export const imageRouter = express.Router();

/**
 * POST /api/generate
 * Generate image(s) from a text prompt (standard JSON response)
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

    // Progress callback - just log for standard endpoint
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
 * POST /api/generate-stream
 * Generate image(s) with real-time progress updates via Server-Sent Events (SSE)
 */
imageRouter.post('/generate-stream', async (req, res) => {
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

    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Track generation start time
    const startTime = Date.now();

    // Helper to send SSE event
    const sendEvent = (eventType: string, data: any) => {
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial start event
    sendEvent('start', {
      message: 'Generation started',
      timestamp: startTime
    });

    // Progress callback - stream via SSE
    const onProgress = (progress: any) => {
      const elapsed = Date.now() - startTime;
      sendEvent('progress', {
        stage: progress.stage,
        currentStep: progress.currentStep,
        totalSteps: progress.totalSteps,
        percentage: progress.percentage,
        currentImage: progress.currentImage,
        totalImages: progress.totalImages,
        elapsed
      });
    };

    try {
      // Generate the image(s)
      const result = await generateImage({
        providerId,
        modelId,
        prompt,
        count,
        settings,
        onProgress
      });

      // Send result or error as final event
      if (result.success) {
        sendEvent('complete', {
          result: result.result,
          elapsed: Date.now() - startTime
        });
      } else {
        sendEvent('error', {
          error: result.error,
          elapsed: Date.now() - startTime
        });
      }
    } catch (error) {
      console.error('Generation error:', error);
      sendEvent('error', {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'SERVER_ERROR',
          type: 'server_error'
        },
        elapsed: Date.now() - startTime
      });
    }

    // End the stream
    res.end();
  } catch (error) {
    console.error('Stream endpoint error:', error);
    // If headers not sent yet, send JSON error
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'SERVER_ERROR',
          type: 'server_error'
        }
      });
    } else {
      res.end();
    }
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
