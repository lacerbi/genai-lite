import { Router } from 'express';
import { sendChatMessage } from '../services/llm.js';
import type { LLMSettings } from 'genai-lite';

export const chatRouter = Router();

/**
 * POST /api/chat
 * Sends a chat message to an LLM provider and returns the response
 *
 * Request body:
 * {
 *   providerId: string,
 *   modelId: string,
 *   messages: Array<{ role: string, content: string }>,
 *   settings?: LLMSettings
 * }
 */
chatRouter.post('/', async (req, res) => {
  try {
    const { providerId, modelId, messages, settings } = req.body;

    // Validate required fields
    if (!providerId || !modelId || !messages) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Missing required fields: providerId, modelId, and messages are required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Validate messages array
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Messages must be a non-empty array',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Validate message structure
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg.role || !msg.content) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Message at index ${i} must have 'role' and 'content' fields`,
            code: 'VALIDATION_ERROR'
          }
        });
      }
      if (!['user', 'assistant', 'system'].includes(msg.role)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Invalid role '${msg.role}' at message index ${i}. Must be 'user', 'assistant', or 'system'`,
            code: 'VALIDATION_ERROR'
          }
        });
      }
    }

    console.log(`Chat request: ${providerId}/${modelId}, ${messages.length} messages`);

    // Send the message to the LLM service
    const result = await sendChatMessage({
      providerId,
      modelId,
      messages,
      settings: settings as LLMSettings | undefined
    });

    // Check if the result is an error response
    if (result.object === 'error') {
      console.error('LLM Error:', result.error);
      return res.status(500).json({
        success: false,
        error: result.error,
        partialResponse: result.partialResponse
      });
    }

    // Success - return the completion
    console.log(`Chat response: ${result.choices[0]?.message?.content?.substring(0, 100)}...`);

    res.json({
      success: true,
      response: {
        id: result.id,
        provider: result.provider,
        model: result.model,
        content: result.choices[0]?.message?.content || '',
        reasoning: result.choices[0]?.reasoning,
        finishReason: result.choices[0]?.finish_reason,
        usage: result.usage
      }
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'SERVER_ERROR'
      }
    });
  }
});
