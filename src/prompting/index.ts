/**
 * Prompting utilities for advanced LLM prompt engineering
 * 
 * This module provides a complete toolkit for prompt engineering workflows:
 * - Template rendering with variable substitution and conditionals
 * - Content preparation and analysis (token counting, smart previews)
 * - Response parsing for extracting structured data from LLM outputs
 */

// Template rendering
export { renderTemplate } from './template';

// Content preparation utilities
export { countTokens, getSmartPreview, extractRandomVariables } from './content';

// Response parsing
export { parseStructuredContent, extractInitialTaggedContent, parseRoleTags } from './parser';