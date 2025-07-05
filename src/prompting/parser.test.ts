/**
 * Tests for response parsing utilities
 */

import { parseStructuredContent } from './parser';

describe('parseStructuredContent', () => {
  it('should parse properly closed tags', () => {
    const content = `
      <THOUGHT>I need to analyze this problem</THOUGHT>
      <PLAN>First, I'll break it down into steps</PLAN>
      <CODE>console.log('Hello, world!');</CODE>
    `;
    
    const result = parseStructuredContent(content, ['THOUGHT', 'PLAN', 'CODE']);
    
    expect(result.THOUGHT).toBe('I need to analyze this problem');
    expect(result.PLAN).toBe("First, I'll break it down into steps");
    expect(result.CODE).toBe("console.log('Hello, world!');");
  });

  it('should handle unclosed tags', () => {
    const content = `
      <FIRST>Content 1
      <SECOND>Content 2
      <THIRD>Content 3
    `;
    
    const result = parseStructuredContent(content, ['FIRST', 'SECOND', 'THIRD']);
    
    expect(result.FIRST).toBe('Content 1');
    expect(result.SECOND).toBe('Content 2');
    expect(result.THIRD).toBe('Content 3');
  });

  it('should handle missing tags', () => {
    const content = `
      <PRESENT>This tag exists</PRESENT>
      Some other content here
    `;
    
    const result = parseStructuredContent(content, ['PRESENT', 'MISSING', 'ALSOBISSING']);
    
    expect(result.PRESENT).toBe('This tag exists');
    expect(result.MISSING).toBe('');
    expect(result.ALSOBISSING).toBe('');
  });

  it('should handle extra text outside tags', () => {
    const content = `
      Some preamble text
      <TAG1>Content 1</TAG1>
      Some middle text
      <TAG2>Content 2</TAG2>
      Some ending text
    `;
    
    const result = parseStructuredContent(content, ['TAG1', 'TAG2']);
    
    expect(result.TAG1).toBe('Content 1');
    expect(result.TAG2).toBe('Content 2');
  });

  it('should extract content up to the next tag for unclosed tags', () => {
    const content = `
      <STEP1>First step content
      <STEP2>Second step content
      <STEP3>Third step content</STEP3>
    `;
    
    const result = parseStructuredContent(content, ['STEP1', 'STEP2', 'STEP3']);
    
    expect(result.STEP1).toBe('First step content');
    expect(result.STEP2).toBe('Second step content');
    expect(result.STEP3).toBe('Third step content');
  });

  it('should handle empty tag array', () => {
    const content = '<TAG>Some content</TAG>';
    
    const result = parseStructuredContent(content, []);
    
    expect(result).toEqual({});
  });

  it('should handle multiline content with code', () => {
    const content = `
      <ANALYSIS>
        The code has several issues:
        1. Memory leak
        2. Performance problems
      </ANALYSIS>
      <SOLUTION>
        function fixed() {
          // Clean up resources
          return result;
        }
      </SOLUTION>
    `;
    
    const result = parseStructuredContent(content, ['ANALYSIS', 'SOLUTION']);
    
    expect(result.ANALYSIS).toContain('Memory leak');
    expect(result.ANALYSIS).toContain('Performance problems');
    expect(result.SOLUTION).toContain('function fixed()');
    expect(result.SOLUTION).toContain('Clean up resources');
  });

  it('should handle tags that appear multiple times (only first occurrence)', () => {
    const content = `
      <ITEM>First item</ITEM>
      <ITEM>Second item</ITEM>
      <ITEM>Third item</ITEM>
    `;
    
    const result = parseStructuredContent(content, ['ITEM']);
    
    expect(result.ITEM).toBe('First item');
  });

  it('should preserve order of extraction based on tags array', () => {
    const content = `
      <LAST>Last content</LAST>
      <MIDDLE>Middle content</MIDDLE>
      <FIRST>First content</FIRST>
    `;
    
    const result = parseStructuredContent(content, ['FIRST', 'MIDDLE', 'LAST']);
    
    // Even though LAST appears first in content, it should still extract correctly
    expect(result.FIRST).toBe('First content');
    expect(result.MIDDLE).toBe('Middle content');
    expect(result.LAST).toBe('Last content');
  });

  it('should handle empty content', () => {
    const result = parseStructuredContent('', ['TAG1', 'TAG2']);
    
    expect(result).toEqual({
      TAG1: '',
      TAG2: ''
    });
  });
});