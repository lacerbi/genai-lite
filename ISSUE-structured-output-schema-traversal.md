# ISSUE: Structured-output schema preparation does not traverse `$defs` or `anyOf`/`oneOf`/`allOf`

Created: 2026-07-26
Status: OPEN
Package: genai-lite
Split out of: `docs/archive/ISSUE-anthropic-structured-output-compatibility.md` (item 3)

## Summary

`AnthropicClientAdapter.addAdditionalPropertiesFalse` walks only the `properties`
and `items` keywords when injecting `additionalProperties: false`. Object schemas
reachable through `$defs`, `$ref`, `anyOf`, `oneOf`, or `allOf` are left
untouched, so a strict-mode request built from such a schema can be rejected by
Anthropic, which requires `additionalProperties: false` on every object schema.

This was deliberately left out of the 0.13.1 GA-compatibility patch, which was
scoped to the request contract. The current behaviour is pinned by a test
(`documents that $defs and anyOf branches are NOT traversed` in
`src/llm/clients/AnthropicClientAdapter.test.ts`) so the limitation is recorded
rather than silently assumed away.

## Severity: low today, higher if the schema type is widened

The exported `StructuredOutputSchema` type cannot express `$defs`, `$ref`,
`anyOf`, `oneOf`, or `allOf` — it only has `type`, `properties`, `required`,
`items`, `additionalProperties`, and `description`. A TypeScript caller therefore
cannot hit this through the typed API without an `as any` cast.

The two paths that do reach it:

- `<META>` template blocks, where `SettingsManager` validates
  `structuredOutput.schema` as "is an object" and nothing more.
- Callers casting an externally-generated JSON Schema (e.g. from `zod-to-json-schema`,
  which emits `$ref`/`$defs` for reused sub-schemas) onto `StructuredOutputSchema`.

The second is the realistic one: schema-generation libraries factor repeated
shapes into `$defs` by default.

## Options

1. **Harden the traversal.** Extend the walker to `$defs`, `definitions`, and the
   `anyOf`/`oneOf`/`allOf` arrays. Cheap, but note Anthropic does not support
   recursive schemas, so a `$ref` cycle guard is needed to avoid infinite
   recursion on input that the API would reject anyway.
2. **Widen `StructuredOutputSchema`** to model composition keywords, so the type
   system and the walker agree about what is expressible.
3. **Reject unsupported keywords at validation time** with a clear error, instead
   of sending a schema that the provider will refuse.

Option 1 plus a cycle guard is the smallest useful fix; option 3 is a reasonable
companion for keywords Anthropic documents as unsupported (recursive schemas,
numeric/string constraints).

## Scope note

The same helper shape exists per-adapter. Check whether OpenAI, Gemini, and
OpenRouter need equivalent treatment before fixing this in one place only — if
they do, the walker belongs in a shared utility rather than in
`AnthropicClientAdapter`.

## Acceptance criteria

- [ ] Object schemas nested under `$defs` and composition keywords receive
      `additionalProperties: false` in strict mode.
- [ ] A self-referencing `$ref` does not cause unbounded recursion.
- [ ] The pinning test in `AnthropicClientAdapter.test.ts` is replaced with a
      positive traversal assertion.
- [ ] A decision is recorded on whether the walker becomes shared across adapters.
