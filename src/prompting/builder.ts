/**
 * Prompt builder utilities for constructing structured LLM messages
 * 
 * This module provides functions to construct the final, structured prompts
 * that will be sent to the LLM service. This is the assembly step that turns
 * templates and content into the format required by the LLMService.
 */

import type { LLMMessage } from '../llm/types';
import { renderTemplate } from './template';
import { parseRoleTags } from './parser';

/**
 * Builds an array of LLM messages from a template string with role tags.
 * 
 * This function takes a template with <SYSTEM>, <USER>, and <ASSISTANT> tags
 * and constructs a properly formatted array of LLMMessage objects ready to be
 * sent to an LLM service.
 * 
 * @deprecated Use `LLMService.createMessages` for a more integrated experience that includes
 * model-aware template rendering. For standalone, model-agnostic role tag parsing, consider
 * using the new `parseRoleTags` utility directly.
 * 
 * @param template The template string with {{variables}} and <ROLE> tags.
 * @param variables An object with values to substitute into the template.
 * @returns An array of LLMMessage objects.
 * 
 * @example
 * const template = `
 * <SYSTEM>You are a helpful assistant specialized in {{expertise}}.</SYSTEM>
 * <USER>Help me with {{task}}</USER>
 * <ASSISTANT>I'll help you with {{task}}. Let me explain...</ASSISTANT>
 * <USER>Can you provide more details?</USER>
 * `;
 * 
 * const messages = buildMessagesFromTemplate(template, {
 *   expertise: 'TypeScript',
 *   task: 'understanding generics'
 * });
 * // Returns an array of LLMMessage objects with roles and content
 */
export function buildMessagesFromTemplate(
  template: string, 
  variables?: Record<string, any>
): LLMMessage[] {
  try {
    if (typeof template !== 'string') {
      throw new Error('Template must be a string');
    }

    // First, render variables using the existing template engine
    let processedContent = template;
    if (variables) {
      processedContent = renderTemplate(template, variables);
    }

    // Then parse the role tags from the rendered content
    const parsedMessages = parseRoleTags(processedContent);

    // Convert to LLMMessage format
    return parsedMessages.map(({ role, content }) => ({
      role: role as 'system' | 'user' | 'assistant',
      content
    }));
  } catch (error) {
    throw new Error(`Failed to build messages from template: ${(error as Error).message}`);
  }
}