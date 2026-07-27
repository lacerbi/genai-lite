# ISSUE: Anthropic requests send both temperature and top_p

Created: 2026-07-27
Status: COMPLETE
Resolved: 2026-07-27
Resolution release: Next release (version not yet assigned)
Package: genai-lite 0.14.0

## Problem

`genai-lite` sends both `temperature` and `top_p` on Anthropic Messages API
requests. Claude Haiku 4.5 rejects that request before generation:

> `temperature` and `top_p` cannot both be specified for this model. Please use
> only one.

This blocks ordinary generation and structured-output calls through the
Anthropic adapter. It was reproduced through genai-lite's real-provider
structured-output E2E test with `claude-haiku-4-5-20251001`.

The structured-output request shape is not the failure. The adapter already
uses Anthropic's current generally available field,
`output_config.format`, without a beta header. Anthropic documents that shape
and lists Claude Haiku 4.5 as supporting structured output:

- <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>

## Reproduction

From the genai-lite repository, with `E2E_ANTHROPIC_API_KEY` available:

```powershell
.\node_modules\.bin\jest.cmd --config jest.e2e.config.js --runInBand --coverage=false --runTestsByPath e2e-tests/structured-output.e2e.test.ts --testNamePattern "Anthropic"
```

The test selects Claude Haiku 4.5 and receives HTTP 400 before the provider can
attempt schema-constrained generation.

The same defect can be reproduced directly in genai-lite by sending any
Anthropic request through `LLMService` with the default settings resolution.
Structured output is not required to trigger it.

## Root cause

Three layers combine to create an invalid provider request:

1. `DEFAULT_LLM_SETTINGS` supplies both `temperature: 0.5` and `topP: 0.95`.
2. `SettingsManager.mergeSettingsForModel()` materializes both values even when
   the caller specified neither sampler, and retains both when the caller
   overrides only one.
3. `AnthropicClientAdapter.prepareMessageRequest()` unconditionally serializes
   both resolved values as `temperature` and `top_p`.

The main Anthropic adapter unit fixture also supplies both values, and its basic
request assertion explicitly expects both fields. The test therefore codifies
the invalid payload instead of catching it.

This cannot be fixed cleanly at call sites. Passing `undefined` does not
suppress an inherited default because settings resolution uses nullish
fallback. Provider request validity belongs in genai-lite.

## Required behavior

An Anthropic request must never reach the SDK transport with both
`temperature` and `top_p`.

Settings precedence must preserve caller intent:

- If the caller explicitly supplies only `temperature`, send `temperature` and
  omit `top_p`.
- If the caller explicitly supplies only `topP`, send `top_p` and omit
  `temperature`.
- If the caller supplies neither, apply at most one documented Anthropic
  default. Prefer retaining genai-lite's temperature default and omitting the
  global `topP` default for Anthropic.
- If the effective caller-authored configuration explicitly supplies both,
  reject it locally with a standardized validation failure before retrieving an
  API key or calling the Anthropic SDK.

"Explicitly supplies" must account for every caller-controlled settings source
supported by `LLMService`, including request settings, preset settings, and
template-derived settings. The implementation must not infer explicitness only
from the fully materialized settings object, where defaults and caller-authored
values are indistinguishable.

The Anthropic adapter should still defensively prevent an invalid two-sampler
payload if an `InternalLLMChatRequest` reaches it directly. Whether that guard
returns a local failure or applies a documented precedence rule should be
settled during implementation, but it must not send both fields.

## Test-first implementation

Add failing coverage before changing behavior:

1. Settings resolution: Anthropic with no sampler override resolves to at most
   one sampler.
2. Settings resolution: explicit `temperature` suppresses inherited `topP`.
3. Settings resolution: explicit `topP` suppresses inherited `temperature`.
4. Validation: explicit conflicting samplers fail locally and do not call the
   API-key provider or adapter.
5. Adapter serialization: Anthropic request payloads contain at most one of
   `temperature` and `top_p`.
6. Adapter defense: a directly constructed internal request with both samplers
   cannot reach `anthropic.messages.create()`.
7. Regression: existing structured-output tests continue to assert
   `output_config.format`, no beta header, and schema strictness processing.

Update the paid Anthropic structured-output E2E test to use
`claude-haiku-4-5-20251001` instead of Sonnet. It must fail on any provider
request-shape rejection; do not convert failures into skips.

## Scope notes

- The immediate fix is provider request construction and settings validation,
  not a call-site workaround.
- Do not remove `topP` from the public cross-provider settings API.
- Do not regress providers that accept both controls.
- Anthropic's newer-model sampling restrictions are evolving. The model
  registry and adapter should be checked against the current Messages API
  reference while implementing, but unrelated model-catalog expansion is not
  required for this issue.
- The current `output_config.format` structured-output implementation should be
  preserved; reverting to transitional `output_format` or beta headers is not a
  fix.

## Acceptance criteria

- [x] No Anthropic SDK call can contain both `temperature` and `top_p`.
- [x] A single caller-selected sampler is preserved and the other is omitted.
- [x] Explicit conflicting sampler settings fail locally before transport.
- [x] Default Anthropic requests remain valid without call-site workarounds.
- [x] Anthropic adapter and settings-resolution unit tests cover the conflict.
- [x] The Anthropic structured-output E2E test uses Claude Haiku 4.5 and passes.
- [x] `npm test` passes.
- [x] `npm run build` passes.
- [x] `npm pack --dry-run` shows the expected package contents.
- [x] `npm audit --omit=dev --audit-level=high` passes.

## Resolution

Anthropic settings resolution now retains at most one sampler, preserving an
explicit caller selection while defaulting to `temperature` when neither is
selected. Explicit conflicts return `INVALID_SETTINGS` before API-key lookup
or transport, and the adapter defensively rejects direct internal requests
that contain both samplers.

Verification completed on 2026-07-27:

- 943 unit tests passed.
- The library and chat demo builds passed.
- Package dry-run validation passed.
- The production dependency audit reported zero vulnerabilities.
- Both focused Anthropic E2E tests passed, including the live Claude Haiku 4.5
  structured-output request.

Release publication is handled by the normal release workflow and is not part
of this implementation issue.
