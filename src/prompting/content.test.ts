/**
 * Tests for content preparation utilities
 */

import { countTokens, getSmartPreview, extractRandomVariables } from './content';
import type { TiktokenModel } from 'js-tiktoken';

describe('Content Utilities', () => {
  describe('countTokens', () => {
    it('should return 0 for empty string', () => {
      expect(countTokens('')).toBe(0);
    });

    it('should count tokens for simple text', () => {
      const text = 'Hello, world!';
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(text.length); // Tokens are typically fewer than characters
    });

    it('should count tokens with default gpt-4 model', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
    });

    it('should count tokens with different models', () => {
      const text = 'Testing different models';
      const gpt4Count = countTokens(text, 'gpt-4');
      const gpt35Count = countTokens(text, 'gpt-3.5-turbo');
      
      expect(gpt4Count).toBeGreaterThan(0);
      expect(gpt35Count).toBeGreaterThan(0);
    });

    it('should handle special characters and emojis', () => {
      const text = '🚀 Special chars: @#$% and \n\t newlines';
      const count = countTokens(text);
      expect(count).toBeGreaterThan(0);
    });

    it('should fallback to estimate for invalid model', () => {
      const text = 'Test fallback behavior';
      const count = countTokens(text, 'invalid-model' as TiktokenModel);
      // Should fallback to length/4 estimate
      expect(count).toBe(Math.ceil(text.length / 4));
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      const count = countTokens(longText);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(longText.length);
    });
  });

  describe('getSmartPreview', () => {
    const config = { minLines: 5, maxLines: 10 };

    it('should return full content if shorter than maxLines', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const preview = getSmartPreview(content, config);
      expect(preview).toBe(content);
    });

    it('should truncate at maxLines if no empty lines found', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      const content = lines.join('\n');
      const preview = getSmartPreview(content, config);
      
      const previewLines = preview.split('\n');
      // Should extend up to maxLines when no empty lines are found
      expect(previewLines.length).toBe(config.maxLines + 1); // +1 for truncation message
      expect(preview).toContain('... (content truncated)');
    });

    it('should extend to next empty line within maxLines', () => {
      const content = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6

Line 8
Line 9
Line 10
Line 11`;
      
      const preview = getSmartPreview(content, config);
      const previewLines = preview.split('\n');
      
      // Should include up to line 7 (the empty line)
      expect(previewLines[6]).toBe('');
      expect(preview).toContain('... (content truncated)');
    });

    it('should handle content exactly at maxLines', () => {
      const lines = Array.from({ length: config.maxLines }, (_, i) => `Line ${i + 1}`);
      const content = lines.join('\n');
      const preview = getSmartPreview(content, config);
      
      expect(preview).toBe(content);
    });

    it('should handle empty content', () => {
      const preview = getSmartPreview('', config);
      expect(preview).toBe('');
    });

    it('should handle content with multiple consecutive empty lines', () => {
      const content = `Line 1
Line 2


Line 5
Line 6

Line 8
Line 9
Line 10
Line 11`;
      
      const preview = getSmartPreview(content, config);
      const previewLines = preview.split('\n');
      
      // Should stop at first empty line after minLines
      expect(previewLines.length).toBeLessThanOrEqual(config.maxLines + 1);
      expect(preview).toContain('... (content truncated)');
    });

    it('should respect maxLines limit even with empty lines', () => {
      const lines = Array.from({ length: 15 }, (_, i) => 
        i % 3 === 0 ? '' : `Line ${i + 1}`
      );
      const content = lines.join('\n');
      const preview = getSmartPreview(content, config);
      
      const previewLines = preview.split('\n');
      expect(previewLines.length).toBeLessThanOrEqual(config.maxLines + 1);
    });
  });

  describe('extractRandomVariables', () => {
    it('should extract and flatten random variables', () => {
      const content = `
        <RANDOM_GREETING>Hello</RANDOM_GREETING>
        <RANDOM_GREETING>Hi</RANDOM_GREETING>
        <RANDOM_GREETING>Hey</RANDOM_GREETING>
        <RANDOM_FAREWELL>Goodbye</RANDOM_FAREWELL>
        <RANDOM_FAREWELL>See you</RANDOM_FAREWELL>
      `;
      
      const result = extractRandomVariables(content, { maxPerTag: 3 });
      
      // Check that we have the right keys
      expect(Object.keys(result)).toContain('random_greeting_1');
      expect(Object.keys(result)).toContain('random_greeting_2');
      expect(Object.keys(result)).toContain('random_greeting_3');
      expect(Object.keys(result)).toContain('random_farewell_1');
      expect(Object.keys(result)).toContain('random_farewell_2');
      expect(Object.keys(result)).toContain('random_farewell_3');
      
      // Check that values are from the original set (order is random)
      const greetings = [result.random_greeting_1, result.random_greeting_2, result.random_greeting_3];
      expect(greetings).toContain('Hello');
      expect(greetings).toContain('Hi');
      expect(greetings).toContain('Hey');
      
      const farewells = [result.random_farewell_1, result.random_farewell_2];
      expect(farewells).toContain('Goodbye');
      expect(farewells).toContain('See you');
      
      // Third farewell should be empty
      expect(result.random_farewell_3).toBe('');
    });

    it('should respect maxPerTag option', () => {
      const content = `
        <RANDOM_EXAMPLE>Example 1</RANDOM_EXAMPLE>
        <RANDOM_EXAMPLE>Example 2</RANDOM_EXAMPLE>
        <RANDOM_EXAMPLE>Example 3</RANDOM_EXAMPLE>
        <RANDOM_EXAMPLE>Example 4</RANDOM_EXAMPLE>
        <RANDOM_EXAMPLE>Example 5</RANDOM_EXAMPLE>
      `;
      
      const result = extractRandomVariables(content, { maxPerTag: 2 });
      
      expect(Object.keys(result)).toHaveLength(2);
      expect(result.random_example_1).toBeTruthy();
      expect(result.random_example_2).toBeTruthy();
      expect(result.random_example_3).toBeUndefined();
    });

    it('should handle content with no random tags', () => {
      const content = 'This is just regular content without any random tags.';
      
      const result = extractRandomVariables(content);
      
      expect(result).toEqual({});
    });

    it('should handle multiple tag types', () => {
      const content = `
        <RANDOM_COLOR>red</RANDOM_COLOR>
        <RANDOM_COLOR>blue</RANDOM_COLOR>
        <RANDOM_ANIMAL>cat</RANDOM_ANIMAL>
        <RANDOM_ANIMAL>dog</RANDOM_ANIMAL>
        <RANDOM_FOOD>pizza</RANDOM_FOOD>
      `;
      
      const result = extractRandomVariables(content, { maxPerTag: 2 });
      
      // Check we have entries for each type
      expect(Object.keys(result)).toContain('random_color_1');
      expect(Object.keys(result)).toContain('random_color_2');
      expect(Object.keys(result)).toContain('random_animal_1');
      expect(Object.keys(result)).toContain('random_animal_2');
      expect(Object.keys(result)).toContain('random_food_1');
      expect(Object.keys(result)).toContain('random_food_2');
      
      // Check food has one value and one empty
      expect(result.random_food_1).toBe('pizza');
      expect(result.random_food_2).toBe('');
    });

    it('should use default maxPerTag of 30', () => {
      const content = '<RANDOM_TEST>value</RANDOM_TEST>';
      
      const result = extractRandomVariables(content);
      
      // Should have 30 entries
      expect(Object.keys(result)).toHaveLength(30);
      expect(result.random_test_1).toBe('value');
      expect(result.random_test_30).toBe('');
    });

    it('should handle multiline content in random tags', () => {
      const content = `
        <RANDOM_EXAMPLE>
          This is a multiline
          example with several
          lines of text
        </RANDOM_EXAMPLE>
        <RANDOM_EXAMPLE>Single line</RANDOM_EXAMPLE>
      `;
      
      const result = extractRandomVariables(content, { maxPerTag: 2 });
      
      const values = [result.random_example_1, result.random_example_2];
      expect(values).toContain('Single line');
      expect(values.some(v => v.includes('multiline'))).toBe(true);
    });

    it('should handle empty string input', () => {
      const result = extractRandomVariables('');
      
      expect(result).toEqual({});
    });
  });
});