# Design Document: Unified Prompt Creation in `genai-lite`

## 1. Overview

This document proposes a significant refactoring of the prompt creation capabilities within the `genai-lite` library. The goal is to simplify the developer experience by unifying three separate but related functionalities (`renderTemplate`, `buildMessagesFromTemplate`, `prepareMessage`) into a single, intuitive, and powerful high-level method on the `LLMService`.

Currently, creating sophisticated, model-aware, multi-turn prompts is possible but requires a confusing, multi-step process. This refactoring will introduce a new primary method for all template-based prompt creation, making the library easier to learn and use while improving the internal architecture.

## 2. Background: The Current Problem

To understand the need for this change, we must first look at the three existing functions involved in creating prompts from templates.

### The Three Functions

1.  **`renderTemplate(template, variables)`**: A low-level utility. Its only job is to take a template string and an object of variables and replace all `{{...}}` placeholders. It is a pure string-in, string-out function.
2.  **`buildMessagesFromTemplate(template, variables)`**: A mid-level structural utility. It first uses `renderTemplate` to fill in variables and then parses the resulting string for special role tags (`<SYSTEM>`, `<USER>`, `<ASSISTANT>`) to create a structured array of `LLMMessage` objects. It is powerful for defining multi-turn conversations but is completely "model-agnostic" (it knows nothing about the AI model's capabilities).
3.  **`LLMService.prepareMessage(options)`**: A high-level, "model-aware" method. Its primary purpose is to resolve a `presetId` or `modelId` into a `modelContext` object (e.g., `{ thinking_enabled: true }`). It then injects this context into a template so the prompt can adapt to the model's features. However, it does **not** parse multi-turn role tags.

### The User's Point of Confusion

The functionality of these functions appears to overlap, but they solve different parts of the same problem. This forces the developer to learn the subtle differences between them and, for advanced use cases, chain them together in a non-obvious way.

**The Core Problem:** To create a prompt that is **both multi-turn and model-aware**, the developer must perform an awkward two-step process:

```typescript
// The CURRENT, confusing way to create a model-aware, multi-turn prompt

// Step 1: Call `prepareMessage` just to get the model context.
const preparationResult = await llmService.prepareMessage({
  presetId: 'some-thinking-preset',
  messages: [] // Dummy input
});
const { modelContext } = preparationResult;

// Step 2: Manually combine variables and call `buildMessagesFromTemplate`.
const allVariables = { ...myAppVariables, ...modelContext };
const finalMessages = buildMessagesFromTemplate(myMultiTurnTemplate, allVariables);

// Step 3: Finally, send the request.
await llmService.sendMessage({
  presetId: 'some-thinking-preset',
  messages: finalMessages,
});
```

This workflow is inefficient, requires significant boilerplate, and is not discoverable from the API.

## 3. Goals and Non-Goals

### Goals

1.  **Create a Single, Intuitive API**: Introduce one primary method on `LLMService` for all template-based message creation.
2.  **Eliminate User Confusion**: Make the distinction between structuring, rendering, and context-injection an internal implementation detail, not a user-facing problem.
3.  **Support All Use Cases Seamlessly**: The new method must handle simple, multi-turn, model-aware, and combined scenarios elegantly.
4.  **Improve Internal Architecture**: Refactor the underlying logic into smaller, more modular, and more testable pure functions.
5.  **Maintain Backward Compatibility**: Existing users should not have their applications break. The old methods will be deprecated with clear guidance on migrating to the new one.

### Non-Goals

1.  **Changing the Template Syntax**: The `{{...}}` and `<ROLE>...</ROLE>` syntax works well and will not be changed.
2.  **Removing `renderTemplate`**: The core `renderTemplate` utility is fundamental and will be kept as an exported, low-level tool for developers who need it.

## 4. Proposed Solution: The `createMessages` Method

We will introduce a new method on the `LLMService` class: `createMessages`. This will become the standard way to generate prompts from templates.

### 4.1. New Method Signature

```typescript
// In src/llm/LLMService.ts
class LLMService {
  // ... existing methods

  public async createMessages(options: {
    /** The template string, which can contain {{variables}} and <ROLE> tags. */
    template: string;
    /** An object of key-value pairs to substitute into the template. */
    variables?: Record<string, any>;
    /** A preset ID to make the template model-aware. */
    presetId?: string;
    /** A provider ID (if not using a preset). */
    providerId?: string;
    /** A model ID (if not using a preset). */
    modelId?: string;
  }): Promise<{ messages: LLMMessage[]; modelContext: ModelContext | null; }> {
    // Implementation to follow
  }
}
```

### 4.2. Internal Workflow (The "Render then Parse" Logic)

The `createMessages` method will orchestrate the entire process in the correct, powerful order:

1.  **Get Model Context (Optional)**: If `presetId` or `providerId`/`modelId` are provided, the method will asynchronously resolve the model information and create a `modelContext` object. If not, the context will be `null`.
2.  **Combine Variables**: It will merge the user's `variables` with the `modelContext`.
3.  **Render Full Template**: It will call the low-level `renderTemplate` utility on the *entire* template string using the combined variables. This produces a single, complete string where all placeholders have been filled, including any that might inject new `<ROLE>` tags.
4.  **Parse Rendered Structure**: It will then parse this final, rendered string for `<SYSTEM>`, `<USER>`, and `<ASSISTANT>` tags to produce the final `LLMMessage[]` array. If no role tags are found, it will default to a single-turn `user` message.
5.  **Return Result**: The method will return an object containing the final `messages` array and the `modelContext` that was used (or `null`).

### 4.3. Code Examples: Before vs. After

This new method dramatically simplifies the developer's code.

**Before: The Confusing Two-Step**

```typescript
// (This is the complex example from section 2)
async function createMyPrompt_OLD() {
  const prep = await llmService.prepareMessage({ presetId: 'preset-id', messages: [] });
  const allVars = { ...myVars, ...prep.modelContext };
  const messages = buildMessagesFromTemplate(myTemplate, allVars);
  return llmService.sendMessage({ presetId: 'preset-id', messages });
}
```

**After: The New, Unified Way**

```typescript
async function createAndSendPrompt_NEW() {
  // One clean step to create the messages
  const { messages } = await llmService.createMessages({
    template: myMultiTurnTemplate,
    variables: myAppVariables,
    presetId: 'some-thinking-preset'
  });

  // A clear second step to send them
  return llmService.sendMessage({
    presetId: 'some-thinking-preset',
    messages: messages,
  });
}
```

### 4.4. Deprecation Plan

To ensure a smooth transition, the old methods will be deprecated.

*   **`LLMService.prepareMessage`**: This method will be marked as `@deprecated` in its JSDoc comments. The deprecation message will state: *"Use the more powerful `LLMService.createMessages` method instead."* It will become an internal helper or be removed in a future major version.
*   **`buildMessagesFromTemplate`**: This utility will also be marked as `@deprecated`. The message will state: *"Use `LLMService.createMessages` for a more integrated experience. For standalone, model-agnostic parsing, consider using the new `parseRoleTags` utility."*

## 5. Implementation Plan

This refactoring can be broken down into the following discrete steps:

1.  **Create New `parseRoleTags` Utility**:
    *   Create a new file: `src/prompting/parser.ts` (or add to it).
    *   Implement a pure function `parseRoleTags(template: string): Array<{ role: string, content: string }>` that splits a template by role tags **without** rendering variables.
    *   Write comprehensive unit tests for this new utility.

2.  **Implement `LLMService.createMessages`**:
    *   Add the `createMessages` method to `src/llm/LLMService.ts` with the signature defined above.
    *   Implement the "Render then Parse" workflow internally, reusing `renderTemplate` and the logic from the old `buildMessagesFromTemplate`.

3.  **Add Tests for `createMessages`**:
    *   Create a new test file: `src/llm/LLMService.createMessages.test.ts`.
    *   Add tests covering all scenarios:
        *   Simple template, no model context.
        *   Multi-turn template, no model context.
        *   Simple template with model context.
        *   **The key test**: Multi-turn template with model context.
        *   Templates where variables inject new role tags.

4.  **Deprecate Old Methods**:
    *   Add `@deprecated` JSDoc comments to `prepareMessage` and `buildMessagesFromTemplate`.
    *   Update the main `src/index.ts` to reflect the deprecations and export the new function.

5.  **Update Documentation**:
    *   Rewrite the "Model-Aware Template Rendering" and "Prompt Builder Utilities" sections of `README.md` to feature the new `createMessages` method as the primary approach.
    *   Update all code examples throughout the documentation to use the new, simpler workflow.

## 6. Impact Summary

*   **Public API**: One new public method (`LLMService.createMessages`) will be added. Two existing methods/utilities will be deprecated.
*   **Developer Experience**: Massively improved. The API will be more discoverable, intuitive, and powerful, reducing boilerplate and potential for errors.
*   **Internal Architecture**: Cleaner and more modular, with a better separation of concerns between parsing, rendering, and orchestration.
*   **Backward Compatibility**: Maintained. Existing code will continue to work but will produce deprecation warnings in IDEs and build tools, encouraging migration.