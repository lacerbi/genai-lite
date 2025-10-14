/**
 * Response parsing utilities for structured LLM output
 * 
 * This module provides utilities for parsing structured text that is returned
 * from an LLM. It helps deconstruct LLM responses into usable data structures.
 */

import type { LLMSettings } from '../llm/types';

/**
 * Metadata structure that can be embedded in templates
 */
export interface TemplateMetadata {
  settings?: Partial<LLMSettings>;
  // Future expansion: name?, description?, version?
}

/**
 * Parses a string containing structured data wrapped in custom XML-style tags.
 * 
 * This function is designed to extract structured content from LLM responses
 * that have been formatted with specific tags. It handles both properly closed
 * tags and unclosed tags (common in streaming responses).
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
 * Extracts content from an XML-like tag if it appears at the beginning of a string.
 * The function is robust to leading whitespace.
 *
 * @param content The string to parse.
 * @param tagName The name of the tag to extract (e.g., 'thinking').
 * @returns An object containing the extracted content and the remaining string.
 *          If the tag is not found at the start, `extracted` will be null.
 */
export function extractInitialTaggedContent(
  content: string,
  tagName: string
): { extracted: string | null; remaining: string } {
  const trimmedContent = content.trimStart();
  const startTag = `<${tagName}>`;
  const endTag = `</${tagName}>`;

  if (trimmedContent.startsWith(startTag)) {
    const endIndex = trimmedContent.indexOf(endTag);
    if (endIndex > -1) {
      const extracted = trimmedContent.substring(startTag.length, endIndex).trim();
      const remaining = trimmedContent.substring(endIndex + endTag.length).trimStart();
      return { extracted, remaining };
    }
  }

  // If the tag pattern is not found at the start, return the original content.
  return { extracted: null, remaining: content };
}

/**
 * Parses role tags from a template string without rendering variables.
 * 
 * This function extracts <SYSTEM>, <USER>, and <ASSISTANT> tags from a template
 * and returns them as an array of role-content pairs. Unlike buildMessagesFromTemplate,
 * this function does NOT render {{variables}} - it parses the template structure as-is.
 * 
 * @param template The template string containing role tags
 * @returns An array of {role, content} objects in the order they appear
 * 
 * @example
 * const template = `
 * <SYSTEM>You are a helpful {{expertise}} assistant.</SYSTEM>
 * <USER>Help me with {{task}}</USER>
 * <ASSISTANT>I'll help you with {{task}}.</ASSISTANT>
 * <USER>Thanks!</USER>
 * `;
 * 
 * const parsed = parseRoleTags(template);
 * // Returns:
 * // [
 * //   { role: 'system', content: 'You are a helpful {{expertise}} assistant.' },
 * //   { role: 'user', content: 'Help me with {{task}}' },
 * //   { role: 'assistant', content: "I'll help you with {{task}}." },
 * //   { role: 'user', content: 'Thanks!' }
 * // ]
 */
export function parseRoleTags(template: string): Array<{ role: string; content: string }> {
  if (typeof template !== 'string') {
    throw new Error('Template must be a string');
  }

  const messages: Array<{ role: string; content: string }> = [];
  
  // Regex to find all role tags in order
  const roleRegex = /<(SYSTEM|USER|ASSISTANT)>([\s\S]*?)<\/\1>/g;
  
  let match;
  while ((match = roleRegex.exec(template)) !== null) {
    const [, roleTag, content] = match;
    const role = roleTag.toLowerCase() as 'system' | 'user' | 'assistant';
    const trimmedContent = content.trim();
    
    if (trimmedContent) {
      messages.push({ role, content: trimmedContent });
    }
  }

  // If no role tags found, treat entire content as a user message
  if (messages.length === 0) {
    const trimmedTemplate = template.trim();
    if (trimmedTemplate) {
      messages.push({ role: 'user', content: trimmedTemplate });
    }
  }

  return messages;
}

/**
 * Parses a template to separate a <META> block from the main content.
 * The <META> block is expected to be at the start and contain a JSON object.
 *
 * @param template The template string to parse.
 * @returns An object with the parsed metadata and the remaining content.
 * 
 * @example
 * const template = `
 * <META>
 * {
 *   "settings": {
 *     "temperature": 0.9,
 *     "thinkingTagFallback": { "enabled": true, "tagName": "reasoning" }
 *   }
 * }
 * </META>
 * <SYSTEM>You are a creative writer...</SYSTEM>
 * <USER>Write a story</USER>
 * `;
 *
 * const { metadata, content } = parseTemplateWithMetadata(template);
 * // metadata.settings will contain the temperature and thinkingTagFallback settings
 * // content will contain the SYSTEM and USER tags
 */
export function parseTemplateWithMetadata(template: string): { 
  metadata: TemplateMetadata;
  content: string;
} {
  // This regular expression looks for a <META> tag at the very beginning of the string.
  // It's designed to be "non-greedy" (the ? after *) so it stops at the first </META>.
  const metaRegex = /^<META>([\s\S]*?)<\/META>/;
  const trimmedTemplate = template.trim();
  const match = trimmedTemplate.match(metaRegex);

  // If no <META> block is found, we just return the original template.
  if (!match) {
    return { metadata: { settings: {} }, content: template };
  }

  const metaContent = match[1]; // This is the text inside the <META> tag.
  const content = trimmedTemplate.replace(metaRegex, '').trim(); // The rest of the template.

  try {
    // We try to parse the metadata as JSON.
    // Handle empty META block case
    const parsed = metaContent.trim() ? JSON.parse(metaContent) : {};
    
    // Basic structure validation - ensure settings is an object if present
    const metadata: TemplateMetadata = {
      settings: (parsed.settings && typeof parsed.settings === 'object') ? parsed.settings : {}
    };
    
    return { metadata, content };
  } catch (error) {
    // If the JSON is invalid, we warn the developer and treat the <META> block
    // as regular text to avoid crashing.
    console.warn('Could not parse <META> block in template. Treating it as content.', error);
    return { metadata: { settings: {} }, content: template };
  }
}