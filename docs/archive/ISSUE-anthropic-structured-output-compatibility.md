# ISSUE: Ship Anthropic GA structured-output compatibility in 0.13.1

Created: 2026-07-26  
Status: RESOLVED (2026-07-26, v0.13.1) — pending the opt-in paid E2E smoke test  
Target release: 0.13.1  
Package: genai-lite  
Related tracker: `ISSUE-next-steps.md`, item 13

## Resolution

Implemented as specified. `AnthropicClientAdapter.prepareMessageRequest` now
assigns the typed `messageParams.output_config = { format: { type: "json_schema",
schema } }` — no `as any`, no schema `name`, no format-level `strict`. Both
`sendMessage()` and `streamMessage()` call the ordinary endpoint with no
`anthropic-beta` header; `useStructuredOutput` survives only as a
preparation/logging detail. `signal`/`timeout` handling is unchanged.

Verified against the live documentation before implementing: structured outputs
are generally available "for Claude 4.5 and later models", the format object
carries only `type` and `schema`, and the beta header is not required. The
transitional `output_format` + beta-header shape still works "for a transition
period", which is why the drift never failed loudly.

`src/llm/config.ts` declares `structuredOutput` on all eight registered Anthropic
models: `{supported: true, strictMode: true}` on the three Claude 4.5 entries and
`{supported: false, notes: "Anthropic structured outputs require Claude 4.5 or
later"}` on Claude 4, 3.7, and 3.5. Unknown models stay unknown; no 400-message
matching was added.

Schema preparation is unchanged in behaviour and now pinned by tests: nested
object properties and array items are traversed, and `$defs` / `anyOf` are
explicitly documented as *not* traversed. That hardening was split out to
`docs/archive/ISSUE-structured-output-schema-traversal.md` rather than claimed here.

Test additions: adapter tests asserting `output_config.format` exactly plus the
absence of `output_format` and any beta header (non-streaming and streaming),
`enabled: false`, `strict: false`, non-mutation of the caller's schema, and
abort/timeout forwarding on structured requests; `config.test.ts` cases for all
eight Anthropic models; `LLMService` tests proving a `claude-sonnet-4-20250514`
structured request returns `structured_output_not_supported` without reaching the
adapter while `claude-sonnet-4-5-20250929` does reach it. One pre-existing
capability test that used Claude 3.5 Sonnet as its "no metadata" exemplar was
repointed to `openai:o4-mini`, which still has none.

Checks: 914 unit tests pass across 35 suites, `npm run build` and
`npm pack --dry-run` succeed. The pre-existing audit findings surfaced during
release checks were addressed separately in the same release: `brace-expansion`
2.1.1 → 2.1.2 and 1.1.15 → 1.1.16 (clears GHSA-3jxr-9vmj-r5cp), `protobufjs`
7.6.4 → 7.6.5, and `gaxios` 7.1.3 → 7.3.0 — the last of which dropped `rimraf`
and with it the whole `glob`/`minimatch`/`brace-expansion` chain, leaving
**production dependencies at 0 vulnerabilities**. One dev-only advisory
(GHSA-mh99-v99m-4gvg) remains, unfixable from here because jest pins `glob@10`;
see `ISSUE-next-steps.md` item 15. The CI Security Audit job now blocks on
production dependencies and reports the full tree non-blocking.

Shipped: merged as PR #103 (merge commit `438db55`), all 11 CI checks green
(Node 20/22/24 × ubuntu/macos/windows, Package Validation, Security Audit),
tagged `v0.13.1`, and published to npm on 2026-07-26. The published tarball was
verified against the registry: `dist/llm/clients/AnthropicClientAdapter.js`
contains `messageParams.output_config` and zero occurrences of `output_format`,
`anthropic-beta`, or `structured-outputs-2025-11-13`, and the Claude 4.5
capability notes are present in `dist/llm/config.js`.

Outstanding: the paid Anthropic E2E smoke test. Attempted 2026-07-26 with
`E2E_ANTHROPIC_API_KEY` set — the capability-preflight test passed live in 2 ms
(no network round trip), but the GA request returned
`400 invalid_request_error: "Your credit balance is too low"`. Because the credit
check gates ahead of request-body validation, the API almost certainly never
inspected the body, so **the GA request shape remains unconfirmed against the
live API**. Tracked as item 16 in `ISSUE-next-steps.md`.

## Summary

genai-lite 0.13.0 uses Anthropic's transitional beta request shape for structured output. Release 0.13.1 with the stable Claude API shape, explicit model capabilities, regression coverage for normal and streaming calls, and an opt-in live smoke test that fails on provider incompatibility.

This is a genai-lite provider-adapter fix. Palimpsest Engine should remain provider-neutral and only needs to consume 0.13.1 after publication.

## Verified problem

`src/llm/clients/AnthropicClientAdapter.ts` currently bypasses SDK typing and sends:

```ts
output_format: {
  type: "json_schema",
  name,
  schema,
  strict,
}
```

Both `sendMessage()` and `streamMessage()` also add the legacy
`anthropic-beta: structured-outputs-2025-11-13` header. The Anthropic E2E test then treats an `output_format` rejection as a successful skip, so this incompatibility can pass the test suite.

Anthropic made structured outputs generally available on 2026-01-29 for Claude Opus 4.5, Sonnet 4.5, and Haiku 4.5. The stable request shape is:

```ts
output_config: {
  format: {
    type: "json_schema",
    schema,
  },
}
```

The GA format has no beta header, schema `name`, or format-level `strict` field. See the [Anthropic structured-output documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) and [Claude Platform release notes](https://platform.claude.com/docs/en/release-notes/overview).

The installed `@anthropic-ai/sdk` 0.110.0 types already expose
`MessageCreateParams.output_config`, `OutputConfig.format`, and
`JSONOutputFormat { type, schema }`. No SDK upgrade is required for this patch.

## Required implementation

The release should stay focused on the request contract and truthful capability reporting. Do not add unrelated Claude models or refactor other Anthropic features in this patch.

1. **Use the typed GA request field.** In
   `src/llm/clients/AnthropicClientAdapter.ts`, assign the processed schema to
   `messageParams.output_config.format`:

   ```ts
   messageParams.output_config = {
     format: {
       type: "json_schema",
       schema: processedSchema,
     },
   };
   ```

   Remove the structured-output `as any` escape hatch. Keep the generic
   `StructuredOutputSettings.name` and `.strict` fields for other providers, but
   do not serialize either into Anthropic's output format.

2. **Remove the beta transport branch.** Normal and structured requests must
   both call `anthropic.messages.create()` without the legacy beta header.
   Streaming must likewise call `anthropic.messages.stream()` without it.
   Preserve `signal` and `timeout` request options exactly as they work now.
   `useStructuredOutput` may remain as a local preparation/logging detail, but
   it must no longer select an endpoint or header.

3. **Preserve schema preparation without expanding scope accidentally.** Keep
   the existing behavior that adds `additionalProperties: false` to object
   schemas when `strict !== false`, and verify nested object properties and
   array items in unit tests. The existing helper does not traverse `$defs` or
   `anyOf`/`oneOf`/`allOf`; either harden those paths with dedicated tests in
   this patch or file that work separately. Do not silently claim full JSON
   Schema traversal without coverage.

4. **Declare Anthropic model capabilities.** In `src/llm/config.ts`, add:

   - `structuredOutput: { supported: true, strictMode: true }` to the three
     registered Claude 4.5 models.
   - `structuredOutput: { supported: false }` to the registered Claude 4,
     Claude 3.7, and Claude 3.5 models, with one concise note if useful.

   This lets `RequestValidator` return the existing
   `structured_output_not_supported` validation code before spending an API
   request on a known unsupported model. Leave unknown model capability as
   unknown; do not add broad 400-message matching that could misclassify an
   invalid or overly complex schema as an unsupported model.

5. **Make the live test meaningful.** In
   `e2e-tests/structured-output.e2e.test.ts`:

   - Replace the beta comments with the GA contract.
   - Use the registered dated model `claude-sonnet-4-5-20250929`.
   - Remove the branch that catches `output_format` or `"not yet supported"`
     errors and returns successfully.
   - Continue skipping the Anthropic block when `E2E_ANTHROPIC_API_KEY` is
     absent.

## Regression tests

The unit suite must prove the outbound request rather than only checking parsed output. All of these tests use mocks and must not contact Anthropic.

- Add non-streaming adapter tests that assert `output_config.format` exactly,
  and assert the absence of `output_format` and the legacy beta header.
- Add the equivalent streaming request test.
- Cover `structuredOutput.enabled: false`, which must send neither field.
- Cover the existing `strict: false` schema-preparation behavior.
- Verify structured requests still forward abort and timeout transport options.
- Add configuration tests for the three supported Claude 4.5 models and the
  explicitly unsupported older registered models.
- Add a service/validator regression test showing that a structured-output
  request for `claude-sonnet-4-20250514` returns
  `structured_output_not_supported` without calling the adapter.
- Keep the successful response assertion for `parsedContent`.

## Verification and release

Run the focused tests first, then the repository's full release checks. The paid E2E call is a final opt-in smoke test and must run only after the user intentionally provides its dedicated environment variable.

```bash
npx jest src/llm/clients/AnthropicClientAdapter.test.ts \
  src/llm/config.test.ts \
  src/llm/services/RequestValidator.test.ts --runInBand
npm test
npm run build
npm audit --audit-level=high
npm pack --dry-run
```

When `E2E_ANTHROPIC_API_KEY` has deliberately been set:

```bash
npm run test:e2e -- structured-output.e2e.test.ts
```

After the checks pass:

1. Bump both `package.json` and `package-lock.json` to 0.13.1, for example with
   `npm version 0.13.1 --no-git-tag-version`.
2. Commit with DCO sign-off and let CI pass.
3. Publish `genai-lite@0.13.1` and create/push the matching release tag.
4. Mark item 13 in `ISSUE-next-steps.md` resolved, update this issue's status,
   and archive it under `docs/` following the repository's existing issue
   convention.

## Downstream pickup

Palimpsest Engine's `genai-lite` dependency range is already compatible with
0.13.1. After publication, refresh its lockfile, use a Claude 4.5 model for any
real Anthropic structured-output smoke test, and run the focused host-kit LLM
tests. No Anthropic-specific request construction belongs in Palimpsest.

## Acceptance criteria

The issue is complete only when the stable request contract, capability behavior, and published package all agree.

- [x] Non-streaming and streaming Anthropic requests send only
      `output_config.format`.
- [x] No structured-output beta header is sent.
- [x] The GA field is type-checked without an `as any` escape hatch.
- [x] Registered Claude 4.5 models report support; older registered Claude
      models reject before the provider call.
- [x] Unit tests fail if the request regresses to `output_format` or restores
      the beta header.
- [x] The opt-in Anthropic E2E test no longer converts incompatibility into a
      pass.
- [x] Full tests, build, audit review, and package dry-run pass. (Audit
      reviewed: one pre-existing high in the transitive `brace-expansion`
      dependency, not introduced or touched by this patch — see Resolution.)
- [x] `genai-lite@0.13.1` is published and Palimpsest can refresh to it without
      provider-specific code changes. (Published 2026-07-26; `latest` → 0.13.1.
      **Superseded the same day by 0.14.0** — refresh straight to that instead;
      it carries the shared schema walker and the `refusal` → `content_filter`
      finish-reason change. Palimpsest-side refresh still not done — see
      "Downstream pickup" below, and note the `finish_reason` change is worth
      checking there if it switches on that field.)
