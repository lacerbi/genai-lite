# Migration Guide: utils → prompting Refactoring (v0.2.0)

This document outlines the breaking changes introduced in genai-lite v0.2.0, which refactors the `src/utils/` directory to `src/prompting/` and provides guidance for applications using the old interface.

## Overview of Changes

The utilities have been reorganized from a generic `utils` directory to a more descriptive `prompting` directory, with better separation of concerns and clearer naming.

### Directory Structure Changes

**Before:**
```
src/utils/
├── index.ts
├── prompt.ts
├── promptBuilder.ts
├── templateEngine.ts
└── (test files)
```

**After:**
```
src/prompting/
├── index.ts
├── template.ts      (was: templateEngine.ts)
├── content.ts       (was: prompt.ts + part of promptBuilder.ts)
├── builder.ts       (was: part of promptBuilder.ts)
├── parser.ts        (was: part of promptBuilder.ts)
└── (test files)
```

## Import Path Changes

### Main Library Imports

**Before:**
```typescript
import { 
  renderTemplate,
  countTokens,
  getSmartPreview,
  parseMessagesFromTemplate,
  extractRandomVariables,
  parseStructuredContent
} from 'genai-lite';
```

**After:**
```typescript
import { 
  renderTemplate,
  countTokens,
  getSmartPreview,
  buildMessagesFromTemplate,  // Note: renamed function
  extractRandomVariables,
  parseStructuredContent
} from 'genai-lite';
```

### Direct Module Imports (if used)

**Before:**
```typescript
import { renderTemplate } from 'genai-lite/utils/templateEngine';
import { countTokens, getSmartPreview } from 'genai-lite/utils/prompt';
import { 
  parseMessagesFromTemplate,
  extractRandomVariables,
  parseStructuredContent
} from 'genai-lite/utils/promptBuilder';
```

**After:**
```typescript
import { renderTemplate } from 'genai-lite/prompting/template';
import { countTokens, getSmartPreview, extractRandomVariables } from 'genai-lite/prompting/content';
import { buildMessagesFromTemplate } from 'genai-lite/prompting/builder';
import { parseStructuredContent } from 'genai-lite/prompting/parser';
```

## API Changes

### Renamed Function: parseMessagesFromTemplate → buildMessagesFromTemplate

The function `parseMessagesFromTemplate` has been renamed to `buildMessagesFromTemplate` to better reflect its purpose of building messages rather than just parsing them.

**Before:**
```typescript
const messages = parseMessagesFromTemplate(template, variables);
```

**After:**
```typescript
const messages = buildMessagesFromTemplate(template, variables);
```

### Function Relocations

1. **extractRandomVariables** moved from `promptBuilder.ts` to `content.ts`
   - Rationale: It's a content preparation utility, not a builder function

2. **parseStructuredContent** moved from `promptBuilder.ts` to `parser.ts`
   - Rationale: Clear separation between building prompts and parsing responses

## Migration Steps

1. **Update imports**: Change all import paths from `utils` to `prompting`
2. **Rename function calls**: Replace `parseMessagesFromTemplate` with `buildMessagesFromTemplate`
3. **Test thoroughly**: Run your test suite to ensure everything works correctly

## Quick Migration Script

For projects using search and replace:

```bash
# Update import paths
find . -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/from "genai-lite\/utils/from "genai-lite\/prompting/g'
find . -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/from '\''genai-lite\/utils/from '\''genai-lite\/prompting/g'

# Update function name
find . -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/parseMessagesFromTemplate/buildMessagesFromTemplate/g'
```

## Benefits of the Refactoring

1. **Clearer Organization**: The `prompting` name immediately tells you what these utilities are for
2. **Better Separation**: Each file now has a single, clear responsibility
3. **Logical Workflow**: Files are organized by their role in the prompt engineering lifecycle:
   - `template.ts` - Render dynamic text
   - `content.ts` - Prepare content for prompts
   - `builder.ts` - Build structured messages
   - `parser.ts` - Parse structured responses
4. **Improved Naming**: `buildMessagesFromTemplate` better describes the function's purpose

## No Backward Compatibility

To keep the library clean and avoid bloat, there is **no backward compatibility layer**. Applications must update their imports and function calls as described above.

## Example Migration

**Before:**
```typescript
import { 
  renderTemplate,
  parseMessagesFromTemplate,
  parseStructuredContent 
} from 'genai-lite';

const template = `
<SYSTEM>You are a helpful assistant.</SYSTEM>
<USER>{{question}}</USER>
`;

const messages = parseMessagesFromTemplate(template, { question: 'What is TypeScript?' });
const response = await llm.send(messages);
const parsed = parseStructuredContent(response, ['ANSWER', 'CONFIDENCE']);
```

**After:**
```typescript
import { 
  renderTemplate,
  buildMessagesFromTemplate,  // Changed name
  parseStructuredContent 
} from 'genai-lite';

const template = `
<SYSTEM>You are a helpful assistant.</SYSTEM>
<USER>{{question}}</USER>
`;

const messages = buildMessagesFromTemplate(template, { question: 'What is TypeScript?' });  // Changed name
const response = await llm.send(messages);
const parsed = parseStructuredContent(response, ['ANSWER', 'CONFIDENCE']);
```

## Questions or Issues?

If you encounter any issues during migration, please check:
1. All imports have been updated to use `prompting` instead of `utils`
2. All calls to `parseMessagesFromTemplate` have been changed to `buildMessagesFromTemplate`
3. Your TypeScript compiler or bundler has cleared its cache

The refactoring maintains all existing functionality while providing better organization and naming.