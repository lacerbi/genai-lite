# ISSUE: Treat 'cancelled' as a terminal generation status in GenaiElectronImageAdapter

Created: 2026-07-03
Status: RESOLVED (2026-07-03, v0.9.2) — items 1–2 implemented: `'cancelled'`
added to the status union and treated as terminal in `pollForCompletion`,
surfacing as `REQUEST_ABORTED`/`abort_error`. Item 3 (request-side DELETE
cancellation) deferred until the ImageService API grows an AbortSignal.
Package: genai-lite (filed from genai-electron v0.6.0 work)

## Problem

genai-electron v0.6.0 adds a cancellation API to DiffusionServerManager
(`cancelImageGeneration(id)` + `DELETE /v1/images/generations/:id`). Cancelled
generations get a new terminal registry status: **`'cancelled'`**.

`GenaiElectronImageAdapter.pollForCompletion` (src/adapters/image/GenaiElectronImageAdapter.ts,
poll loop ~L211-263) treats only `'complete'` and `'error'` as terminal. When a
generation is cancelled from another code path (e.g. the app's Cancel button
going straight to the manager), the adapter keeps polling until its own
client-side timeout (default 120 s) instead of returning promptly.

## Fix

1. Add `'cancelled'` to `GenerationStatusResponse.status` union (~L36-37).
2. In `pollForCompletion`, treat `status === 'cancelled'` as terminal — throw a
   typed cancellation error (or return a cancellation result) instead of
   looping.
3. Optionally: expose request-side cancellation (send the DELETE) if/when the
   ImageService API grows an AbortSignal.

## Notes

- Severity: low — cancel is usually initiated by the same app that polls, so
  the hang only occurs when cancellation happens out-of-band.
- genai-electron docs (image-generation.md) document this caveat for
  genai-lite ≤ 0.9.0.
