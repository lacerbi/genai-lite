/**
 * Tests for prompt builder utilities
 */

import { buildMessagesFromTemplate } from './builder';

describe('buildMessagesFromTemplate', () => {
  it('should parse a simple template with one of each tag', () => {
    const template = `
      <SYSTEM>You are a helpful assistant.</SYSTEM>
      <USER>Hello!</USER>
      <ASSISTANT>Hi there! How can I help you?</ASSISTANT>
    `;
    
    const messages = buildMessagesFromTemplate(template);
    
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
    
    const messages = buildMessagesFromTemplate(template);
    
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
    
    const messages = buildMessagesFromTemplate(template);
    
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
    
    const messages = buildMessagesFromTemplate(template, variables);
    
    expect(messages[0].content).toBe('You are an expert in TypeScript.');
    expect(messages[1].content).toBe('Can you help me with generics?');
    expect(messages[2].content).toBe("I'd be happy to help with generics!");
  });

  it('should handle empty template string', () => {
    const messages = buildMessagesFromTemplate('');
    
    expect(messages).toEqual([]);
  });

  it('should handle template with only whitespace in tags', () => {
    const template = `
      <SYSTEM>   </SYSTEM>
      <USER>Valid message</USER>
      <ASSISTANT>    </ASSISTANT>
    `;
    
    const messages = buildMessagesFromTemplate(template);
    
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Valid message');
  });

  it('should throw error for non-string template', () => {
    expect(() => {
      buildMessagesFromTemplate(123 as any);
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
    
    const messages = buildMessagesFromTemplate(template, variables);
    
    expect(messages[0].content).toBe('You are a assistant specialized in code review.');
    expect(messages[1].content).toBe('Hello!');
  });
});