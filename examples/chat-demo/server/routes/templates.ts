import express from 'express';
import { llmService } from '../services/llm.js';

export const templatesRouter = express.Router();

/**
 * POST /api/templates/render
 * Render a template with variables and model context
 */
templatesRouter.post('/render', async (req, res) => {
  try {
    const { template, variables, providerId, modelId, presetId, settings } = req.body;

    // Validate input
    if (!template) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Template is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Must provide either (providerId + modelId) or presetId
    if (!presetId && (!providerId || !modelId)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Either presetId or (providerId + modelId) is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Use createMessages to render template with model context
    const result = await llmService.createMessages({
      template,
      variables: variables || {},
      providerId,
      modelId,
      presetId,
      settings
    });

    res.json({
      success: true,
      result: {
        messages: result.messages,
        modelContext: result.modelContext,
        settings: result.settings
      }
    });
  } catch (error) {
    console.error('Error rendering template:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'TEMPLATE_ERROR'
      }
    });
  }
});
