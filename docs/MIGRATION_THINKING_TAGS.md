# Thinking Extraction Interface Refactor Plan

**Date:** 2025-10-14
**Status:** Planning Complete, Ready for Implementation
**Type:** Breaking Changes (Major Version Bump Required)

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Core Insights](#core-insights)
3. [Design Decisions](#design-decisions)
4. [New Interface Design](#new-interface-design)
5. [Implementation Plan](#implementation-plan)
6. [Migration Guide](#migration-guide)
7. [Files to Update](#files-to-update)
8. [Testing Strategy](#testing-strategy)

---

## Problem Statement

### Current Interface Issues

The current `thinkingExtraction` interface has several clarity issues:

1. **Misleading Name**: "thinkingExtraction" sounds passive (just parsing) when it's actually parsing + enforcement
2. **Unclear Intent**: The name doesn't convey that it's a fallback mechanism for when native reasoning isn't active
3. **Overloaded `onMissing` Property**: Values like 'auto', 'ignore', 'warn', 'error' don't clearly map to use cases
4. **Users Misunderstand the Feature**: They assume it generates thinking automatically, when actually THEY must prompt the model to use tags

### What Users Need to Understand

There are **THREE scenarios** for reasoning:

1. **Native reasoning ON** → Model thinks automatically via API (reasoning may be obfuscated by provider)
2. **Native reasoning OFF (but model capable)** → Disable native, prompt for tags to SEE the reasoning
3. **No native reasoning capability** → Must prompt for tags to get any reasoning

**Scenarios 2 and 3 are functionally identical** - both need explicit tag prompting. This is the "fallback" mechanism.

### Key Use Case That Needs Prominence

**"Disable Native Reasoning to See the Trace"**: Many providers (Anthropic, Google) obfuscate or hide the reasoning trace from native reasoning models. To get full visibility:
1. Disable native reasoning: `reasoning: { enabled: false }`
2. Enable tag extraction: `thinkingTagFallback: { enabled: true, enforce: true }`
3. Prompt the model: "Write your reasoning in <thinking> tags before answering"

This gives you complete transparency into the model's thought process.

---

## Core Insights

### The Intent vs. The Mechanism

The **intent** is about **requiring reasoning**. Tag extraction is just the *mechanism* for getting it when native reasoning isn't active.

The interface should express:
- "I want reasoning from this model"
- "If native reasoning isn't active, fall back to tag extraction"
- "Enforce that this fallback works"

### Two Independent Controls (Correct Design)

The current structure of having two separate settings is actually correct:
- `reasoning` controls the native API feature
- `thinkingExtraction` (→ `thinkingTagFallback`) controls the tag-based fallback

They should remain independent because:
- You might want native reasoning without tag fallback
- You might want tag fallback with native reasoning disabled (to see the trace)
- They control different mechanisms

### Smart Enforcement By Design

Rather than having explicit 'auto' mode, enforcement should be **smart by default**:
- When `enforce: true` and native reasoning is active → No error (model is using native)
- When `enforce: true` and native reasoning is NOT active → Error if tags missing (fallback failed)

This removes the need for 'auto' - enforcement is always contextually aware.

---

## Design Decisions

### Decision 1: Rename to `thinkingTagFallback`

**Rationale:**
- Clearly signals this is a fallback mechanism
- Short enough to be ergonomic (not `thinkingTagsWhenNativeReasoningOff`)
- "Fallback" emphasizes it only activates when needed

### Decision 2: Add `enabled` Flag

**Rationale:**
- Explicit control for disabling in settings merging scenarios
- Consistent with `reasoning: { enabled }` pattern
- Solves the problem: "How do I turn off an inherited setting?"

**Semantics:**
- `thinkingTagFallback` undefined → feature off (implicit)
- `thinkingTagFallback: { enabled: false }` → feature off (explicit)
- `thinkingTagFallback: {}` → feature on (implicit, default when object exists)

### Decision 3: Simplify to `enforce` Boolean

**Rationale:**
- Remove 'auto', 'ignore', 'warn', 'error' complexity
- Enforcement is smart by default (always checks if native reasoning is active)
- Users either require tags (as fallback) or they don't
- If they want warnings instead of errors, they can handle that in their app

**Semantics:**
- `enforce: true` → Error if tags missing AND native reasoning not active
- `enforce: false` → Extract if present, never error
- No 'warn' option → Users handle error conversion in their app if desired

### Decision 4: Rename `tag` to `tagName`

**Rationale:**
- More explicit property name
- Better IntelliSense discoverability
- Consistent with common naming patterns

### Decision 5: Extract Only When Configured

**Rationale:**
- Explicit opt-in for predictable behavior
- No surprises if content contains `<thinking>` for other reasons
- Users consciously enable the fallback mechanism

**Behavior:**
- `thinkingTagFallback` undefined → tags stay in content, not extracted
- `thinkingTagFallback` present with `enabled !== false` → tags extracted

### Decision 6: Rename ModelContext Variables

**Rationale:**
- More semantic, self-documenting names
- No aliases (clutters the interface)
- Breaking changes are acceptable

**Changes:**
- `thinking_enabled` → `native_reasoning_active`
- `thinking_available` → `native_reasoning_capable`
- NEW: `requires_tags_for_thinking` (derived from settings + model state)

---

## New Interface Design

### Settings Type Definition

```typescript
export interface LLMThinkingTagFallbackSettings {
  /**
   * Enable tag extraction fallback.
   * Default: true when thinkingTagFallback object exists
   * Set to false to explicitly disable (useful for overriding inherited settings)
   */
  enabled?: boolean;

  /**
   * Name of the XML tag to extract.
   * Default: 'thinking'
   *
   * Example: tagName: 'scratchpad' will extract <scratchpad>...</scratchpad>
   */
  tagName?: string;

  /**
   * Enforce that thinking tags are present when native reasoning is not active.
   * Default: false
   *
   * When true:
   * - If native reasoning is active: No enforcement (model using native)
   * - If native reasoning is NOT active: Error if tags missing (fallback required)
   *
   * This is always "smart" - it automatically detects whether native reasoning
   * is active and only enforces when the model needs to use tags as a fallback.
   */
  enforce?: boolean;
}

export interface LLMSettings {
  // ... other settings
  reasoning?: LLMReasoningSettings;

  /**
   * Extract reasoning from XML tags when native reasoning is not active.
   *
   * This is a fallback mechanism for getting reasoning from:
   * 1. Models without native reasoning support (e.g., GPT-4, Claude 3.5)
   * 2. Models with native reasoning disabled (to see the full reasoning trace)
   *
   * Key use case: Disable native reasoning on capable models to avoid obfuscation
   * by providers, then prompt the model to use <thinking> tags for full visibility.
   *
   * Note: You must explicitly prompt the model to use thinking tags in your prompt.
   * The library only extracts them - it doesn't generate them automatically.
   */
  thinkingTagFallback?: LLMThinkingTagFallbackSettings;
}
```

### ModelContext Type Definition

```typescript
export interface ModelContext {
  /**
   * Whether native reasoning is CURRENTLY ACTIVE for this request.
   * - true: Model is using built-in reasoning (Claude 4, o4-mini, Gemini with reasoning enabled)
   * - false: No native reasoning is active (model doesn't support it OR it's been disabled)
   *
   * Use in templates when adapting behavior based on whether native reasoning is happening.
   */
  native_reasoning_active: boolean;

  /**
   * Whether the model HAS THE CAPABILITY to use native reasoning.
   * - true: Model supports native reasoning (may or may not be enabled)
   * - false: Model does not support native reasoning
   *
   * Use in templates to check if native reasoning is possible (not necessarily active).
   */
  native_reasoning_capable: boolean;

  /**
   * Whether this model/request requires thinking tags to produce reasoning.
   * - true: Native reasoning is not active, model needs prompting to use <thinking> tags
   * - false: Native reasoning is active, no need for thinking tags
   *
   * Use in templates for conditional thinking tag instructions:
   * {{ requires_tags_for_thinking ? 'Write your reasoning in <thinking> tags first.' : '' }}
   */
  requires_tags_for_thinking: boolean;

  /** The resolved model ID */
  model_id: string;

  /** The resolved provider ID */
  provider_id: string;

  /** Reasoning effort level if specified ('low', 'medium', or 'high') */
  reasoning_effort?: string;

  /** Reasoning max tokens if specified */
  reasoning_max_tokens?: number;
}
```

### Usage Examples

#### Example 1: Non-reasoning model with tag fallback

```typescript
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1',
  messages: [
    {
      role: 'system',
      content: 'When solving problems, write your reasoning in <thinking> tags before answering.'
    },
    {
      role: 'user',
      content: 'What is 15% of 240?'
    }
  ],
  settings: {
    thinkingTagFallback: {
      enabled: true,
      enforce: true  // Error if no <thinking> tags
    }
  }
});

// If model responds with:
// "<thinking>15% = 0.15, so 0.15 × 240 = 36</thinking>The answer is 36."
//
// Result:
// response.choices[0].reasoning = "15% = 0.15, so 0.15 × 240 = 36"
// response.choices[0].message.content = "The answer is 36."
```

#### Example 2: Reasoning model with native disabled (to see trace)

```typescript
const response = await llmService.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-sonnet-4-20250514',
  messages: [
    {
      role: 'system',
      content: 'Write your step-by-step reasoning in <thinking> tags before answering.'
    },
    {
      role: 'user',
      content: 'Analyze this complex problem...'
    }
  ],
  settings: {
    reasoning: {
      enabled: false  // Disable native to avoid obfuscation
    },
    thinkingTagFallback: {
      enabled: true,
      enforce: true  // Require tags as fallback
    }
  }
});

// Now you get full visibility into Claude's reasoning via tags
```

#### Example 3: Model-aware template with new variables

```typescript
const { messages, modelContext } = await llmService.createMessages({
  template: `
    <SYSTEM>
      You are a problem-solving assistant.
      {{ requires_tags_for_thinking ? ' For complex problems, write your reasoning in <thinking> tags before answering.' : '' }}
    </SYSTEM>
    <USER>{{ question }}</USER>
  `,
  variables: { question: 'Explain quantum entanglement.' },
  presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
});

console.log(modelContext);
// {
//   native_reasoning_active: true,
//   native_reasoning_capable: true,
//   requires_tags_for_thinking: false,
//   model_id: 'claude-3-7-sonnet-20250219',
//   provider_id: 'anthropic'
// }
```

#### Example 4: Disabling inherited fallback setting

```typescript
// Preset has thinking tag fallback enabled
const preset = {
  thinkingTagFallback: {
    tagName: 'thinking',
    enforce: true
  }
};

// Override in specific request - explicitly disable
const response = await llmService.sendMessage({
  presetId: 'my-preset',
  messages: [...],
  settings: {
    thinkingTagFallback: {
      enabled: false  // Clear way to turn off inherited setting
    }
  }
});
```

---

## Implementation Plan

### Phase 1: Core Type Changes

**File:** `src/llm/types.ts`

1. Create new `LLMThinkingTagFallbackSettings` interface
2. Mark old `LLMThinkingExtractionSettings` as deprecated (keep for now)
3. Update `LLMSettings` to include new `thinkingTagFallback` property
4. Update `ModelContext` interface with new property names
5. Add comprehensive JSDoc comments to all new types

**Backward Compatibility Note:** Keep old interface definition but mark as deprecated. Will be removed in implementation phase.

### Phase 2: LLMService Implementation

**File:** `src/llm/LLMService.ts`

**Section 1: Update sendMessage() thinking extraction logic**

Current location: Lines ~246-295

Changes:
1. Check for `thinkingTagFallback` instead of `thinkingExtraction`
2. Only extract if `enabled !== false` (default true when object exists)
3. Use `tagName` instead of `tag` property
4. Simplify enforcement logic:
   - Remove 'auto' detection code
   - Remove 'warn' handling
   - `enforce: true` → check if native reasoning active, error if not and tags missing
   - `enforce: false` → extract if present, never error
5. Update comments to explain the fallback mechanism

**Section 2: Update createMessages() model context injection**

Current location: Lines ~435-460

Changes:
1. Calculate `native_reasoning_active` (was `thinking_enabled`)
2. Calculate `native_reasoning_capable` (was `thinking_available`)
3. Calculate NEW `requires_tags_for_thinking` = !native_reasoning_active
4. Update property names in returned modelContext
5. Update JSDoc comments with new variable names and usage examples

**Section 3: Error message enhancement**

Update validation error when tags are missing:

```typescript
{
  type: 'validation_error',
  code: 'THINKING_TAGS_MISSING',
  message: `Model response missing required <${tagName}> tags.`,
  details: {
    reason: modelInfo.reasoning?.supported && !isNativeReasoningActive
      ? `You disabled native reasoning for this model (${modelInfo.id}). ` +
        `To see its reasoning, you must prompt it to use <${tagName}> tags. ` +
        `Example: "Write your step-by-step reasoning in <${tagName}> tags before answering."`
      : `This model (${modelInfo.id}) does not support native reasoning. ` +
        `To get reasoning, you must prompt it to use <${tagName}> tags. ` +
        `Example: "Write your step-by-step reasoning in <${tagName}> tags before answering."`,
    suggestion: `Either prompt the model to use tags, or set thinkingTagFallback.enforce to false.`,
    modelCapabilities: {
      native_reasoning_capable: modelInfo.reasoning?.supported === true,
      native_reasoning_active: isNativeReasoningActive
    }
  }
}
```

### Phase 3: Export Updates

**File:** `src/index.ts`

Changes:
1. Export new `LLMThinkingTagFallbackSettings` type
2. Remove export of old `LLMThinkingExtractionSettings` type
3. Update `ModelContext` export (breaking change in property names)

### Phase 4: Documentation Updates

**File:** `README.md`

Sections to update:
1. **"Thinking Extraction and Enforcement" section** (~line 297)
   - Rewrite with new terminology
   - Emphasize fallback mechanism
   - Promote "disable native to see trace" use case
   - Update all code examples with new property names
2. **"Self-Contained Templates with Metadata" section** (~line 643)
   - Update example using new property names
3. **"Available model context variables" section** (~line 562)
   - Update variable names and descriptions
   - Add `requires_tags_for_thinking` with usage examples
4. **All template examples throughout**
   - Replace `thinking_enabled` with `native_reasoning_active`
   - Replace `thinking_available` with `native_reasoning_capable`
   - Use `requires_tags_for_thinking` in conditional instructions

**File:** `CLAUDE.md`

Sections to update:
1. **"Using createMessages for Model-Aware Prompts" example** (~line 103)
   - Update template with new variable names
   - Update settings with new property names
2. **Developer guidance sections**
   - Update any references to thinking extraction

**File:** `docs/dev/2025-10-14_understanding-thinking.md`

Major rewrite needed:
1. Update title to reference "Thinking Tag Fallback"
2. Section "What is Thinking Extraction?" → "What is Thinking Tag Fallback?"
3. Update all references to `thinkingExtraction` → `thinkingTagFallback`
4. Update property names throughout: `enabled`, `tagName`, `enforce`
5. Remove references to 'auto' mode (it's now smart by default)
6. Update ModelContext variable names in examples
7. Update all template examples with new variables
8. Add prominent section on "Disable Native to See Reasoning" use case
9. Update enforcement behavior explanation

**File:** `examples/chat-demo/README.md`

Sections to update:
1. Feature descriptions mentioning thinking extraction
2. Any API endpoint descriptions that reference the settings

### Phase 5: Example Application Updates

**File:** `examples/chat-demo/src/data/exampleTemplates.ts`

Update all template examples:
1. Replace `thinking_enabled` with `requires_tags_for_thinking`
2. Update template metadata blocks with new property names
3. Ensure conditional patterns use `requires_tags_for_thinking`

Example transformation:
```typescript
// OLD
`{{ !thinking_enabled ? ' Write your reasoning in <thinking> tags first.' : '' }}`

// NEW
`{{ requires_tags_for_thinking ? ' Write your reasoning in <thinking> tags first.' : '' }}`
```

**File:** `examples/chat-demo/src/types/index.ts`

Update type definitions to match new interface.

**File:** `examples/chat-demo/server/routes/templates.ts` (if needed)

Update any server-side logic that references the old interface.

### Phase 6: Test Updates

**File:** `src/llm/LLMService.test.ts`

Update test cases:
1. Tests checking for `thinkingExtraction` → use `thinkingTagFallback`
2. Tests checking `onMissing` behavior → use `enforce` boolean
3. Tests checking error messages → verify new format
4. Add new tests for `enabled: false` behavior
5. Update property names in assertions

**File:** `src/llm/LLMService.createMessages.test.ts`

Update test cases:
1. Tests checking `thinking_enabled` → use `native_reasoning_active`
2. Tests checking `thinking_available` → use `native_reasoning_capable`
3. Add tests for new `requires_tags_for_thinking` variable
4. Update template examples in tests

**File:** `e2e-tests/reasoning.test.ts` (if exists)

Update any E2E tests that use thinking extraction.

### Phase 7: Migration Guide

**New File:** `docs/MIGRATION_THINKING_TAGS.md`

Create comprehensive migration guide with:
1. Summary of breaking changes
2. Before/after comparison table
3. Step-by-step migration instructions
4. Common patterns and how to update them
5. Template migration examples
6. FAQ section

---

## Migration Guide

### Summary of Breaking Changes

| Category | Old | New |
|----------|-----|-----|
| **Settings Property** | `thinkingExtraction` | `thinkingTagFallback` |
| **Enabled Flag** | N/A (implicit) | `enabled` (explicit control) |
| **Tag Name** | `tag` | `tagName` |
| **Enforcement** | `onMissing: 'auto' \| 'ignore' \| 'warn' \| 'error'` | `enforce: boolean` |
| **ModelContext - Active** | `thinking_enabled` | `native_reasoning_active` |
| **ModelContext - Capable** | `thinking_available` | `native_reasoning_capable` |
| **ModelContext - New** | N/A | `requires_tags_for_thinking` |

### Migration Steps

#### Step 1: Update Settings

**Before:**
```typescript
settings: {
  thinkingExtraction: {
    enabled: true,
    tag: 'thinking',
    onMissing: 'auto'
  }
}
```

**After:**
```typescript
settings: {
  thinkingTagFallback: {
    enabled: true,      // Can omit (default when object exists)
    tagName: 'thinking', // Can omit (default)
    enforce: true       // true = smart enforcement
  }
}
```

#### Step 2: Update Templates - Variable Names

**Before:**
```typescript
const template = `
  <SYSTEM>
    {{ thinking_enabled ? 'Solve this carefully:' : 'Think step-by-step in <thinking> tags:' }}
  </SYSTEM>
`;
```

**After:**
```typescript
const template = `
  <SYSTEM>
    {{ requires_tags_for_thinking ? 'Think step-by-step in <thinking> tags:' : 'Solve this carefully:' }}
  </SYSTEM>
`;
```

**Note:** The conditional pattern actually makes more sense now:
- OLD: `!thinking_enabled` (double negative - "if NOT enabled")
- NEW: `requires_tags_for_thinking` (positive - "if requires tags")

#### Step 3: Update Template Pattern (Important!)

The recommended pattern changes:

**OLD Pattern:**
```typescript
{{ !thinking_enabled ? 'Use <thinking> tags' : '' }}
```

**NEW Pattern:**
```typescript
{{ requires_tags_for_thinking ? 'Use <thinking> tags' : '' }}
```

This is more semantic and easier to understand.

#### Step 4: Update onMissing Mapping

| Old `onMissing` | New `enforce` | Notes |
|-----------------|---------------|-------|
| `'auto'` | `true` | Now smart by default |
| `'error'` | `true` | Same behavior (always enforce) |
| `'ignore'` | `false` | Never enforce |
| `'warn'` | `false` + app-level handling | Handle error → warning in your app |

#### Step 5: Handle 'warn' Migration

If you used `onMissing: 'warn'`:

**Before:**
```typescript
settings: {
  thinkingExtraction: {
    enabled: true,
    onMissing: 'warn'
  }
}
```

**After:**
```typescript
settings: {
  thinkingTagFallback: {
    enabled: true,
    enforce: true
  }
}

// In your app:
const response = await llmService.sendMessage({...});
if (response.object === 'error' && response.error.code === 'THINKING_TAGS_MISSING') {
  console.warn('Warning: Thinking tags were expected but not found');
  // Use partial response if needed
  return response.partialResponse;
}
```

### Common Patterns

#### Pattern 1: Simple thinking extraction (no enforcement)

**Before:**
```typescript
{
  thinkingExtraction: {
    enabled: true,
    onMissing: 'ignore'
  }
}
```

**After:**
```typescript
{
  thinkingTagFallback: {
    enforce: false  // enabled: true is implicit
  }
}
```

#### Pattern 2: Strict enforcement

**Before:**
```typescript
{
  thinkingExtraction: {
    enabled: true,
    onMissing: 'error'
  }
}
```

**After:**
```typescript
{
  thinkingTagFallback: {
    enforce: true
  }
}
```

#### Pattern 3: Smart enforcement (recommended)

**Before:**
```typescript
{
  thinkingExtraction: {
    enabled: true,
    onMissing: 'auto'  // Smart: strict for non-reasoners, lenient for reasoners
  }
}
```

**After:**
```typescript
{
  thinkingTagFallback: {
    enforce: true  // Now smart by default!
  }
}
```

#### Pattern 4: Custom tag name

**Before:**
```typescript
{
  thinkingExtraction: {
    enabled: true,
    tag: 'scratchpad'
  }
}
```

**After:**
```typescript
{
  thinkingTagFallback: {
    tagName: 'scratchpad'
  }
}
```

#### Pattern 5: Disabling inherited settings

**Before:**
```typescript
// No clean way - had to set onMissing: 'ignore' or omit the whole object
```

**After:**
```typescript
{
  thinkingTagFallback: {
    enabled: false  // Explicit disable
  }
}
```

### FAQ

**Q: Why the rename from `thinkingExtraction` to `thinkingTagFallback`?**

A: The new name better communicates that this is a fallback mechanism used when native reasoning isn't active. "Extraction" sounded like it was just parsing, but it's actually parsing + enforcement to ensure reasoning happens.

**Q: What happened to 'auto' mode?**

A: It's now the default behavior! When you set `enforce: true`, it's automatically smart - it only enforces when native reasoning isn't active. This removes complexity while maintaining the intelligent behavior.

**Q: What happened to 'warn' mode?**

A: The library now only returns errors (when `enforce: true` and tags are missing). You can handle the error in your application and convert it to a warning if needed. This gives you more control and makes the library's behavior more predictable.

**Q: Why use `requires_tags_for_thinking` instead of `!native_reasoning_active`?**

A: It's more semantic and clearer in templates. Instead of a double negative ("if NOT native active"), you have a positive statement ("if requires tags"). Both convey the same information, but `requires_tags_for_thinking` expresses the *intent* rather than the *condition*.

**Q: Can I still use the old variable names in templates?**

A: No, this is a breaking change. You'll need to update your templates to use the new variable names. However, the migration is straightforward and the new names are more intuitive.

**Q: What if my templates break after this update?**

A: The errors will be clear - you'll get "undefined variable" errors in template rendering. Use find-and-replace to update:
- `thinking_enabled` → `native_reasoning_active`
- `thinking_available` → `native_reasoning_capable`
- `!thinking_enabled ? 'use tags'` → `requires_tags_for_thinking ? 'use tags'`

**Q: How do I disable native reasoning to see the full trace?**

A: This is now a first-class use case! Do this:

```typescript
{
  reasoning: { enabled: false },  // Disable native (avoid obfuscation)
  thinkingTagFallback: {
    enforce: true  // Require tags as fallback
  }
}
```

Then prompt your model to use `<thinking>` tags, and you'll get full visibility into its reasoning.

---

## Files to Update

### Core Library (Critical Path)

1. **src/llm/types.ts** - Type definitions (breaking changes)
2. **src/llm/LLMService.ts** - Core implementation logic
3. **src/index.ts** - Public API exports

### Documentation (User-Facing)

4. **README.md** - Main library documentation
5. **CLAUDE.md** - Developer guidance
6. **docs/dev/2025-10-14_understanding-thinking.md** - Deep dive guide
7. **docs/MIGRATION_THINKING_TAGS.md** - NEW migration guide

### Example Application

8. **examples/chat-demo/src/data/exampleTemplates.ts** - Template examples
9. **examples/chat-demo/src/types/index.ts** - Type definitions
10. **examples/chat-demo/README.md** - Demo documentation
11. **examples/chat-demo/server/routes/templates.ts** - Server logic (if needed)

### Tests

12. **src/llm/LLMService.test.ts** - Unit tests
13. **src/llm/LLMService.createMessages.test.ts** - createMessages tests
14. **e2e-tests/reasoning.test.ts** - E2E tests (if exists)

### Summary Files (Should be updated after implementation)

15. **src/.summary_long.md** - Update examples
16. **src/llm/.summary_long.md** - Update examples

### Total Files: ~16 files

---

## Testing Strategy

### Unit Test Coverage

1. **Settings parsing**
   - `thinkingTagFallback` undefined → no extraction
   - `thinkingTagFallback: {}` → extraction enabled (default)
   - `thinkingTagFallback: { enabled: false }` → extraction disabled
   - `thinkingTagFallback: { enabled: true }` → extraction enabled

2. **Tag extraction**
   - Tags present → extracted to reasoning field
   - Tags absent, enforce: false → no error
   - Tags absent, enforce: true, native active → no error
   - Tags absent, enforce: true, native NOT active → error

3. **ModelContext injection**
   - `native_reasoning_active` calculated correctly
   - `native_reasoning_capable` calculated correctly
   - `requires_tags_for_thinking` = !native_reasoning_active

4. **Settings merging**
   - Preset settings + runtime settings
   - Explicit `enabled: false` overrides inherited settings
   - Template metadata settings

5. **Error messages**
   - Error code: THINKING_TAGS_MISSING
   - Error details include model capabilities
   - Error details distinguish between "can't" vs "disabled"
   - partialResponse preserved

### E2E Test Coverage

1. **Non-reasoning model with tags**
   - GPT-4 with enforce: true → tags required
   - GPT-4 with enforce: false → tags optional

2. **Reasoning model with native enabled**
   - Claude 4, reasoning ON, enforce: true → no error (using native)

3. **Reasoning model with native disabled**
   - Claude 4, reasoning OFF, enforce: true → tags required

4. **Template rendering**
   - `requires_tags_for_thinking` correct for various scenarios
   - All ModelContext variables populated correctly

### Manual Testing Checklist

- [ ] Non-reasoning model without tags → error with helpful message
- [ ] Non-reasoning model with tags → tags extracted correctly
- [ ] Reasoning model, native ON, with tags → tags ignored, native used
- [ ] Reasoning model, native OFF, without tags → error
- [ ] Reasoning model, native OFF, with tags → tags extracted
- [ ] Template variables render correctly
- [ ] Settings inheritance works (preset → template → runtime)
- [ ] Explicit `enabled: false` disables feature
- [ ] Error message is helpful and actionable
- [ ] chat-demo application works with new settings

---

## Implementation Notes

### Order of Implementation

1. **Types first** - Update `src/llm/types.ts` with new interfaces (keep old as deprecated)
2. **Core logic** - Update `src/llm/LLMService.ts` implementation
3. **Exports** - Update `src/index.ts` to export new types
4. **Tests** - Update all test files to use new interface
5. **Run tests** - Ensure all tests pass
6. **Documentation** - Update README, CLAUDE.md, thinking guide
7. **Examples** - Update chat-demo application
8. **Migration guide** - Write comprehensive migration guide
9. **Remove old types** - Delete deprecated interfaces from types.ts
10. **Final test pass** - Run all tests including E2E

### Backward Compatibility Considerations

**None** - This is a breaking change requiring a major version bump.

However, we can make migration easier by:
1. Providing clear error messages if old property names are used
2. Writing a comprehensive migration guide
3. Providing before/after examples for all common patterns
4. Updating all examples in documentation

### Validation During Migration

Add runtime warnings (temporary, remove after major version):

```typescript
if ('thinkingExtraction' in settings) {
  console.error(
    'BREAKING CHANGE: thinkingExtraction has been renamed to thinkingTagFallback. ' +
    'See docs/MIGRATION_THINKING_TAGS.md for migration guide.'
  );
  throw new Error('thinkingExtraction setting is no longer supported');
}
```

This helps users discover the breaking change immediately.

---

## Success Criteria

### Must Have

- [ ] All type definitions updated
- [ ] Core implementation working correctly
- [ ] All existing tests updated and passing
- [ ] README.md fully updated with new examples
- [ ] Migration guide complete
- [ ] chat-demo application working with new interface

### Should Have

- [ ] Comprehensive test coverage for new behavior
- [ ] Error messages are helpful and actionable
- [ ] Documentation emphasizes "disable native to see reasoning" use case
- [ ] All template examples use new variables

### Nice to Have

- [ ] E2E tests covering all scenarios
- [ ] Performance benchmarks (no regression)
- [ ] Video/blog post explaining the changes
- [ ] Community feedback on new interface

---

## Timeline Estimate

- **Types + Core Logic**: 2-3 hours
- **Tests**: 2-3 hours
- **Documentation**: 3-4 hours
- **Examples**: 1-2 hours
- **Migration Guide**: 1-2 hours
- **Testing & Refinement**: 2-3 hours

**Total: 11-17 hours** (1.5-2 days of focused work)

---

## Version Bump

This requires a **major version bump** due to breaking changes:
- Current version: Check `package.json`
- New version: Next major (e.g., 0.x.x → 1.0.0 or 1.x.x → 2.0.0)

---

## Questions Before Implementation

1. Should we add runtime deprecation warnings for old property names? (Helpful but adds code)
2. Should we support both old and new variable names in templates temporarily? (Complex, probably not worth it)
3. Do we want to add any new helper methods to LLMService? (e.g., `service.requiresThinkingTags(presetId)`)
4. Should the migration guide include a script to automatically update templates?

---

## Conclusion

This refactor addresses fundamental clarity issues in the thinking extraction interface by:

1. Making the fallback nature explicit in the naming
2. Simplifying enforcement to a smart boolean
3. Using semantic variable names in ModelContext
4. Removing complexity (auto/warn modes)
5. Enabling explicit control (enabled flag)

The new interface is more intuitive, self-documenting, and makes the "disable native to see reasoning" use case prominent.

**Ready to implement!**
