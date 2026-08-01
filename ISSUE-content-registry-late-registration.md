# Content-token registry: no registration path after the first read

Created: 2026-07-31
Status: OPEN
Package: genai-lite (v0.17.0)
Filed by: Palimpsest Engine

## Observation

`ContentTokenProfileRegistry` freezes on the first `resolve()` and rejects every later
`register()` ("registration is closed after the first content-profile read"). The freeze is
reached from inside `LLMService` itself — `getModelCapabilities` → `buildModelCapabilities` →
`resolveContentTokenProfile`, and again in `postProcessResponse` on every cloud response — so
any application that touches a cloud model before its local one has permanently lost the
ability to register a local content tokenizer for the process. In Palimpsest's GUI the cloud
Scribe is the default configuration, so the out-of-the-box order is exactly the losing one:
play a cloud game, switch to local Gemma, and the shipped Gemma recipe can no longer be
registered until the app restarts. Downstream can narrow the window (register eagerly at
startup when a local model is installed) but cannot close it: a model downloaded mid-session
after any cloud activity is unregistrable.

## Request

One of, in preference order:

1. Allow registration while the registered/aliased namespace is untouched by prior reads: a
   read that resolved `(llamacpp, X)` to *unavailable* has observed nothing a later
   registration of `(llamacpp, X)` contradicts, so rejecting it protects no invariant.
2. An explicit two-phase API: reads before `finalizeContentTokenProfiles()` (or similar) see
   builtins only and do not freeze; the application chooses the freeze point.
3. At minimum, a documented supported pattern for hosts whose provider mix is not known at
   startup.

## Non-request

The freeze-for-determinism goal is understood (a resolved profile must never change meaning
mid-process). Option 1 preserves it: only never-successfully-resolved keys become registrable.
