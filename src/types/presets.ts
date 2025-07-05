import type { ApiProviderId, LLMSettings } from '../llm/types';

/**
 * Represents a model preset with pre-configured LLM settings
 * optimized for common use cases.
 */
export interface ModelPreset {
  /** Unique preset identifier, e.g., "gemini-pro-creative-writing" */
  id: string;
  
  /** User-friendly display name, e.g., "Google Gemini - gemini-1.5-pro-002 (Creative)" */
  displayName: string;
  
  /** Optional description of the preset's intended use case */
  description?: string;
  
  /** Provider ID that matches an entry in SUPPORTED_PROVIDERS */
  providerId: ApiProviderId;
  
  /** Model ID that matches a supported model for the given providerId */
  modelId: string;
  
  /** Preset-specific LLM settings, can include provider-specific configurations */
  settings: Partial<LLMSettings>;
}