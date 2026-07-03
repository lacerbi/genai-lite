# Troubleshooting

Common issues and solutions for genai-lite.

## Contents

- [API Key Problems](#api-key-problems)
- [Provider-Specific Issues](#provider-specific-issues)
- [Error Types Reference](#error-types-reference)
- [Thinking Tag Issues](#thinking-tag-issues)
- [Network Issues](#network-issues)
- [Timeouts, Retries and Cancellation](#timeouts-retries-and-cancellation)
- [Debugging with Logs](#debugging-with-logs)
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

Mistral is a **real** provider backed by the official `@mistralai/mistralai` SDK (since v0.8) — it makes live API calls and requires a valid `MISTRAL_API_KEY`. (Earlier documentation incorrectly described it as a mock/under-development adapter; that is no longer true.)

**Problem**: Structured output isn't strictly validated

**Cause**: Mistral supports JSON mode (`json_object`) only — there's no server-side schema enforcement. genai-lite logs a warning and applies the schema client-side.

**Problem**: `frequencyPenalty` / `presencePenalty` seem to have no effect

**Cause**: Mistral does not support these parameters; they are not sent. Sampling params `topK`, `minP`, `repeatPenalty`, and `logprobs`/`topLogprobs` are also stripped. `seed` is supported (mapped to the SDK's `randomSeed`).

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

For reasoning extraction details, see `docs/devlog/2025-10-17_llamacpp-reasoning-extraction.md`.

**Problem**: Thinking mode (`enable_thinking`) has no effect

**Cause**: The reasoning toggle is applied via the model's Jinja chat template.

**Solution**: Start llama-server with `--jinja`. Without it, the `chat_template_kwargs.enable_thinking` flag that genai-lite derives from `settings.reasoning.enabled` is ignored. Note that Gemma 4's `enable_thinking: true` is best-effort and may not activate reliably (its `enable_thinking: false` path is reliable).

**Problem**: `PROVIDER_ERROR` — "llama.cpp does not support assistant prefill … while thinking is enabled"

**Cause**: A trailing `assistant` message (prefill) was sent together with `reasoning.enabled: true`. llama-server rejects this combination; genai-lite fails fast with this message.

**Solution**: Remove the trailing assistant message, or disable reasoning for that request.

**Problem**: Reasoning markers (e.g. `<think>…</think>`) leak into `message.content`

**Cause**: The server didn't populate the separated `reasoning_content` field, so extraction fell back to markers — behavior that varies across llama.cpp builds.

**Solution**: Update to a recent llama.cpp build (e.g. `b9028` or newer) and ensure `--jinja` (optionally `--reasoning-format deepseek`) is set.

**Problem**: Every first request to a fresh connection is slow (~2s stall) on Windows

**Cause**: `localhost` resolves to IPv6 (`::1`) first; when llama-server listens on IPv4 only, each connection waits for the IPv6 attempt to time out.

**Solution**: genai-lite already defaults to `http://127.0.0.1:8080` for exactly this reason. If you set `LLAMACPP_API_BASE_URL`, prefer `127.0.0.1` over `localhost`.

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
curl http://127.0.0.1:8081/health

# Set correct base URL if needed
export GENAI_ELECTRON_IMAGE_BASE_URL=http://127.0.0.1:8081
```

Use `127.0.0.1`, not `localhost` — on Windows, `localhost` can trigger a ~2s/request IPv6-fallback stall, which the 500ms polling loop pays repeatedly.

**Problem**: 503 Server Busy

**Cause**: genai-electron only handles one generation at a time

**Solution**: Wait for current generation to complete before starting another. This surfaces as `code: 'RATE_LIMIT_EXCEEDED'`, `type: 'rate_limit_error'` on the failure envelope (since v0.10.0).

For async API details, see `docs/devlog/2025-10-22-genai-electron-changes.md`.

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
| `timeout_error` | Request exceeded its timeout (code `REQUEST_TIMEOUT`) | Increase `timeoutMs`; retried automatically unless `retryOnTimeout: false` |
| `abort_error` | Cancelled via `AbortSignal` (code `REQUEST_ABORTED`) | Expected when you abort; never retried |

Since v0.10.0, image failures use the same taxonomy: `ImageFailureResponse.error` carries the adapter's `code`/`type`/`status` (previously always `PROVIDER_ERROR`/`server_error`). For the genai-electron code mappings (e.g. `SERVER_BUSY` → `rate_limit_error`), see [Image Service - Error Handling](image-service.md#error-handling). Note: `ImageService` does not auto-retry — the retry notes in this table apply to `LLMService` only.

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

See `docs/devlog/2025-10-17_llamacpp-reasoning-extraction.md` for implementation details.

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
export GENAI_ELECTRON_IMAGE_BASE_URL=http://127.0.0.1:8081
curl $GENAI_ELECTRON_IMAGE_BASE_URL/health
```

### Network Error Codes

Recognized network error codes (mapped in `src/shared/adapters/errorUtils.ts`):
- `ENOTFOUND`: DNS resolution failed (check hostname)
- `ECONNREFUSED`: Server not listening (check if server is running)
- `ETIMEDOUT`: Connection timed out (check network/firewall)

## Timeouts, Retries and Cancellation

`LLMService` retries transient failures automatically and supports per-request timeouts and cancellation. See [LLM Service - Retries, Timeouts and Cancellation](llm-service.md#retries-timeouts-and-cancellation) for the full API.

**Which failures are retried?** Only transient ones: `RATE_LIMIT_EXCEEDED`, `NETWORK_ERROR`, `REQUEST_TIMEOUT` (unless `retryOnTimeout: false`), and `PROVIDER_ERROR` responses with HTTP status 408, 409, or 5xx. A provider `Retry-After` header is honored. Authentication errors, validation errors, and aborts are never retried.

**Problem**: Too many retries / want a single attempt

**Solution**: Disable retries at the service level or per call:
```typescript
// Service-wide
const llmService = new LLMService(fromEnvironment, { retry: { maxRetries: 0 } });

// Per call (overrides the service default)
await llmService.sendMessage(request, { maxRetries: 0 });
```

**Problem**: Requests hang too long

**Solution**: Set a timeout (service-level or per call). Timeouts surface as `REQUEST_TIMEOUT` / `timeout_error`:
```typescript
const llmService = new LLMService(fromEnvironment, { timeoutMs: 30000 });
await llmService.sendMessage(request, { timeoutMs: 8000 }); // per-call override
```

**Problem**: Cancelling a request doesn't stop provider billing

**Cause**: Aborting is client-side only — the provider may still process (and bill) a request that was already dispatched. Aborts return `REQUEST_ABORTED` / `abort_error` and are never retried.

**Image generation**: `ImageService.generateImage(request, { signal })` supports the same cancellation (no automatic retries or `timeoutMs` option, though — adapters have their own fixed timeouts). For genai-electron, aborting also cancels the generation server-side (`DELETE /v1/images/generations/:id`), freeing the GPU; the same cleanup runs when the adapter's 120s poll timeout expires. See [Image Service - Cancellation](image-service.md#cancellation).

**Tip**: Each retry attempt is logged at `warn` level. Enable `warn` (the default) or lower to see retry activity — look for `Retrying <provider>/<model> after failure (attempt N/M, waiting Xms)`.

## Debugging with Logs

### Enabling Debug Logging

When troubleshooting issues, enable debug logging to see internal operations:

```bash
# Via environment variable
export GENAI_LITE_LOG_LEVEL=debug

# Then run your application
node app.js
```

Or programmatically:

```typescript
const llmService = new LLMService(fromEnvironment, {
  logLevel: 'debug'
});
```

### Log Output Examples

Debug logs show:
- API request parameters
- Provider adapter selection
- Settings resolution
- Error context

Example output:
```
[genai-lite:debug] Merged settings for openai/gpt-4.1-mini
[genai-lite:info] Making OpenAI API call for model: gpt-4.1-mini
[genai-lite:info] OpenAI API call successful, response ID: chatcmpl-...
[genai-lite:warn] Unknown model, using default settings
```

### Suppressing Logs in Tests

```typescript
import { silentLogger, LLMService, fromEnvironment } from 'genai-lite';

const llmService = new LLMService(fromEnvironment, {
  logger: silentLogger
});
```

### Capturing Logs for Analysis

Inject a custom logger to capture logs:

```typescript
const logBuffer: string[] = [];
const captureLogger = {
  debug: (msg: string) => logBuffer.push(`DEBUG: ${msg}`),
  info: (msg: string) => logBuffer.push(`INFO: ${msg}`),
  warn: (msg: string) => logBuffer.push(`WARN: ${msg}`),
  error: (msg: string) => logBuffer.push(`ERROR: ${msg}`)
};

const llmService = new LLMService(fromEnvironment, {
  logger: captureLogger
});

// After operations
console.log('Captured logs:', logBuffer);
```

See [Logging](logging.md) for complete documentation.

## Related Documentation

### Detailed Guides

- **[llama.cpp Integration - Troubleshooting](llamacpp-integration.md#troubleshooting)** - Local LLM issues
- **[Core Concepts - Error Handling](core-concepts.md#error-handling)** - Error types and structure
- **[LLM Service - Thinking Tag Fallback](llm-service.md#thinking-tag-fallback)** - Thinking tag configuration
- **[Image Service](image-service.md)** - Image generation issues

### Developer Documentation

For in-depth technical details:
- **llama.cpp reasoning extraction**: `docs/devlog/2025-10-17_llamacpp-reasoning-extraction.md`
- **genai-electron async API**: `docs/devlog/2025-10-22-genai-electron-changes.md`
- **Error mapping**: `src/shared/adapters/errorUtils.ts`
