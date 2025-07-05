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