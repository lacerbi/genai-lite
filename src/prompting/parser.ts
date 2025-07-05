/**
 * Response parsing utilities for structured LLM output
 * 
 * This module provides utilities for parsing structured text that is returned
 * from an LLM. It helps deconstruct LLM responses into usable data structures.
 */

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