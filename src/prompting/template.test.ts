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

  describe('colon handling in quoted strings', () => {
    it('should handle colon in double-quoted true branch', () => {
      const template = '{{ isDraft ? "Note: This is a draft" : "Published" }}';
      expect(renderTemplate(template, { isDraft: true })).toBe('Note: This is a draft');
      expect(renderTemplate(template, { isDraft: false })).toBe('Published');
    });

    it('should handle colon in single-quoted true branch', () => {
      const template = "{{ isDraft ? 'Note: This is a draft' : 'Published' }}";
      expect(renderTemplate(template, { isDraft: true })).toBe('Note: This is a draft');
      expect(renderTemplate(template, { isDraft: false })).toBe('Published');
    });

    it('should handle colon in both branches', () => {
      const template = '{{ isDraft ? "Status: Draft" : "Status: Published" }}';
      expect(renderTemplate(template, { isDraft: true })).toBe('Status: Draft');
      expect(renderTemplate(template, { isDraft: false })).toBe('Status: Published');
    });

    it('should handle multiple colons in quoted strings', () => {
      const template = '{{ showTime ? "Time: 10:30:45" : "Time: Not available" }}';
      expect(renderTemplate(template, { showTime: true })).toBe('Time: 10:30:45');
      expect(renderTemplate(template, { showTime: false })).toBe('Time: Not available');
    });

    it('should handle escaped quotes with colons', () => {
      const template = '{{ useAdvanced ? "He said: \\"Hello\\"" : "Simple greeting" }}';
      expect(renderTemplate(template, { useAdvanced: true })).toBe('He said: "Hello"');
    });

    it('should handle mixed quote types', () => {
      const template = `{{ showBoth ? "Bob's message: 'Hi there'" : 'Alice said: "Hello"' }}`;
      expect(renderTemplate(template, { showBoth: true })).toBe("Bob's message: 'Hi there'");
      expect(renderTemplate(template, { showBoth: false })).toBe('Alice said: "Hello"');
    });

    it('should handle URL-like strings with colons', () => {
      const template = '{{ useHttps ? "https://example.com" : "http://example.com" }}';
      expect(renderTemplate(template, { useHttps: true })).toBe('https://example.com');
      expect(renderTemplate(template, { useHttps: false })).toBe('http://example.com');
    });

    it('should work with backtick syntax (regression test)', () => {
      const template = '{{ isDraft ? `Note: This is a draft` : `Status: Published` }}';
      expect(renderTemplate(template, { isDraft: true })).toBe('Note: This is a draft');
      expect(renderTemplate(template, { isDraft: false })).toBe('Status: Published');
    });

    it('should handle no false branch with colon in true branch', () => {
      const template = '{{ showNote ? "Note: Important information" }}';
      expect(renderTemplate(template, { showNote: true })).toBe('Note: Important information');
      expect(renderTemplate(template, { showNote: false })).toBe('');
    });

    it('should handle colons with logical operators', () => {
      const template = '{{ isActive && hasAccess ? "Status: Active" : "Status: Inactive" }}';
      expect(renderTemplate(template, { isActive: true, hasAccess: true })).toBe('Status: Active');
      expect(renderTemplate(template, { isActive: false, hasAccess: true })).toBe('Status: Inactive');
    });
  });

  describe('logical operators in conditions', () => {
    it('should handle NOT operator (!)', () => {
      const template = '{{ !isDisabled ? `Enabled` : `Disabled` }}';
      expect(renderTemplate(template, { isDisabled: false })).toBe('Enabled');
      expect(renderTemplate(template, { isDisabled: true })).toBe('Disabled');
    });

    it('should handle AND operator (&&)', () => {
      const template = '{{ hasPermission && isActive ? `Show button` : `Hide button` }}';
      expect(renderTemplate(template, { hasPermission: true, isActive: true })).toBe('Show button');
      expect(renderTemplate(template, { hasPermission: true, isActive: false })).toBe('Hide button');
      expect(renderTemplate(template, { hasPermission: false, isActive: true })).toBe('Hide button');
      expect(renderTemplate(template, { hasPermission: false, isActive: false })).toBe('Hide button');
    });

    it('should handle OR operator (||)', () => {
      const template = '{{ isAdmin || isOwner ? `Has access` : `No access` }}';
      expect(renderTemplate(template, { isAdmin: true, isOwner: false })).toBe('Has access');
      expect(renderTemplate(template, { isAdmin: false, isOwner: true })).toBe('Has access');
      expect(renderTemplate(template, { isAdmin: true, isOwner: true })).toBe('Has access');
      expect(renderTemplate(template, { isAdmin: false, isOwner: false })).toBe('No access');
    });

    it('should handle NOT with AND', () => {
      const template = '{{ !isDraft && isPublished ? `Show public` : `Hide` }}';
      expect(renderTemplate(template, { isDraft: false, isPublished: true })).toBe('Show public');
      expect(renderTemplate(template, { isDraft: true, isPublished: true })).toBe('Hide');
    });

    it('should handle NOT with OR', () => {
      const template = '{{ !isBlocked || isAdmin ? `Allow` : `Deny` }}';
      expect(renderTemplate(template, { isBlocked: false, isAdmin: false })).toBe('Allow');
      expect(renderTemplate(template, { isBlocked: true, isAdmin: true })).toBe('Allow');
      expect(renderTemplate(template, { isBlocked: true, isAdmin: false })).toBe('Deny');
    });

    it('should handle NOT on both sides of AND', () => {
      const template = '{{ !isLoading && !hasError ? `Ready` : `Not ready` }}';
      expect(renderTemplate(template, { isLoading: false, hasError: false })).toBe('Ready');
      expect(renderTemplate(template, { isLoading: true, hasError: false })).toBe('Not ready');
      expect(renderTemplate(template, { isLoading: false, hasError: true })).toBe('Not ready');
    });

    it('should handle whitespace around operators', () => {
      const template = '{{  !isDisabled   &&   isVisible  ?  `Show`  :  `Hide`  }}';
      expect(renderTemplate(template, { isDisabled: false, isVisible: true })).toBe('Show');
    });

    it('should handle undefined variables in logical expressions', () => {
      const template = '{{ undefinedVar && definedVar ? `Both true` : `At least one false` }}';
      expect(renderTemplate(template, { definedVar: true })).toBe('At least one false');
    });

    it('should handle falsy values in logical expressions', () => {
      const template = '{{ nullVar || zero ? `Has truthy` : `All falsy` }}';
      expect(renderTemplate(template, { nullVar: null, zero: 0 })).toBe('All falsy');
      
      const template2 = '{{ emptyString || text ? `Has truthy` : `All falsy` }}';
      expect(renderTemplate(template2, { emptyString: '', text: 'hello' })).toBe('Has truthy');
    });

    it('should fallback to simple lookup for complex expressions', () => {
      // More than 2 operands should fallback
      const template = '{{ a && b && c ? `True` : `False` }}';
      const result = renderTemplate(template, { 'a && b && c': true });
      expect(result).toBe('True');
    });

    it('should handle nested templates with logical operators', () => {
      const template = '{{ showDetails && hasData ? `Details: {{data}}` : `No details` }}';
      expect(renderTemplate(template, { showDetails: true, hasData: true, data: 'Important info' }))
        .toBe('Details: Important info');
      expect(renderTemplate(template, { showDetails: false, hasData: true, data: 'Important info' }))
        .toBe('No details');
    });
  });
});