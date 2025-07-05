import {
  parseMessagesFromTemplate,
  extractRandomVariables,
  parseStructuredContent
} from './promptBuilder';

describe('promptBuilder utilities', () => {
  describe('parseMessagesFromTemplate', () => {
    it('should parse a simple template with one of each tag', () => {
      const template = `
        <SYSTEM>You are a helpful assistant.</SYSTEM>
        <USER>Hello!</USER>
        <ASSISTANT>Hi there! How can I help you?</ASSISTANT>
      `;
      
      const messages = parseMessagesFromTemplate(template);
      
      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.'
      });
      expect(messages[1]).toEqual({
        role: 'user',
        content: 'Hello!'
      });
      expect(messages[2]).toEqual({
        role: 'assistant',
        content: 'Hi there! How can I help you?'
      });
    });

    it('should handle multiple USER and ASSISTANT tags in order', () => {
      const template = `
        <SYSTEM>System message</SYSTEM>
        <USER>First user message</USER>
        <ASSISTANT>First assistant response</ASSISTANT>
        <USER>Second user message</USER>
        <ASSISTANT>Second assistant response</ASSISTANT>
      `;
      
      const messages = parseMessagesFromTemplate(template);
      
      expect(messages).toHaveLength(5);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toBe('First user message');
      expect(messages[2].role).toBe('assistant');
      expect(messages[2].content).toBe('First assistant response');
      expect(messages[3].role).toBe('user');
      expect(messages[3].content).toBe('Second user message');
      expect(messages[4].role).toBe('assistant');
      expect(messages[4].content).toBe('Second assistant response');
    });

    it('should handle template with missing SYSTEM tag', () => {
      const template = `
        <USER>Hello</USER>
        <ASSISTANT>Hi!</ASSISTANT>
      `;
      
      const messages = parseMessagesFromTemplate(template);
      
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('should substitute variables inside tags', () => {
      const template = `
        <SYSTEM>You are an expert in {{expertise}}.</SYSTEM>
        <USER>Can you help me with {{topic}}?</USER>
        <ASSISTANT>I'd be happy to help with {{topic}}!</ASSISTANT>
      `;
      
      const variables = {
        expertise: 'TypeScript',
        topic: 'generics'
      };
      
      const messages = parseMessagesFromTemplate(template, variables);
      
      expect(messages[0].content).toBe('You are an expert in TypeScript.');
      expect(messages[1].content).toBe('Can you help me with generics?');
      expect(messages[2].content).toBe("I'd be happy to help with generics!");
    });

    it('should handle empty template string', () => {
      const messages = parseMessagesFromTemplate('');
      
      expect(messages).toEqual([]);
    });

    it('should handle template with only whitespace in tags', () => {
      const template = `
        <SYSTEM>   </SYSTEM>
        <USER>Valid message</USER>
        <ASSISTANT>    </ASSISTANT>
      `;
      
      const messages = parseMessagesFromTemplate(template);
      
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Valid message');
    });

    it('should throw error for non-string template', () => {
      expect(() => {
        parseMessagesFromTemplate(123 as any);
      }).toThrow('Template must be a string');
    });

    it('should handle complex nested variables with conditionals', () => {
      const template = `
        <SYSTEM>You are a {{role}}{{ specialized ? \` specialized in {{specialty}}\` : \`\` }}.</SYSTEM>
        <USER>{{greeting}}</USER>
      `;
      
      const variables = {
        role: 'assistant',
        specialized: true,
        specialty: 'code review',
        greeting: 'Hello!'
      };
      
      const messages = parseMessagesFromTemplate(template, variables);
      
      expect(messages[0].content).toBe('You are a assistant specialized in code review.');
      expect(messages[1].content).toBe('Hello!');
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
});