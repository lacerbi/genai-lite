import { renderTemplate } from './template';

describe('renderTemplate', () => {
  it('should handle simple variable substitution', () => {
    const template = 'Hello, {{ name }}!';
    const result = renderTemplate(template, { name: 'World' });
    expect(result).toBe('Hello, World!');
  });

  it('should handle intelligent newline trimming for empty results', () => {
    const template = 'Start\n{{ showDetails ? `Details here` : `` }}\nEnd';
    const result = renderTemplate(template, { showDetails: false });
    expect(result).toBe('Start\nEnd');
  });

  it('should preserve newlines for non-empty results', () => {
    const template = 'Start\n{{ showDetails ? `Details here` : `` }}\nEnd';
    const result = renderTemplate(template, { showDetails: true });
    expect(result).toBe('Start\nDetails here\nEnd');
  });

  it('should correctly parse ternary logic with backtick-delimited strings', () => {
    const template = '{{ condition ? `A` : `B` }}';
    expect(renderTemplate(template, { condition: true })).toBe('A');
    expect(renderTemplate(template, { condition: false })).toBe('B');
  });

  it('should handle multi-line strings in backticks', () => {
    const template = '{{ condition ? `Line 1\nLine 2` : `Single Line` }}';
    const result = renderTemplate(template, { condition: true });
    expect(result).toBe('Line 1\nLine 2');
  });

  it('should handle ternary expressions with only a true part', () => {
    const template = 'Data: {{ data ? `{{data}}` : `` }}';
    expect(renderTemplate(template, { data: 'Exists' })).toBe('Data: Exists');
    expect(renderTemplate(template, { data: false })).toBe('Data: ');
  });

  it('should handle escaped backticks within the template strings', () => {
    const template = '{{ flag ? `This is a \\`backtick\\`` : `` }}';
    const result = renderTemplate(template, { flag: true });
    expect(result).toBe('This is a `backtick`');
  });

  it('should handle undefined variables', () => {
    const template = 'Value: {{ undefinedVar }}';
    const result = renderTemplate(template, {});
    expect(result).toBe('Value: ');
  });

  it('should handle boolean values', () => {
    const template = 'Boolean: {{ boolValue }}';
    expect(renderTemplate(template, { boolValue: true })).toBe('Boolean: true');
    expect(renderTemplate(template, { boolValue: false })).toBe('Boolean: false');
  });

  it('should handle numeric values', () => {
    const template = 'Number: {{ numValue }}';
    expect(renderTemplate(template, { numValue: 42 })).toBe('Number: 42');
    expect(renderTemplate(template, { numValue: 0 })).toBe('Number: 0');
  });

  it('should handle nested variable substitution in ternary true branch', () => {
    const template = '{{ showName ? `Hello, {{name}}!` : `Hello, stranger!` }}';
    const result = renderTemplate(template, { showName: true, name: 'Alice' });
    expect(result).toBe('Hello, Alice!');
  });

  it('should handle nested variable substitution in ternary false branch', () => {
    const template = '{{ showName ? `Hello, {{name}}!` : `Hello, {{fallback}}!` }}';
    const result = renderTemplate(template, { showName: false, fallback: 'Guest' });
    expect(result).toBe('Hello, Guest!');
  });

  it('should handle multiple variable substitutions', () => {
    const template = '{{ greeting }}, {{ name }}! {{ farewell }}';
    const result = renderTemplate(template, {
      greeting: 'Hello',
      name: 'World',
      farewell: 'Goodbye'
    });
    expect(result).toBe('Hello, World! Goodbye');
  });

  it('should handle special task_context variable with empty string', () => {
    const template = 'Context: {{ task_context }}';
    expect(renderTemplate(template, { task_context: '' })).toBe('Context: ');
    expect(renderTemplate(template, { task_context: '  ' })).toBe('Context: ');
    expect(renderTemplate(template, { task_context: 'Some context' })).toBe('Context: Some context');
  });

  it('should handle complex nested templates', () => {
    const template = `
Project: {{ projectName }}
{{ hasFiles ? \`## Files
{{ fileList }}\` : \`No files selected\` }}
{{ showSummary ? \`
## Summary
{{ summary }}\` : \`\` }}
End
`;
    const result = renderTemplate(template, {
      projectName: 'MyProject',
      hasFiles: true,
      fileList: '- file1.js\n- file2.js',
      showSummary: false,
      summary: 'This is a summary'
    });
    expect(result).toBe(`
Project: MyProject
## Files
- file1.js
- file2.js
End
`);
  });

  it('should handle backward compatible quote-based ternary syntax', () => {
    const template = '{{ condition ? "True value" : "False value" }}';
    expect(renderTemplate(template, { condition: true })).toBe('True value');
    expect(renderTemplate(template, { condition: false })).toBe('False value');
  });

  it('should handle single quotes in backward compatible syntax', () => {
    const template = "{{ condition ? 'True value' : 'False value' }}";
    expect(renderTemplate(template, { condition: true })).toBe('True value');
    expect(renderTemplate(template, { condition: false })).toBe('False value');
  });

  it('should handle whitespace around expressions', () => {
    const template = '{{   name   }}';
    const result = renderTemplate(template, { name: 'Test' });
    expect(result).toBe('Test');
  });

  it('should handle whitespace in ternary expressions', () => {
    const template = '{{   condition   ?   `True`   :   `False`   }}';
    expect(renderTemplate(template, { condition: true })).toBe('True');
  });

  it('should handle empty template', () => {
    const template = '';
    const result = renderTemplate(template, { any: 'value' });
    expect(result).toBe('');
  });

  it('should handle template with no placeholders', () => {
    const template = 'Just plain text';
    const result = renderTemplate(template, { any: 'value' });
    expect(result).toBe('Just plain text');
  });
});