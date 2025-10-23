# Troubleshooting

Common issues and solutions for genai-lite.

## Contents

- [API Key Problems](#api-key-problems)
- [Provider-Specific Issues](#provider-specific-issues)
- [Error Types Reference](#error-types-reference)
- [Thinking Tag Issues](#thinking-tag-issues)
- [Network Issues](#network-issues)
- [Related Documentation](#related-documentation)

## API Key Problems

### Environment Variables Not Set

```bash
# Verify environment variable is set
echo $OPENAI_API_KEY

# If using .env files (requires dotenv package)
npm install dotenv
# Add to your code: require('dotenv').config()
```

### Wrong Environment Variable Names

Environment variable names are case-sensitive and provider-specific:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
MISTRAL_API_KEY=...
```

### API Key Format Issues

- **OpenAI**: Starts with `sk-`
- **Anthropic**: Starts with `sk-ant-`
- **Gemini**: Starts with `AIza`
- No quotes needed in environment variables

### Custom ApiKeyProvider Returns Null

```typescript
const myProvider: ApiKeyProvider = async (providerId) => {
  const key = await getKey(providerId);
  console.log(`Key for ${providerId}:`, key ? 'Found' : 'Not found');
  return key;  // Must return string or null (not undefined)
};
```

## Provider-Specific Issues

### Anthropic

**Problem**: Missing `maxTokens` error

**Cause**: Anthropic requires explicit `maxTokens` parameter (unlike OpenAI which has defaults)

**Solution**:
```typescript
const response = await llmService.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Hello' }],
  settings: {
    maxTokens: 1024  // Required
  }
});
```

### Mistral

**Problem**: Getting mock/simulated responses instead of real API calls

**Cause**: Mistral adapter is under development, using mock adapter for compatibility testing

**Current behavior**:
- Requests to Mistral models (`codestral-2501`, `devstral-small-2505`) return simulated responses
- No real API calls are made to Mistral's API
- Useful for testing application flow, but not for production use

**Status**: Official Mistral adapter implementation is planned for a future release

See `src/llm/config.ts:35` (commented out MistralClientAdapter).

### llama.cpp

**Problem**: Server not responding

**Quick checks**:
```bash
# Is server running?
curl http://localhost:8080/health

# Should return: {"status":"ok"}

# Check what model is loaded
curl http://localhost:8080/v1/models
```

**Common causes**:
- Server process not running
- Wrong base URL (set via `LLAMACPP_API_BASE_URL`)
- Model still loading (check server logs)

**Problem**: Reasoning not extracted

**Cause**: Server not configured for reasoning extraction

**Solution**: Start server with reasoning flags:
```bash
llama-server -m model.gguf --jinja --reasoning-format deepseek --port 8080
```

See [llama.cpp Integration](llamacpp-integration.md#troubleshooting) for detailed setup.

For reasoning extraction details, see `docs/dev/2025-10-17_llamacpp-reasoning-extraction.md`.

**Problem**: Model loading fails / Out of memory

**Symptoms**:
- Server starts but model doesn't load
- Server logs show memory errors or allocation failures
- Health check may return "loading" indefinitely

**Solutions**:
```bash
# Reduce context window size
llama-server -m model.gguf --port 8080 -c 2048

# Use more aggressive quantization (smaller model)
# e.g., Q4_K_M instead of Q8_0 or F16

# Close other applications to free RAM
```

**Common causes**:
- Model too large for available RAM
- Context size too large (-c flag)
- Other processes consuming memory

### genai-electron (Image Diffusion)

**Problem**: Server not reachable

**Solutions**:
```bash
# Check if server is running
curl http://localhost:8081/health

# Set correct base URL if needed
export GENAI_ELECTRON_IMAGE_BASE_URL=http://localhost:8081
```

**Problem**: 503 Server Busy

**Cause**: genai-electron only handles one generation at a time

**Solution**: Wait for current generation to complete before starting another

For async API details, see `docs/dev/2025-10-22-genai-electron-changes.md`.

**Problem**: Progress callbacks not firing

**Cause**: Progress only works with genai-electron diffusion (not OpenAI Images)

**Ensure**: `onProgress` callback is in `settings.diffusion` namespace:
```typescript
settings: {
  diffusion: {
    onProgress: (progress) => { /* ... */ }
  }
}
```

## Error Types Reference

See [Core Concepts - Error Handling](core-concepts.md#error-handling) for complete details.

### Quick Reference

| Error Type | Common Cause | Solution |
|-----------|--------------|----------|
| `authentication_error` | Invalid/missing API key | Verify environment variable is set |
| `rate_limit_error` | Too many requests | Implement exponential backoff |
| `validation_error` | Invalid request parameters | Check error message for specific issue |
| `connection_error` | Server unreachable | Verify local server is running (llama.cpp, genai-electron) |
| `server_error` | Provider-side issue | Check provider status page, retry |
| `invalid_request_error` | Bad parameters | Verify request against model capabilities |

### Validation Errors with Partial Response

When thinking tag enforcement fails, the response may still be available:

```typescript
if (response.object === 'error' && response.error.type === 'validation_error') {
  if (response.partialResponse) {
    console.log('Model output:', response.partialResponse.choices[0].message.content);
  }
}
```

## Thinking Tag Issues

### Enforcement Errors

**Problem**: `validation_error` when using thinking tag fallback

**Cause**: Model didn't include required `<thinking>` tags

**Solution**: Check `partialResponse` for the actual model output:
```typescript
if (response.object === 'error' && response.partialResponse) {
  console.log('Model responded but without thinking tags:', response.partialResponse);
}
```

See [LLM Service - Thinking Tag Fallback](llm-service.md#thinking-tag-fallback) for configuration details.

### llama.cpp Reasoning Setup

For llama.cpp reasoning extraction, ensure:
1. Server started with `--jinja --reasoning-format deepseek`
2. Model supports reasoning (Qwen3, DeepSeek-R1, GPT-OSS)
3. Request includes `settings.reasoning.enabled: true`

See `docs/dev/2025-10-17_llamacpp-reasoning-extraction.md` for implementation details.

## Network Issues

### Connection Errors

**Problem**: `connection_error` or network timeout

**Common causes**:
- **Cloud providers**: No internet connection
- **Local providers**: Server not running (llama.cpp, genai-electron)
- **Wrong base URL**: Check environment variables

**Solutions**:
```bash
# For llama.cpp
export LLAMACPP_API_BASE_URL=http://localhost:8080
curl $LLAMACPP_API_BASE_URL/health

# For genai-electron
export GENAI_ELECTRON_IMAGE_BASE_URL=http://localhost:8081
curl $GENAI_ELECTRON_IMAGE_BASE_URL/health
```

### Network Error Codes

From `errorUtils.ts:92-102`:
- `ENOTFOUND`: DNS resolution failed (check hostname)
- `ECONNREFUSED`: Server not listening (check if server is running)
- `ETIMEDOUT`: Connection timed out (check network/firewall)

## Related Documentation

### Detailed Guides

- **[llama.cpp Integration - Troubleshooting](llamacpp-integration.md#troubleshooting)** - Local LLM issues
- **[Core Concepts - Error Handling](core-concepts.md#error-handling)** - Error types and structure
- **[LLM Service - Thinking Tag Fallback](llm-service.md#thinking-tag-fallback)** - Thinking tag configuration
- **[Image Service](image-service.md)** - Image generation issues

### Developer Documentation

For in-depth technical details:
- **llama.cpp reasoning extraction**: `docs/dev/2025-10-17_llamacpp-reasoning-extraction.md`
- **genai-electron async API**: `docs/dev/2025-10-22-genai-electron-changes.md`
- **Error mapping**: `src/shared/adapters/errorUtils.ts`
