/**
 * Tests for response parsing utilities
 */

import { parseStructuredContent, extractInitialTaggedContent, parseRoleTags } from './parser';

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

describe('extractInitialTaggedContent', () => {
  it('should extract content from a tag at the beginning', () => {
    const content = '<thinking>I am thinking about this problem.</thinking>Here is the answer.';
    
    const result = extractInitialTaggedContent(content, 'thinking');
    
    expect(result.extracted).toBe('I am thinking about this problem.');
    expect(result.remaining).toBe('Here is the answer.');
  });

  it('should handle leading whitespace', () => {
    const content = '  \n  <thinking>My thoughts here</thinking>The actual response';
    
    const result = extractInitialTaggedContent(content, 'thinking');
    
    expect(result.extracted).toBe('My thoughts here');
    expect(result.remaining).toBe('The actual response');
  });

  it('should not extract when tag is in the middle', () => {
    const content = 'Some preamble <thinking>This is in the middle</thinking> and more text';
    
    const result = extractInitialTaggedContent(content, 'thinking');
    
    expect(result.extracted).toBeNull();
    expect(result.remaining).toBe('Some preamble <thinking>This is in the middle</thinking> and more text');
  });

  it('should handle no tag present', () => {
    const content = 'This is just regular text without any special tags.';
    
    const result = extractInitialTaggedContent(content, 'thinking');
    
    expect(result.extracted).toBeNull();
    expect(result.remaining).toBe('This is just regular text without any special tags.');
  });

  it('should work with different tag names', () => {
    const content = '<scratchpad>Working through the logic...</scratchpad>Final answer is 42.';
    
    const result = extractInitialTaggedContent(content, 'scratchpad');
    
    expect(result.extracted).toBe('Working through the logic...');
    expect(result.remaining).toBe('Final answer is 42.');
  });

  it('should handle unclosed tag at start', () => {
    const content = '<thinking>This tag is never closed and continues...';
    
    const result = extractInitialTaggedContent(content, 'thinking');
    
    expect(result.extracted).toBeNull();
    expect(result.remaining).toBe('<thinking>This tag is never closed and continues...');
  });

  it('should handle multiline content within tags', () => {
    const content = `<thinking>
      Step 1: Analyze the problem
      Step 2: Break it down
      Step 3: Solve each part
    </thinking>
    The solution is to approach it systematically.`;
    
    const result = extractInitialTaggedContent(content, 'thinking');
    
    expect(result.extracted).toBe(`Step 1: Analyze the problem
      Step 2: Break it down
      Step 3: Solve each part`);
    expect(result.remaining).toBe('The solution is to approach it systematically.');
  });

  it('should handle empty tag', () => {
    const content = '<thinking></thinking>Here is the response.';
    
    const result = extractInitialTaggedContent(content, 'thinking');
    
    expect(result.extracted).toBe('');
    expect(result.remaining).toBe('Here is the response.');
  });

  it('should handle empty content', () => {
    const result = extractInitialTaggedContent('', 'thinking');
    
    expect(result.extracted).toBeNull();
    expect(result.remaining).toBe('');
  });

  it('should preserve whitespace after the closing tag', () => {
    const content = '<thinking>Thoughts</thinking>   \n\n   Response here';
    
    const result = extractInitialTaggedContent(content, 'thinking');
    
    expect(result.extracted).toBe('Thoughts');
    expect(result.remaining).toBe('Response here');
  });
});

describe('parseRoleTags', () => {
  it('should parse basic role tags with variables', () => {
    const template = `
      <SYSTEM>You are a helpful {{expertise}} assistant.</SYSTEM>
      <USER>Help me with {{task}}</USER>
      <ASSISTANT>I'll help you with {{task}}.</ASSISTANT>
    `;
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'system', content: 'You are a helpful {{expertise}} assistant.' },
      { role: 'user', content: 'Help me with {{task}}' },
      { role: 'assistant', content: "I'll help you with {{task}}." }
    ]);
  });

  it('should handle multiple user/assistant turns', () => {
    const template = `
      <USER>First question</USER>
      <ASSISTANT>First answer</ASSISTANT>
      <USER>Follow-up question</USER>
      <ASSISTANT>Follow-up answer</ASSISTANT>
    `;
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Follow-up question' },
      { role: 'assistant', content: 'Follow-up answer' }
    ]);
  });

  it('should handle template with only system message', () => {
    const template = '<SYSTEM>You are a coding assistant.</SYSTEM>';
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'system', content: 'You are a coding assistant.' }
    ]);
  });

  it('should treat content without tags as user message', () => {
    const template = 'Hello, can you help me with {{problem}}?';
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'user', content: 'Hello, can you help me with {{problem}}?' }
    ]);
  });

  it('should handle empty template', () => {
    const result = parseRoleTags('');
    
    expect(result).toEqual([]);
  });

  it('should handle whitespace-only template', () => {
    const result = parseRoleTags('   \n\t   ');
    
    expect(result).toEqual([]);
  });

  it('should preserve multiline content', () => {
    const template = `<USER>
      Please help me with:
      1. {{task1}}
      2. {{task2}}
      3. {{task3}}
    </USER>`;
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'user', content: 'Please help me with:\n      1. {{task1}}\n      2. {{task2}}\n      3. {{task3}}' }
    ]);
  });

  it('should ignore empty role tags', () => {
    const template = `
      <SYSTEM>System prompt</SYSTEM>
      <USER></USER>
      <ASSISTANT>   </ASSISTANT>
      <USER>Real question</USER>
    `;
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Real question' }
    ]);
  });

  it('should handle mixed case tags', () => {
    const template = '<System>System</System><User>User</User><Assistant>Assistant</Assistant>';
    
    const result = parseRoleTags(template);
    
    // Should only match uppercase tags as per the regex
    expect(result).toEqual([
      { role: 'user', content: '<System>System</System><User>User</User><Assistant>Assistant</Assistant>' }
    ]);
  });

  it('should handle complex templates with conditionals', () => {
    const template = `
      <SYSTEM>{{ systemPrompt ? systemPrompt : 'Default system prompt' }}</SYSTEM>
      <USER>{{ hasContext ? 'Context: {{context}}\n\n' : '' }}{{question}}</USER>
    `;
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'system', content: "{{ systemPrompt ? systemPrompt : 'Default system prompt' }}" },
      { role: 'user', content: "{{ hasContext ? 'Context: {{context}}\n\n' : '' }}{{question}}" }
    ]);
  });

  it('should preserve special characters and formatting', () => {
    const template = `
      <USER>Code: \`{{code}}\`
      
      Error: "{{error}}"</USER>
      <ASSISTANT>Let me analyze that code...</ASSISTANT>
    `;
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'user', content: 'Code: `{{code}}`\n      \n      Error: "{{error}}"' },
      { role: 'assistant', content: 'Let me analyze that code...' }
    ]);
  });

  it('should handle unclosed tags as regular content', () => {
    const template = 'This has <USER>unclosed tag content';
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'user', content: 'This has <USER>unclosed tag content' }
    ]);
  });

  it('should handle nested-looking structures', () => {
    const template = `<USER>Can you parse <XML>tags</XML> inside content?</USER>`;
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'user', content: 'Can you parse <XML>tags</XML> inside content?' }
    ]);
  });

  it('should throw error for non-string input', () => {
    expect(() => parseRoleTags(null as any)).toThrow('Template must be a string');
    expect(() => parseRoleTags(undefined as any)).toThrow('Template must be a string');
    expect(() => parseRoleTags(123 as any)).toThrow('Template must be a string');
  });

  it('should handle text between role tags', () => {
    const template = `
      Some intro text
      <SYSTEM>System message</SYSTEM>
      Some middle text that should be ignored
      <USER>User message</USER>
      Some ending text
    `;
    
    const result = parseRoleTags(template);
    
    expect(result).toEqual([
      { role: 'system', content: 'System message' },
      { role: 'user', content: 'User message' }
    ]);
  });
});