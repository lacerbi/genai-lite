# ISSUE: Gemini timeouts are classified as 'client_error', not REQUEST_TIMEOUT

Created: 2026-07-03
Status: RESOLVED (2026-07-03, v0.9.2)
Package: genai-lite (filed from palimpsest-engine 0.9.1 integration work)

## Resolution

Fixed via the adapter-owned-timeout variant (the more robust option below), scoped
to timeout + abort. `GeminiClientAdapter.sendMessage` now composes its own
`AbortController` (chaining any caller-supplied signal), arms a local timer when
`timeoutMs` is set, and classifies in the catch block from adapter-side state:
timer fired → `REQUEST_TIMEOUT`/`timeout_error`; caller signal aborted →
`REQUEST_ABORTED`/`abort_error` (checked first — user intent wins). No message
sniffing: the SDK's wrapper makes timeout and user abort byte-identical, so the
error object cannot distinguish them anyway. `httpOptions.timeout` is still sent
(padded +1s) to preserve the SDK's `X-Server-Timeout` server-side hint while the
local timer always fires first. Regression tests mock the SDK's plain-Error
wrapper shape for timeout, abort, and fall-through cases.

Not addressed (out of scope by decision): the same SDK wrapper also flattens
network-level fetch failures (`exception TypeError: fetch failed sending
request`) into `UNKNOWN_ERROR`/`client_error`, so Gemini network errors are not
retried either. Fixing that would require message sniffing; revisit if it bites.

## Problem

Per-request `timeoutMs` for the Gemini provider is implemented by passing
`httpOptions: { timeout }` to `@google/genai`
(src/llm/clients/GeminiClientAdapter.ts:90-91). The SDK enforces it with
`setTimeout(() => abortController.abort(), httpOptions.timeout)` — a plain
abort, so the fetch rejects with an `AbortError` DOMException — and then its
`apiCall` wraps *any* fetch rejection in a plain
`new Error(`exception ${e} sending request`)` (verified against
@google/genai 1.34.0: dist/node/index.mjs L11717 and L11859; re-verified
against 1.37.0: L11748 and L11890). The result reaching genai-lite has
`name: 'Error'`, no `status`, no `code`.

`getCommonMappedErrorDetails` (src/shared/adapters/errorUtils.ts) therefore
misses the `AbortError`/`APIConnectionTimeoutError`/`TimeoutError` name
branches (~L88-112) and the HTTP-status branches, falling through to the
generic mapping: **`errorCode: UNKNOWN_ERROR`, `errorType: 'client_error'`**.

Additionally (found while verifying): a caller-supplied `AbortSignal` funnels
through the same internal controller and wrapper, so **user aborts were also
misclassified** — never `REQUEST_ABORTED`.

Consequences:

1. **The unified retry layer never retries Gemini timeouts.** `withRetry`
   retries `REQUEST_TIMEOUT` (default `retryOnTimeout: true`), but Gemini
   timeouts surface as `UNKNOWN_ERROR` — inconsistent with OpenAI/Anthropic/
   llamacpp, whose SDK timeout errors map to `REQUEST_TIMEOUT`/`timeout_error`.
2. **Consumers cannot classify timeouts by `error.type`/`error.code`.**
   palimpsest-engine works around this at its own boundary by sniffing
   abort-shaped messages (host-kit `toLLMError()`), which is fragile.

## Fix

In `GeminiClientAdapter`, classify before falling back to the common mapping:
when `options.timeoutMs` was set and the caught error message matches the
SDK's abort wrapper (e.g. `/AbortError/` + `sending request`), map to
`ADAPTER_ERROR_CODES.REQUEST_TIMEOUT` / `errorType: 'timeout_error'`.
If a caller-supplied `AbortSignal` is aborted, map to `REQUEST_ABORTED`
instead (user abort, never retried). Alternatively (more robust than message
sniffing): let the adapter own the timeout — race the SDK call against its
own `AbortSignal.timeout(timeoutMs)` and classify by which fired — instead of
delegating to `httpOptions.timeout`.

## Notes

- Severity: medium — silent loss of timeout retries and misclassification on
  a major provider; no crash.
- A regression test should assert that a Gemini request failing via
  `httpOptions.timeout` produces `REQUEST_TIMEOUT`, mocking the SDK's
  plain-Error wrapper shape.
- The wrapper message format is SDK-internal and may change between
  @google/genai versions — another argument for the adapter-owned-timeout
  variant of the fix.
