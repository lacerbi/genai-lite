import { countTokens, getSmartPreview } from './prompt';
import type { TiktokenModel } from 'js-tiktoken';

describe('Prompt Utilities', () => {
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
});