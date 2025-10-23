# Prompting Utilities

Helper functions for working with prompts, templates, and LLM responses.

## Contents

- [Overview](#overview) - Available utilities
- [Template Engine](#template-engine) - Dynamic prompt generation
- [Token Counting](#token-counting) - Count tokens in text
- [Smart Text Preview](#smart-text-preview) - Intelligent text truncation
- [Prompt Engineering Utilities](#prompt-engineering-utilities) - Advanced prompt tools
- [Combining Utilities](#combining-utilities) - Workflow examples
- [Related Documentation](#related-documentation) - Feature guides

## Overview

genai-lite provides utilities for prompt engineering and content manipulation via the `genai-lite/prompting` subpath.

**Template & Content**: `renderTemplate`, `countTokens`, `getSmartPreview`
**Prompt Engineering**: `parseRoleTags`, `parseStructuredContent`, `extractRandomVariables`, `parseTemplateWithMetadata`, `extractInitialTaggedContent`

**Note**: For model-aware message creation, use `LLMService.createMessages()` which combines these utilities with model context. See [LLM Service - Creating Messages from Templates](llm-service.md#creating-messages-from-templates).

## Template Engine

Generate dynamic prompts using variable substitution and conditional logic.

### Import

```typescript
import { renderTemplate } from 'genai-lite/prompting';
```

### Basic Usage

```typescript
// Simple variable substitution
const greeting = renderTemplate('Hello, {{ name }}!', { name: 'World' });
// Result: "Hello, World!"

// Multiple variables
const prompt = renderTemplate(
  'Analyze this {{ language }} code:\n```\n{{ code }}\n```',
  {
    language: 'TypeScript',
    code: 'export const add = (a: number, b: number) => a + b;'
  }
);
```

### Conditional Rendering

Use ternary syntax for conditional content:

```typescript
const prompt = renderTemplate(
  'You are a {{ role }} assistant. {{ hasExpertise ? `Expertise: {{expertise}}` : `General knowledge assistant` }}',
  {
    role: 'coding',
    hasExpertise: true,
    expertise: 'TypeScript, React, Node.js'
  }
);
// Result: "You are a coding assistant. Expertise: TypeScript, React, Node.js"
```

### Logical Operators

Templates support NOT (`!`), AND (`&&`), and OR (`||`) operators (up to 2 operands, no parentheses or mixing):

```typescript
// NOT, AND, OR
const access = renderTemplate(
  '{{ isAuthenticated && !isBanned ? `Welcome {{username}}!` : `Access denied` }}',
  { isAuthenticated: true, isBanned: false, username: 'Alice' }
);

const contact = renderTemplate(
  '{{ hasEmail || hasPhone ? `Contact info available` : `No contact info` }}',
  { hasEmail: false, hasPhone: true }
);
```

### Multi-Line and Newline Handling

Use backticks for multi-line content. Empty conditional results automatically remove trailing newlines:

```typescript
const template = `
System: You are a {{ role }} assistant.
{{ hasExpertise ? `Expertise: {{expertise}}` : `` }}
Task: {{ task }}
`;

const result = renderTemplate(template, {
  role: 'coding',
  hasExpertise: true,
  expertise: 'TypeScript, React',
  task: 'Review code'
});
```

---

## Token Counting

Count the number of tokens in a string using OpenAI's tiktoken library.

### Import

```typescript
import { countTokens } from 'genai-lite/prompting';
```

### Basic Usage

```typescript
const text = 'Hello, this is a sample text for token counting.';
const tokenCount = countTokens(text); // Uses gpt-4 tokenizer by default
console.log(`Token count: ${tokenCount}`);
```

### Specifying a Model

```typescript
// Use a different model's tokenizer
const gpt35Tokens = countTokens(text, 'gpt-3.5-turbo');
const gpt4Tokens = countTokens(text, 'gpt-4');
```

### Use Case: Token Budget Management

```typescript
const maxTokens = 4000;
let prompt = generateLongPrompt();

while (countTokens(prompt) > maxTokens) {
  prompt = truncatePrompt(prompt);
}
```

**Note**: Uses `js-tiktoken` library. Supports all models with tiktoken encodings.

---

## Smart Text Preview

Generate intelligent previews of large text blocks that preserve context and readability.

### Import

```typescript
import { getSmartPreview } from 'genai-lite/prompting';
```

### Basic Usage

```typescript
const largeCodeFile = `
function calculateTotal(items) {
  let total = 0;

  for (const item of items) {
    total += item.price * item.quantity;
  }

  return total;
}

function applyDiscount(total, discountPercent) {
  return total * (1 - discountPercent / 100);
}

// ... many more lines of code ...
`;

// Get a preview showing at least 5 lines but extending to logical break points
const preview = getSmartPreview(largeCodeFile, {
  minLines: 5,
  maxLines: 10
});
```

The function returns full content if shorter than `maxLines`, shows at least `minLines`, and extends to the next blank line (up to `maxLines`) to avoid cutting mid-block. Adds `... (content truncated)` when truncating.

### Example with Token Budget

```typescript
import { getSmartPreview, countTokens } from 'genai-lite/prompting';

const sourceCode = await fs.readFile('large-file.js', 'utf-8');

// Get preview that fits within token budget
let preview = getSmartPreview(sourceCode, { minLines: 20, maxLines: 50 });
let tokenCount = countTokens(preview);

const maxTokens = 4000;
if (tokenCount > maxTokens) {
  // Reduce preview size
  preview = getSmartPreview(sourceCode, { minLines: 10, maxLines: 30 });
}
```

---

## Prompt Engineering Utilities

Advanced utilities for working with prompts and responses.

### Creating Messages from Templates (parseRoleTags)

**Recommended**: Use `LLMService.createMessages()` instead for model-aware message creation. This low-level utility is useful when you need template parsing without model context.

Convert XML role tags to message format:

```typescript
import { parseRoleTags, renderTemplate } from 'genai-lite/prompting';

// Render variables first
const rendered = renderTemplate(
  '<SYSTEM>You are a {{role}} assistant.</SYSTEM><USER>{{query}}</USER>',
  { role: 'helpful', query: 'What is TypeScript?' }
);

// Then parse role tags
const messages = parseRoleTags(rendered);
// Result: [
//   { role: 'system', content: 'You are a helpful assistant.' },
//   { role: 'user', content: 'What is TypeScript?' }
// ]
```

**Supported Tags**:
- `<SYSTEM>...</SYSTEM>` → `{ role: 'system', content: '...' }`
- `<USER>...</USER>` → `{ role: 'user', content: '...' }`
- `<ASSISTANT>...</ASSISTANT>` → `{ role: 'assistant', content: '...' }`

### Parsing Structured Content (parseStructuredContent)

Extract specific sections from LLM responses using custom tags:

```typescript
import { parseStructuredContent } from 'genai-lite/prompting';

// Example LLM response with structured output
const llmResponse = `
Let me analyze this code for you.

<ANALYSIS>
The code has good structure but could benefit from:
1. Better error handling in the API calls
2. Memoization for expensive computations
3. More descriptive variable names
</ANALYSIS>

<SUGGESTIONS>
- Add try-catch blocks around async operations
- Use React.memo() for the expensive component
- Rename 'data' to 'userData' for clarity
</SUGGESTIONS>

<REFACTORED_CODE>
const UserProfile = React.memo(({ userId }) => {
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    fetchUserData(userId)
      .then(setUserData)
      .catch(error => console.error('Failed to load user:', error));
  }, [userId]);

  return userData ? <Profile data={userData} /> : <Loading />;
});
</REFACTORED_CODE>
`;

// Parse the structured content
const parsed = parseStructuredContent(llmResponse, [
  'ANALYSIS',
  'SUGGESTIONS',
  'REFACTORED_CODE'
]);

console.log(parsed.ANALYSIS);        // The analysis text
console.log(parsed.SUGGESTIONS);     // The suggestions text
console.log(parsed.REFACTORED_CODE); // The refactored code
```

**Use Cases**:
- Extract code from responses
- Get structured analysis sections
- Parse thinking/reasoning from non-native models (see [LLM Service - Thinking Tag Fallback](llm-service.md#thinking-tag-fallback))

### Random Variables for Few-Shot Learning (extractRandomVariables)

Extract and shuffle examples for few-shot prompting:

```typescript
import { extractRandomVariables, renderTemplate } from 'genai-lite/prompting';

const examplesTemplate = `
<RANDOM_INPUT>User: Translate "hello" to Spanish</RANDOM_INPUT>
<RANDOM_OUTPUT>Assistant: "hola"</RANDOM_OUTPUT>

<RANDOM_INPUT>User: Translate "goodbye" to French</RANDOM_INPUT>
<RANDOM_OUTPUT>Assistant: "au revoir"</RANDOM_OUTPUT>

<RANDOM_INPUT>User: Translate "thank you" to German</RANDOM_INPUT>
<RANDOM_OUTPUT>Assistant: "danke"</RANDOM_OUTPUT>
`;

const variables = extractRandomVariables(examplesTemplate, { maxPerTag: 2 });

const prompt = renderTemplate(`
Examples:
{{ random_input_1 }}
{{ random_output_1 }}

{{ random_input_2 }}
{{ random_output_2 }}

Now translate: "{{word}}" to {{language}}
`, {
  ...variables,
  word: 'please',
  language: 'Italian'
});
```

**Options**: `maxPerTag?: number` (default: 30)

### Template Metadata (parseTemplateWithMetadata)

Extract `<META>` blocks from templates (used internally by `createMessages`):

```typescript
import { parseTemplateWithMetadata } from 'genai-lite/prompting';

const template = `
<META>{"settings": {"temperature": 0.9, "maxTokens": 2000}}</META>
<SYSTEM>You are a creative writer.</SYSTEM>
<USER>Write a story about {{topic}}</USER>
`;

const { metadata, content } = parseTemplateWithMetadata(template);
```

See [LLM Service - Self-Contained Templates](llm-service.md#self-contained-templates-with-metadata).

### Extract Initial Tagged Content (extractInitialTaggedContent)

Extract content from a tag at the start of a string (used internally for thinking tag extraction):

```typescript
import { extractInitialTaggedContent } from 'genai-lite/prompting';

const content = '<thinking>Step 1: ...</thinking>The answer is 42.';
const { extracted, remaining } = extractInitialTaggedContent(content, 'thinking');
// extracted: "Step 1: ...", remaining: "The answer is 42."
```

---

## Combining Utilities

Build token-aware prompts by combining utilities:

```typescript
import { LLMService, fromEnvironment } from 'genai-lite';
import { renderTemplate, countTokens, getSmartPreview } from 'genai-lite/prompting';

const llm = new LLMService(fromEnvironment);
const sourceCode = await fs.readFile('large-file.js', 'utf-8');

const template = `
You are an expert {{ language }} developer.
Review this code:
\`\`\`{{ language }}
{{ code }}
\`\`\`
Focus on: {{ focusAreas }}
`;

let codePreview = getSmartPreview(sourceCode, { minLines: 20, maxLines: 50 });
let prompt = renderTemplate(template, {
  language: 'TypeScript',
  code: codePreview,
  focusAreas: 'performance and error handling'
});

if (countTokens(prompt) > 4000) {
  codePreview = getSmartPreview(sourceCode, { minLines: 10, maxLines: 30 });
  prompt = renderTemplate(template, { language: 'TypeScript', code: codePreview, focusAreas: 'performance and error handling' });
}

const response = await llm.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  messages: [{ role: 'user', content: prompt }]
});
```

---

## Related Documentation

### Using These Utilities

- **[LLM Service](llm-service.md)** - createMessages() uses these utilities with model context
- **[LLM Service - Creating Messages from Templates](llm-service.md#creating-messages-from-templates)** - Recommended high-level API
- **[LLM Service - Thinking Tag Fallback](llm-service.md#thinking-tag-fallback)** - Uses parseStructuredContent internally

### Reference

- **[TypeScript Reference](typescript-reference.md)** - Type definitions for utility functions
- **[Core Concepts](core-concepts.md)** - Template metadata and settings hierarchy
