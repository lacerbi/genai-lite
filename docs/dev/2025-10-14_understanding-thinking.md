# Understanding Thinking Extraction in genai-lite

This document explains how thinking extraction works in genai-lite, common misconceptions, and correct usage patterns.

## What is Thinking Extraction?

**Thinking extraction is NOT an automatic thinking generator.** It's a two-part feature:

1. **Parser**: Extracts content from `<thinking>` tags in model responses
2. **Enforcer**: Ensures reasoning happens (either natively OR via explicit tags)

### Key Point: YOU Must Prompt the Model

The library doesn't automatically make models think. For non-reasoning models, YOU must explicitly instruct them to use `<thinking>` tags in your prompt. The library then:
- Parses those tags from the response
- Moves the content to the standardized `reasoning` field
- Enforces that the tags were present (with `onMissing: 'auto'`)

## Model Context Variables

When using `createMessages()`, the library injects these variables based on the selected model and settings:

### `thinking_available`
- **Meaning**: Does this model SUPPORT native reasoning capabilities?
- **Examples**:
  - `true`: Claude 4, Claude 3.7, o4-mini, Gemini 2.5 Pro, DeepSeek R1, QwQ
  - `false`: GPT-4, Claude 3.5, Llama 3, Mistral

### `thinking_enabled`
- **Meaning**: Is reasoning CURRENTLY ACTIVE for this request?
- **Depends on**:
  1. Model has native reasoning (`thinking_available = true`)
  2. AND reasoning is enabled in settings (`reasoning.enabled = true`)
  3. OR reasoning is enabled by default and not explicitly disabled

### Examples:

```typescript
// Claude 4 with reasoning enabled
thinking_available: true
thinking_enabled: true
// → Model will think automatically, NO <thinking> tags needed

// Claude 4 with reasoning disabled
thinking_available: true
thinking_enabled: false
// → Model won't think unless you prompt it with <thinking> tags

// GPT-4 (no native reasoning)
thinking_available: false
thinking_enabled: false
// → Model won't think unless you prompt it with <thinking> tags
```

**Key Insight:** Notice that both scenarios above have `thinking_enabled: false`. This is intentional:
- The variable doesn't distinguish between "model can't" vs "model is disabled"
- Both mean: native reasoning is NOT currently active
- Both require: explicit `<thinking>` tag instructions in your prompt
- This is why the `!thinking_enabled` pattern works universally

## The Two Ways Reasoning Happens

### 1. Native Reasoning (Automatic)
**When**: `thinking_enabled = true`
- Model: Claude 4, o4-mini, Gemini 2.5 Pro, etc.
- Behavior: Model thinks automatically via API
- Prompting: Just give the problem, DON'T ask for step-by-step
- Result: Reasoning appears in `response.choices[0].reasoning`

### 2. Explicit Thinking Tags (Prompted)
**When**: `thinking_enabled = false` (native reasoning not active - either unsupported OR disabled)
- Model: Any model (GPT-4, Claude 3.5, Llama 3, etc.)
- Behavior: Model thinks ONLY if you prompt it to
- Prompting: "Write your reasoning in `<thinking>` tags first"
- Result: Library extracts tags → moves to `response.choices[0].reasoning`

## Common Mistakes

### ❌ MISTAKE #1: Backwards Conditionals

```typescript
// WRONG - Asks reasoning models to work step-by-step!
<USER>
  {{ thinking_enabled ? 'Please solve this step-by-step:' : 'Please answer:' }}
  {{ problem }}
</USER>
```

**Why wrong**: When `thinking_enabled = true`, the model ALREADY thinks automatically. Asking it to work "step-by-step" is redundant and confusing.

**Correct version**:
```typescript
// RIGHT - Asks NON-reasoning models to work step-by-step
<USER>
  {{ !thinking_enabled ? 'Write your reasoning in <thinking> tags, then solve:' : 'Please solve:' }}
  {{ problem }}
</USER>
```

### ❌ MISTAKE #2: Always Asking for Thinking Tags

```typescript
// WRONG - Reasoning models don't need <thinking> tags!
<SYSTEM>
  Always write your reasoning inside <thinking> tags before answering.
</SYSTEM>
```

**Why wrong**: Reasoning models (Claude 4, o4-mini) have their own internal reasoning mechanism. Asking them to use `<thinking>` tags might confuse them or produce redundant output.

**Correct version**:
```typescript
// RIGHT - Conditional thinking instruction
<SYSTEM>
  You are a helpful assistant.
  {{ !thinking_enabled ? ' When solving complex problems, write your reasoning inside <thinking> tags first.' : '' }}
</SYSTEM>
```

### ❌ MISTAKE #3: Not Understanding thinkingExtraction

```typescript
// WRONG ASSUMPTION: "thinkingExtraction makes models think"
settings: {
  thinkingExtraction: { enabled: true }
}
// This doesn't automatically generate thinking!
```

**Reality**: `thinkingExtraction.enabled: true` means:
1. Parse `<thinking>` tags from responses (if present)
2. WITH `onMissing: 'auto'` (default): Enforce that reasoning happened
   - For non-reasoning models → ERROR if no `<thinking>` tags found
   - For reasoning models → OK, they used native reasoning instead

## Correct Patterns

### Pattern 1: Complex Task (Requires Reasoning)

```typescript
const template = `
<META>
{
  "settings": {
    "thinkingExtraction": { "enabled": true }
  }
}
</META>
<SYSTEM>
  You are an expert code reviewer.
  {{ !thinking_enabled ? ' When reviewing, write your analysis in <thinking> tags first.' : '' }}
</SYSTEM>
<USER>Review this code: {{ code }}</USER>
`;
```

**What this does**:
- Reasoning model (`thinking_enabled = true`): Just review, no tag instruction
- Non-reasoning model (`thinking_enabled = false`): Instructs to use `<thinking>` tags
- `thinkingExtraction` ensures reasoning happens either way

### Pattern 2: Simple Task (No Reasoning Needed)

```typescript
const template = `
<SYSTEM>You are a friendly translator.</SYSTEM>
<USER>Translate "{{ text }}" to {{ language }}.</USER>
`;
```

**What this does**:
- No `thinkingExtraction` setting → no enforcement
- No conditional logic → works the same for all models
- Simple tasks don't need reasoning

### Pattern 3: Adaptive Complexity

```typescript
const template = `
<SYSTEM>
  You are a {{ thinking_enabled ? 'thoughtful problem solver' : 'helpful assistant' }}.
  {{ !thinking_enabled ? ' For complex problems, show your reasoning in <thinking> tags.' : '' }}
</SYSTEM>
<USER>{{ problem }}</USER>
`;
```

**What this does**:
- Adapts system prompt based on capabilities
- Only asks for `<thinking>` tags when needed
- Acknowledges reasoning models' native capabilities

## Settings Hierarchy

Understanding how settings interact:

### Scenario 1: Non-Reasoning Model + Thinking Extraction
```typescript
// GPT-4 (no native reasoning)
thinking_available: false
thinking_enabled: false
settings: { thinkingExtraction: { enabled: true } }
```
**Result**: Model MUST include `<thinking>` tags or request fails (with `onMissing: 'auto'`)

### Scenario 2: Reasoning Model + Reasoning Enabled
```typescript
// Claude 4 with reasoning
thinking_available: true
thinking_enabled: true
settings: { reasoning: { enabled: true } }
```
**Result**: Model uses native reasoning, no `<thinking>` tags needed

### Scenario 3: Reasoning Model + Reasoning Disabled + Thinking Extraction
```typescript
// Claude 4 with reasoning OFF
thinking_available: true
thinking_enabled: false
settings: {
  reasoning: { enabled: false },
  thinkingExtraction: { enabled: true }
}
```
**Result**: Model MUST use `<thinking>` tags (native reasoning disabled)

### Scenario 4: Reasoning Model + Both Enabled
```typescript
// Claude 4 with both
thinking_available: true
thinking_enabled: true
settings: {
  reasoning: { enabled: true },
  thinkingExtraction: { enabled: true }
}
```
**Result**: Uses native reasoning, `thinkingExtraction` is lenient (with `onMissing: 'auto'`)

## The `onMissing` Property

Controls behavior when `<thinking>` tags are missing:

- `'ignore'`: Continue silently
- `'warn'`: Log warning, continue
- `'error'`: Fail request
- `'auto'` (default, recommended):
  - Non-reasoning model OR reasoning disabled → `'error'` (strict)
  - Reasoning model with reasoning enabled → `'ignore'` (lenient)

**Why 'auto' is smart**:
```typescript
settings: { thinkingExtraction: { enabled: true } }  // onMissing: 'auto' by default

// GPT-4 without <thinking> tags → ERROR (you said to require thinking!)
// Claude 4 with reasoning → OK (it used native reasoning instead)
```

## Quick Reference

### When to Use Thinking Tags in Prompts

| Scenario | Use Thinking Tags? | Pattern |
|----------|-------------------|---------|
| Reasoning model + reasoning ON | ❌ No | Just give the task |
| Reasoning model + reasoning OFF | ✅ Yes | `{{ !thinking_enabled ? '<thinking> tags' : '' }}` |
| Non-reasoning model | ✅ Yes | `{{ !thinking_enabled ? '<thinking> tags' : '' }}` |
| Simple task (any model) | ❌ No | No reasoning needed |

### Template Checklist

✅ **Do**:
- Use `!thinking_enabled` when instructing to use `<thinking>` tags
- Keep prompts simple for reasoning models
- Set `thinkingExtraction: { enabled: true }` for complex tasks
- Test templates with both reasoning and non-reasoning models

❌ **Don't**:
- Use `thinking_enabled` when instructing to use `<thinking>` tags (backwards!)
- Always ask for `<thinking>` tags (redundant for reasoning models)
- Assume `thinkingExtraction` automatically generates thinking
- Tell reasoning models to "think step-by-step" (they already do)

## Examples: Good vs Bad

### ❌ Bad Example
```typescript
const template = `
<SYSTEM>Always think step-by-step and write your reasoning in <thinking> tags.</SYSTEM>
<USER>
  {{ thinking_enabled ? 'Please solve this carefully:' : 'Please solve this:' }}
  {{ problem }}
</USER>
`;
```
**Problems**:
- Asks ALL models for `<thinking>` tags (confuses reasoning models)
- Backwards conditional (makes reasoning models do extra work)

### ✅ Good Example
```typescript
const template = `
<META>
{
  "settings": {
    "thinkingExtraction": { "enabled": true }
  }
}
</META>
<SYSTEM>
  You are a problem-solving assistant.
  {{ !thinking_enabled ? ' For complex problems, write your reasoning in <thinking> tags before answering.' : '' }}
</SYSTEM>
<USER>Solve this: {{ problem }}</USER>
`;
```
**Why good**:
- Only asks non-reasoning models for `<thinking>` tags
- Simple, direct prompt for reasoning models
- Enforces that reasoning happens either way

## Summary

1. **Thinking extraction = parser + enforcer**, not automatic thinking generator
2. **`thinking_enabled = true`** means native reasoning is active → DON'T ask for step-by-step
3. **`thinking_enabled = false`** means no native reasoning active (unsupported OR disabled) → DO ask for `<thinking>` tags
4. **Use `!thinking_enabled`** when adding thinking tag instructions to templates
5. **`thinkingExtraction.enabled: true`** enforces reasoning happens (natively OR via tags)
6. **`onMissing: 'auto'`** is smart: strict for non-reasoning models, lenient for reasoning models

Remember: The goal is to ensure reasoning happens while respecting each model's capabilities!
