/**
 * Type definitions for image generation API
 *
 * This module contains all types for the ImageService and image generation adapters.
 * Based on the design specification in docs/dev/2025-10-22-genai-lite-image-api-design.md
 */

/**
 * Image provider ID type - represents a unique identifier for an image generation provider
 */
export type ImageProviderId = string;

/**
 * MIME types supported for generated images
 */
export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

/**
 * Response format options for image data
 */
export type ImageResponseFormat = 'b64_json' | 'url' | 'buffer';

/**
 * Image quality settings
 * - 'auto', 'high', 'medium', 'low': gpt-image-1 models
 * - 'hd', 'standard': dall-e-3
 * - 'standard': dall-e-2
 */
export type ImageQuality = 'auto' | 'high' | 'medium' | 'low' | 'hd' | 'standard';

/**
 * Image style settings (OpenAI-style)
 */
export type ImageStyle = 'vivid' | 'natural';

/**
 * Supported diffusion samplers
 */
export type DiffusionSampler =
  | 'euler_a'
  | 'euler'
  | 'heun'
  | 'dpm2'
  | 'dpm++2s_a'
  | 'dpm++2m'
  | 'dpm++2mv2'
  | 'lcm';

/**
 * Progress stage during image generation
 */
export type ImageProgressStage = 'loading' | 'diffusion' | 'decoding';

/**
 * Callback function for receiving progress updates during image generation
 */
export type ImageProgressCallback = (progress: {
  stage: ImageProgressStage;
  currentStep: number;
  totalSteps: number;
  percentage?: number;
}) => void;

/**
 * Diffusion-specific settings for local/stable-diffusion providers
 */
export interface DiffusionSettings {
  /** Negative prompt to guide what should NOT be in the image */
  negativePrompt?: string;
  /** Number of diffusion steps (default: 20) */
  steps?: number;
  /** CFG scale for prompt adherence (default: 7.5) */
  cfgScale?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Sampling algorithm to use */
  sampler?: DiffusionSampler;
  /** Image width in pixels (default: 512) */
  width?: number;
  /** Image height in pixels (default: 512) */
  height?: number;
  /** Optional callback for receiving progress updates */
  onProgress?: ImageProgressCallback;
}

/**
 * OpenAI-specific settings for gpt-image-1 models
 * These settings are only supported by gpt-image-1 and gpt-image-1-mini models
 */
export interface OpenAISpecificSettings {
  /**
   * Image output format (gpt-image-1 models only)
   * Determines the format of the generated image file.
   * For dall-e-2/dall-e-3, use the top-level responseFormat instead.
   */
  outputFormat?: 'png' | 'jpeg' | 'webp';

  /**
   * Background transparency control (gpt-image-1 models only)
   * - 'transparent': Image will have a transparent background (requires PNG or WebP format)
   * - 'opaque': Image will have an opaque background
   * - 'auto': Model automatically determines the best background (default)
   */
  background?: 'transparent' | 'opaque' | 'auto';

  /**
   * Content moderation level (gpt-image-1 models only)
   * - 'auto': Standard moderation (default)
   * - 'low': Less restrictive content filtering
   */
  moderation?: 'low' | 'auto';

  /**
   * Compression level for JPEG and WebP formats (gpt-image-1 models only)
   * Value must be between 0-100, where 100 is highest quality/least compression.
   * Only applies when outputFormat is 'jpeg' or 'webp'.
   */
  outputCompression?: number;
}

/**
 * Settings for image generation requests
 */
export interface ImageGenerationSettings {
  /** Image dimensions in WxH format (e.g., '1024x1024') */
  size?: '256x256' | '512x512' | '1024x1024' | `${number}x${number}`;
  /** Response format for image data */
  responseFormat?: ImageResponseFormat;
  /** Quality level for generation (OpenAI-style) */
  quality?: ImageQuality;
  /** Style directive for generation (OpenAI-style) */
  style?: ImageStyle;
  /** End-user identifier for tracking/abuse prevention */
  user?: string;
  /** Number of images to generate (alias for count parameter) */
  n?: number;

  /** Diffusion-specific settings (for stable-diffusion providers) */
  diffusion?: DiffusionSettings;

  /** OpenAI-specific settings (for gpt-image-1 models) */
  openai?: OpenAISpecificSettings;
}

/**
 * Resolved image generation settings with all defaults applied
 */
export interface ResolvedImageGenerationSettings {
  /** Image dimensions in WxH format (resolved to string) */
  size: string;
  /** Response format for image data (resolved) */
  responseFormat: ImageResponseFormat;
  /** Quality level for generation (resolved) */
  quality: ImageQuality;
  /** Style directive for generation (resolved) */
  style: ImageStyle;
  /** End-user identifier for tracking/abuse prevention */
  user?: string;
  /** Number of images to generate */
  n?: number;
  /** Diffusion-specific settings with resolved defaults */
  diffusion?: DiffusionSettings & {
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
  };
}

/**
 * Usage metadata from image generation
 */
export interface ImageUsage {
  /** Cost in USD or provider-specific units */
  cost?: number;
  /** Input tokens consumed (for providers that bill by tokens) */
  inputTokens?: number;
  /** Output tokens consumed (for providers that bill by tokens) */
  outputTokens?: number;
  /** Credits consumed (for diffusion credit systems) */
  credits?: number;
  /** Generation time in milliseconds */
  timeTaken?: number;
}

/**
 * A single generated image with metadata
 */
export interface GeneratedImage {
  /** Index of this image in the batch */
  index: number;
  /** MIME type of the image data */
  mimeType: ImageMimeType;
  /** Binary image data */
  data: Buffer;
  /** Base64-encoded image (if requested via responseFormat) */
  b64Json?: string;
  /** Hosted URL to the image (for providers that host images) */
  url?: string;
  /** Effective prompt used (after any provider transformations) */
  prompt?: string;
  /** Random seed used for generation (when available) */
  seed?: number | string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Base request structure for image generation
 */
export interface ImageGenerationRequestBase {
  /** Provider ID to use for generation */
  providerId: ImageProviderId;
  /** Model ID to use for generation */
  modelId: string;
  /** Text prompt describing the desired image */
  prompt: string;
  /** Optional preset ID to use for default settings */
  presetId?: string;
  /** Optional settings to customize generation */
  settings?: ImageGenerationSettings;
  /** Optional metadata for tracking/logging */
  metadata?: Record<string, unknown>;
}

/**
 * Full request structure for image generation including count parameter
 */
export interface ImageGenerationRequest extends ImageGenerationRequestBase {
  /** Number of images to generate (default: 1) */
  count?: number;
}

/**
 * Extended request structure that supports preset IDs
 */
export interface ImageGenerationRequestWithPreset extends Omit<ImageGenerationRequest, 'providerId' | 'modelId'> {
  /** Provider ID (required if not using presetId) */
  providerId?: ImageProviderId;
  /** Model ID (required if not using presetId) */
  modelId?: string;
  /** Preset ID (alternative to providerId/modelId) */
  presetId?: string;
}

/**
 * Successful response from image generation
 */
export interface ImageGenerationResponse {
  /** Response type discriminator */
  object: 'image.result';
  /** Unix timestamp of when the generation completed */
  created: number;
  /** Provider ID that generated the images */
  providerId: ImageProviderId;
  /** Model ID that generated the images */
  modelId: string;
  /** Array of generated images */
  data: GeneratedImage[];
  /** Optional usage/billing metadata */
  usage?: ImageUsage;
}

/**
 * Error response from image generation operations
 */
export interface ImageFailureResponse {
  /** Response type discriminator */
  object: 'error';
  /** Provider ID that attempted generation */
  providerId: ImageProviderId;
  /** Model ID that was requested (if available) */
  modelId?: string;
  /** Error details */
  error: {
    /** Error message */
    message: string;
    /** Error code */
    code?: string | number;
    /** Error type (authentication_error, rate_limit_error, etc.) */
    type?: string;
    /** Parameter that caused the error (if applicable) */
    param?: string;
    /** Original provider error (for debugging) */
    providerError?: any;
  };
  /** Partial response if generation started but didn't complete */
  partialResponse?: Omit<ImageGenerationResponse, 'object'>;
}

/**
 * Capabilities of an image provider
 */
export interface ImageProviderCapabilities {
  /** Whether provider can generate multiple images in one request */
  supportsMultipleImages: boolean;
  /** Whether provider can return base64-encoded images */
  supportsB64Json: boolean;
  /** Whether provider returns hosted URLs for images */
  supportsHostedUrls: boolean;
  /** Whether provider supports progress event callbacks */
  supportsProgressEvents: boolean;
  /** Whether provider supports negative prompts */
  supportsNegativePrompt: boolean;
  /** Default model ID when not specified */
  defaultModelId: string;
}

/**
 * Information about a specific image generation model
 */
export interface ImageModelInfo {
  /** Unique identifier for the model */
  id: string;
  /** Provider that offers this model */
  providerId: ImageProviderId;
  /** Human-readable display name */
  displayName: string;
  /** Optional description of the model's capabilities */
  description?: string;
  /** Default settings for this model */
  defaultSettings?: ImageGenerationSettings;
  /** Capabilities of this model */
  capabilities: ImageProviderCapabilities;
}

/**
 * Information about an image provider
 */
export interface ImageProviderInfo {
  /** Unique identifier for the provider */
  id: ImageProviderId;
  /** Human-readable display name */
  displayName: string;
  /** Optional description of the provider */
  description?: string;
  /** Provider capabilities */
  capabilities: ImageProviderCapabilities;
  /** Available models from this provider */
  models?: ImageModelInfo[];
}

/**
 * Preset configuration for image generation
 */
export interface ImagePreset {
  /** Unique identifier for the preset */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Provider to use */
  providerId: ImageProviderId;
  /** Model to use */
  modelId: string;
  /** Optional prompt prefix to prepend to all prompts */
  promptPrefix?: string;
  /** Default settings for this preset */
  settings?: ImageGenerationSettings;
}

/**
 * Configuration for the image provider adapter
 */
export interface ImageProviderAdapterConfig {
  /** Base URL for the provider API */
  baseURL?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Whether to check health before requests */
  checkHealth?: boolean;
}

/**
 * Interface that all image provider adapters must implement
 */
export interface ImageProviderAdapter {
  /** Unique identifier for this adapter */
  readonly id: ImageProviderId;
  /** Capabilities supported by this adapter */
  readonly supports: ImageProviderCapabilities;

  /**
   * Generate images using this provider
   *
   * @param config - Generation configuration
   * @returns Promise resolving to successful response or throwing an error
   */
  generate(config: {
    request: ImageGenerationRequest;
    resolvedPrompt: string;
    settings: ResolvedImageGenerationSettings;
    apiKey: string | null;
  }): Promise<ImageGenerationResponse>;

  /**
   * Optional method to get available models from this provider
   *
   * @returns Promise resolving to array of available models
   */
  getModels?(): Promise<ImageModelInfo[]>;

  /**
   * Optional method to validate API key format before making requests
   *
   * @param apiKey - The API key to validate
   * @returns True if the key format appears valid for this provider
   */
  validateApiKey?(apiKey: string): boolean;
}

/**
 * Mode for handling presets when initializing ImageService
 */
export type PresetMode = 'extend' | 'replace';

/**
 * Options for initializing ImageService
 */
export interface ImageServiceOptions {
  /** Custom presets to use */
  presets?: ImagePreset[];
  /** How to handle custom presets (extend defaults or replace them) */
  presetMode?: PresetMode;
  /** Custom provider adapters to register */
  adapters?: Record<ImageProviderId, ImageProviderAdapter>;
  /** Override default base URLs per provider */
  baseUrls?: Record<ImageProviderId, string>;
}

/**
 * Result from createPrompt utility
 */
export interface CreatePromptResult {
  /** Rendered prompt text */
  prompt: string;
  /** Resolved settings from preset and template */
  settings?: ImageGenerationSettings;
}
