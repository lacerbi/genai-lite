/**
 * Prompt builder utilities for constructing structured LLM messages
 * 
 * This module provides functions to construct the final, structured prompts
 * that will be sent to the LLM service. This is the assembly step that turns
 * templates and content into the format required by the LLMService.
 */

import type { LLMMessage } from '../llm/types';
import { renderTemplate } from './template';

/**
 * Extracts text content from XML-style tags and returns both the extracted content
 * and the original string with those sections removed. Handles multiple occurrences
 * of the same tag.
 * 
 * @param xmlString String containing XML-style tags to process
 * @param tagName Name of the tag to extract (without angle brackets)
 * @returns Tuple containing:
 *          - Array of extracted content strings, or null if no matches
 *          - Original string with matched tags and content removed
 */
function extractTextAndClean(xmlString: string, tagName: string): [string[] | null, string] {
  if (typeof xmlString !== 'string' || typeof tagName !== 'string') {
    return [null, xmlString];
  }

  const matches: string[] = [];
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\/${tagName}>`, 'g');
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  const segments: string[] = [];

  while ((match = pattern.exec(xmlString)) !== null) {
    if (lastIndex < match.index) {
      segments.push(xmlString.slice(lastIndex, match.index));
    }
    matches.push(match[1]);
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < xmlString.length) {
    segments.push(xmlString.slice(lastIndex));
  }

  return matches.length > 0 ? [matches, segments.join('')] : [null, xmlString];
}

/**
 * Builds an array of LLM messages from a template string with role tags.
 * 
 * This function takes a template with <SYSTEM>, <USER>, and <ASSISTANT> tags
 * and constructs a properly formatted array of LLMMessage objects ready to be
 * sent to an LLM service.
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

    // Extract sections for each role
    const [systemContent, afterSystem] = extractTextAndClean(processedContent, 'SYSTEM');
    const [userContent, afterUser] = extractTextAndClean(afterSystem, 'USER');
    const [assistantContent] = extractTextAndClean(afterUser, 'ASSISTANT');

    const messages: LLMMessage[] = [];

    // Add system message if present
    if (systemContent && systemContent.length > 0 && systemContent[0].trim()) {
      messages.push({
        role: 'system',
        content: systemContent[0].trim()
      });
    }

    // Interleave user and assistant messages
    const maxLength = Math.max(
      userContent?.length ?? 0,
      assistantContent?.length ?? 0
    );

    for (let i = 0; i < maxLength; i++) {
      if (userContent && i < userContent.length && userContent[i].trim()) {
        messages.push({
          role: 'user',
          content: userContent[i].trim()
        });
      }

      if (assistantContent && i < assistantContent.length && assistantContent[i].trim()) {
        messages.push({
          role: 'assistant',
          content: assistantContent[i].trim()
        });
      }
    }

    return messages;
  } catch (error) {
    throw new Error(`Failed to build messages from template: ${(error as Error).message}`);
  }
}