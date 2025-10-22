import type { ImageGenerationRequest, ImageFailureResponse } from '../../types/image';

/**
 * Validates image generation requests
 */
export class ImageRequestValidator {
  /**
   * Validates the basic structure of an image generation request
   *
   * @param request - The request to validate
   * @returns null if valid, ImageFailureResponse if invalid
   */
  validateRequestStructure(request: ImageGenerationRequest): ImageFailureResponse | null {
    // Validate provider ID
    if (!request.providerId || typeof request.providerId !== 'string') {
      return this.createValidationError(
        request,
        'Missing or invalid providerId',
        'MISSING_PROVIDER_ID',
        'providerId'
      );
    }

    // Validate model ID
    if (!request.modelId || typeof request.modelId !== 'string') {
      return this.createValidationError(
        request,
        'Missing or invalid modelId',
        'MISSING_MODEL_ID',
        'modelId'
      );
    }

    // Validate prompt exists and is a string
    if (request.prompt === undefined || request.prompt === null || typeof request.prompt !== 'string') {
      return this.createValidationError(
        request,
        'Missing or invalid prompt',
        'MISSING_PROMPT',
        'prompt'
      );
    }

    // Validate prompt is not empty/whitespace
    if (request.prompt.trim().length === 0) {
      return this.createValidationError(
        request,
        'Prompt cannot be empty or whitespace-only',
        'EMPTY_PROMPT',
        'prompt'
      );
    }

    // Validate count if provided
    if (request.count !== undefined) {
      const countValidation = this.validateCount(request);
      if (countValidation) {
        return countValidation;
      }
    }

    // Validate settings if provided
    if (request.settings) {
      const settingsValidation = this.validateSettings(request);
      if (settingsValidation) {
        return settingsValidation;
      }
    }

    return null; // Valid
  }

  /**
   * Validates the count parameter
   *
   * @param request - The request containing the count
   * @returns null if valid, ImageFailureResponse if invalid
   */
  private validateCount(request: ImageGenerationRequest): ImageFailureResponse | null {
    const count = request.count;

    if (count === undefined) {
      return null;
    }

    if (!Number.isInteger(count)) {
      return this.createValidationError(
        request,
        'count must be an integer',
        'INVALID_COUNT',
        'count'
      );
    }

    if (count <= 0) {
      return this.createValidationError(
        request,
        'count must be a positive integer (> 0)',
        'INVALID_COUNT',
        'count'
      );
    }

    if (count > 10) {
      return this.createValidationError(
        request,
        'count cannot exceed 10 images per request',
        'INVALID_COUNT',
        'count'
      );
    }

    return null;
  }

  /**
   * Validates settings
   *
   * @param request - The request containing the settings
   * @returns null if valid, ImageFailureResponse if invalid
   */
  private validateSettings(request: ImageGenerationRequest): ImageFailureResponse | null {
    const settings = request.settings;

    if (!settings) {
      return null;
    }

    // Validate width
    if (settings.width !== undefined) {
      if (!Number.isInteger(settings.width) || settings.width < 64 || settings.width > 2048) {
        return this.createValidationError(
          request,
          'Image width must be an integer between 64 and 2048 pixels',
          'INVALID_WIDTH',
          'settings.width'
        );
      }
    }

    // Validate height
    if (settings.height !== undefined) {
      if (!Number.isInteger(settings.height) || settings.height < 64 || settings.height > 2048) {
        return this.createValidationError(
          request,
          'Image height must be an integer between 64 and 2048 pixels',
          'INVALID_HEIGHT',
          'settings.height'
        );
      }
    }

    // Validate diffusion settings if present
    if (settings.diffusion) {
      const diffusion = settings.diffusion;

      // Validate steps
      if (diffusion.steps !== undefined) {
        if (diffusion.steps < 1 || diffusion.steps > 150) {
          return this.createValidationError(
            request,
            'Diffusion steps must be between 1 and 150',
            'INVALID_DIFFUSION_STEPS',
            'settings.diffusion.steps'
          );
        }
      }

      // Validate cfgScale
      if (diffusion.cfgScale !== undefined) {
        if (diffusion.cfgScale < 0.1 || diffusion.cfgScale > 30) {
          return this.createValidationError(
            request,
            'Diffusion cfgScale must be between 0.1 and 30',
            'INVALID_DIFFUSION_CFG_SCALE',
            'settings.diffusion.cfgScale'
          );
        }
      }
    }

    return null;
  }

  /**
   * Creates a validation error response
   *
   * @param request - The original request
   * @param message - Error message
   * @param code - Error code
   * @param param - Parameter that caused the error
   * @returns ImageFailureResponse
   */
  private createValidationError(
    request: Partial<ImageGenerationRequest>,
    message: string,
    code: string,
    param?: string
  ): ImageFailureResponse {
    return {
      object: 'error',
      providerId: request.providerId || 'unknown',
      modelId: request.modelId,
      error: {
        message,
        code,
        type: 'validation_error',
        param,
      },
    };
  }
}
