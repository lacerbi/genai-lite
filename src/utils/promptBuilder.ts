/**
 * Prompt building utilities for advanced LLM prompt engineering
 * 
 * This module provides functions to parse structured prompts, handle random
 * examples for few-shot learning, and extract structured content from LLM responses.
 */

import type { LLMMessage } from '../llm/types';
import { renderTemplate } from './templateEngine';

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
 * Extracts content from XML-style RANDOM_X tags and groups them by tag type.
 * Matches nested content using non-greedy matching.
 * 
 * @param content Content containing RANDOM_X tags
 * @returns Dictionary where keys are the X from RANDOM_X
 *          and values are arrays of content between those tags
 */
function extractRandomTags(content: string): Record<string, string[]> {
  if (typeof content !== 'string') {
    return {};
  }

  const randomDict: Record<string, string[]> = {};
  const pattern = /<RANDOM_(\w+)>([\s\S]*?)<\/RANDOM_\1>/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const [, tag, tagContent] = match;
    if (!randomDict[tag]) {
      randomDict[tag] = [];
    }
    randomDict[tag].push(tagContent);
  }

  return randomDict;
}

/**
 * Extracts content from <RANDOM_...> tags into a flattened variable object.
 * 
 * @param content The string content containing the random tags.
 * @param options Configuration options, like the max number of examples per tag.
 * @returns A record of variables for use in a template engine.
 * 
 * @example
 * const content = `
 * <RANDOM_GREETING>Hello</RANDOM_GREETING>
 * <RANDOM_GREETING>Hi</RANDOM_GREETING>
 * <RANDOM_FAREWELL>Goodbye</RANDOM_FAREWELL>
 * `;
 * 
 * const result = extractRandomVariables(content, { maxPerTag: 2 });
 * // Might return:
 * // {
 * //   random_greeting_1: "Hi",
 * //   random_greeting_2: "Hello",
 * //   random_farewell_1: "Goodbye",
 * //   random_farewell_2: ""
 * // }
 */
export function extractRandomVariables(
  content: string, 
  options?: { maxPerTag?: number }
): Record<string, any> {
  const maxPerTag = options?.maxPerTag ?? 30;
  
  try {
    const randomDict = extractRandomTags(content);
    const flattened: Record<string, string> = {};

    Object.entries(randomDict).forEach(([tag, contents]) => {
      const shuffled = [...contents].sort(() => Math.random() - 0.5);
      
      for (let i = 0; i < maxPerTag; i++) {
        const key = `random_${tag.toLowerCase()}_${i + 1}`;
        flattened[key] = i < shuffled.length ? shuffled[i] : '';
      }
    });

    return flattened;
  } catch (error) {
    throw new Error(`Failed to process random tags: ${(error as Error).message}`);
  }
}

/**
 * Parses a string containing structured data wrapped in custom XML-style tags.
 * 
 * @param content The string to parse (e.g., an LLM response).
 * @param tags An ordered array of tag names to extract.
 * @returns A record mapping each tag name to its extracted content.
 * 
 * @example
 * // Works with properly closed tags:
 * const input1 = `
 * <first>Content 1</first>
 * <second>Content 2</second>
 * `;
 * 
 * // Also works with unclosed tags:
 * const input2 = `
 * <first>Content 1
 * <second>Content 2
 * <third>Content 3
 * `;
 * 
 * // Both produce similar results:
 * const result = parseStructuredContent(input2, ['first', 'second', 'third']);
 * // Returns:
 * // {
 * //   first: "Content 1",
 * //   second: "Content 2",
 * //   third: "Content 3"
 * // }
 */
export function parseStructuredContent(
  content: string, 
  tags: string[]
): Record<string, string> {
  const extracted: Record<string, string> = {};

  tags.forEach((currentTag, index) => {
    const nextTag = index < tags.length - 1 ? tags[index + 1] : '';
    
    const patternStr = nextTag
      ? `<${currentTag}>([\\s\\S]*?)(?:<\\/${currentTag}>|<${nextTag}>)`
      : `<${currentTag}>([\\s\\S]*?)(?:<\\/${currentTag}>|$)`;
    
    const pattern = new RegExp(patternStr, 'g');
    const match = pattern.exec(content);
    
    extracted[currentTag] = match ? match[1].trim() : '';
  });

  return extracted;
}

/**
 * Renders a template and parses it into an array of LLM messages.
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
 * const messages = parseMessagesFromTemplate(template, {
 *   expertise: 'TypeScript',
 *   task: 'understanding generics'
 * });
 * // Returns an array of LLMMessage objects with roles and content
 */
export function parseMessagesFromTemplate(
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
    throw new Error(`Failed to parse messages from template: ${(error as Error).message}`);
  }
}