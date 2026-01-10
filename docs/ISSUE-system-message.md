# Issue: System Messages Sent to Models That Don't Support Them

## Summary

The `GeminiClientAdapter` sends system instructions to all Gemini models without checking whether the model supports them. This causes API errors for models like `gemma-3-27b-it` which don't have system instruction support enabled.

## Error Encountered

```
LLM Error: {"error":{"code":400,"message":"Developer instruction is not enabled for models/gemma-3-27b-it","status":"INVALID_ARGUMENT"}}
```

## Root Cause Analysis

### 1. GeminiClientAdapter Always Sends System Instructions

In `GeminiClientAdapter.js`, the `formatInternalRequestToGemini()` method (lines 100-185) collects all system messages and passes them as `systemInstruction`:

```javascript
formatInternalRequestToGemini(request) {
    const contents = [];
    let systemInstruction = request.systemMessage;

    // Process messages - separate system messages and build conversation contents
    for (const message of request.messages) {
        if (message.role === "system") {
            // Gemini handles system messages as systemInstruction
            if (systemInstruction) {
                systemInstruction += "\n\n" + message.content;
            } else {
                systemInstruction = message.content;
            }
        }
        // ... user/assistant handling
    }

    // ... later in the API call:
    const result = await genAI.models.generateContent({
        model: request.modelId,
        contents: contents,
        config: {
            ...generationConfig,
            safetySettings: safetySettings,
            ...(systemInstruction && { systemInstruction: systemInstruction }),  // Always included if present
        },
    });
}
```

**No check is performed** to verify the model supports system instructions before including them.

### 2. supportsSystemMessage Exists But Isn't Used

The config defines a `supportsSystemMessage` setting (line 61 of `config.js`):

```javascript
exports.DEFAULT_LLM_SETTINGS = {
    // ...
    supportsSystemMessage: true,  // Default assumes support
    // ...
};
```

However:
- This setting is never checked by the `GeminiClientAdapter`
- The `gemma-3-27b-it` model config doesn't override this to `false`

### 3. Model Config Missing Capability Flag

The `gemma-3-27b-it` model definition (lines 593-605 of `config.js`) doesn't indicate it lacks system message support:

```javascript
{
    id: "gemma-3-27b-it",
    name: "Gemma 3 27B",
    providerId: "gemini",
    contextWindow: 131072,
    inputPrice: 0.0,
    outputPrice: 0.0,
    description: "Google's largest open model...",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: false,
    // Missing: supportsSystemMessage: false
}
```

## Suggested Fix

### Option A: Check Capability and Fallback (Recommended)

1. Add `supportsSystemMessage: false` to models that don't support it (e.g., `gemma-3-27b-it`)

2. Have `GeminiClientAdapter` check this capability:

```javascript
formatInternalRequestToGemini(request) {
    const contents = [];
    let systemInstruction = request.systemMessage;

    // Check if model supports system instructions
    const supportsSystem = request.settings?.supportsSystemMessage !== false;

    for (const message of request.messages) {
        if (message.role === "system") {
            if (supportsSystem) {
                // Model supports system instructions - use them
                systemInstruction = systemInstruction
                    ? systemInstruction + "\n\n" + message.content
                    : message.content;
            } else {
                // Model doesn't support system instructions - prepend to first user message
                // (handled below)
            }
        }
        // ...
    }

    // If model doesn't support system but we have system content, prepend to user message
    if (!supportsSystem && systemInstruction && contents.length > 0) {
        const firstUserContent = contents[0];
        if (firstUserContent.role === "user") {
            firstUserContent.parts[0].text = systemInstruction + "\n\n" + firstUserContent.parts[0].text;
        }
        systemInstruction = undefined;  // Don't send as systemInstruction
    }

    return {
        contents,
        generationConfig,
        safetySettings,
        systemInstruction: supportsSystem ? systemInstruction : undefined,
    };
}
```

### Option B: Early Validation with Clear Error

Alternatively, fail fast with a clear error message:

```javascript
if (systemInstruction && !supportsSystem) {
    throw new Error(
        `Model ${request.modelId} does not support system instructions. ` +
        `Either use a different model or remove system messages from the request.`
    );
}
```

## Models Known to Lack System Instruction Support

Based on the error, at minimum:
- `gemma-3-27b-it` - Google's open Gemma 3 model

There may be other Gemini models that also lack this support. The Gemini API documentation should be consulted to identify the complete list.

## Impact

Any application sending system messages to unsupported models will receive a 400 error. This is particularly problematic when:
- Users switch between models without knowing capability differences
- Libraries (like Palimpsest CLI) automatically include system prompts for all requests

## Testing

To reproduce:
```typescript
const response = await llmService.sendMessage({
    providerId: 'gemini',
    modelId: 'gemma-3-27b-it',
    messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
    ]
});
// Results in: 400 "Developer instruction is not enabled for models/gemma-3-27b-it"
```

## Files to Modify

| File | Change |
|------|--------|
| `llm/config.js` | Add `supportsSystemMessage: false` to `gemma-3-27b-it` and other unsupported models |
| `llm/clients/GeminiClientAdapter.js` | Check `supportsSystemMessage` before including `systemInstruction` |
| (Optional) `llm/types.d.ts` | Ensure `supportsSystemMessage` is in ModelInfo type if not already |
