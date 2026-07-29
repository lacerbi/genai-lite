/**
 * Prompting utilities for advanced LLM prompt engineering
 * 
 * This module provides a complete toolkit for prompt engineering workflows:
 * - Template rendering with variable substitution and conditionals
 * - Content preparation and analysis (token counting, smart previews)
 * - Response parsing for extracting structured data from LLM outputs
 */

// Template rendering
export { renderTemplate } from "./template";

// Content preparation utilities
export { countTokens, getSmartPreview, extractRandomVariables } from "./content";
export {
  codePointBoundToTokenUpperBound,
  countTextTokens,
  estimateTextTokens,
  getTokenProfileById,
  resolveTokenProfile,
  retokenizationUpperBound,
  TOKEN_PROFILE_MAPPING_REVISION
} from "../llm/tokenization";
export type {
  TokenBoundResult,
  TokenCountResult,
  TokenProfile,
  TokenProfileId,
  TokenProfileResolution
} from "../llm/tokenization";

// Response parsing
export {
  parseStructuredContent,
  extractInitialTaggedContent,
  extractMarkerDelimitedContent,
  parseRoleTags,
  parseTemplateWithMetadata
} from "./parser";

// Types
export type { TemplateMetadata } from "./parser";
