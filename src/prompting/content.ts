/**
 * Content preparation utilities for prompt engineering
 * 
 * This module provides utilities that analyze, manipulate, and prepare raw text
 * content before it's assembled into a final prompt structure. These functions
 * help prepare the "ingredients" that will be used in prompt construction.
 */

import { Tiktoken, encodingForModel, TiktokenModel } from 'js-tiktoken';

const tokenizerCache = new Map<TiktokenModel, Tiktoken>();

function getTokenizer(model: TiktokenModel): Tiktoken {
  if (tokenizerCache.has(model)) {
    return tokenizerCache.get(model)!;
  }
  try {
    const tokenizer = encodingForModel(model);
    tokenizerCache.set(model, tokenizer);
    return tokenizer;
  } catch (error) {
    console.error(`Failed to initialize tokenizer for model ${model}:`, error);
    throw error;
  }
}

/**
 * Counts the number of tokens in a text string using the specified model's tokenizer.
 * 
 * @param text The text to count tokens for
 * @param model The model whose tokenizer to use (defaults to 'gpt-4')
 * @returns The number of tokens in the text
 */
export function countTokens(text: string, model: TiktokenModel = 'gpt-4'): number {
  if (!text) return 0;
  try {
    const tokenizer = getTokenizer(model);
    return tokenizer.encode(text).length;
  } catch (error) {
    // Fallback to a rough estimate if tokenizer fails for any reason
    return Math.ceil(text.length / 4);
  }
}

/**
 * Generates an intelligent preview of content that respects logical boundaries.
 * 
 * This function truncates content while trying to break at natural points
 * (empty lines) rather than in the middle of a section.
 * 
 * @param content The content to preview
 * @param config Configuration with minLines and maxLines
 * @returns A truncated preview of the content
 */
export function getSmartPreview(content: string, config: { minLines: number; maxLines: number }): string {
  const lines = content.split('\n');

  // If the file is not longer than maxLines, return it in full
  if (lines.length <= config.maxLines) {
    return content;
  }

  // Always show at least minLines
  let endLine = config.minLines;
  let emptyLinesCount = lines
    .slice(0, config.minLines)
    .filter((line) => line.trim() === '').length;

  // If we haven't found at least two empty lines, keep looking up to maxLines
  if (emptyLinesCount < 2 && lines.length > config.minLines) {
    for (
      let i = config.minLines;
      i < Math.min(lines.length, config.maxLines);
      i++
    ) {
      if (lines[i].trim() === '') {
        endLine = i + 1; // Include the empty line
        break;
      }
      endLine = i + 1;
    }
  }

  return lines.slice(0, endLine).join('\n') + '\n... (content truncated)';
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
 * This is useful for preparing few-shot examples in prompts.
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