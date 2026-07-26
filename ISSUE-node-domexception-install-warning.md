# ISSUE: npm install warns about node-domexception through @google/genai

Created: 2026-07-25
Status: UPSTREAM / LOW PRIORITY
Package: genai-lite 0.13.0

## Problem

Installing genai-lite can emit this deprecation notice:

> npm warn deprecated node-domexception@1.0.0: Use your platform's native
> DOMException instead

The installed dependency chain is:

`genai-lite -> @google/genai -> google-auth-library -> gaxios -> node-fetch ->
fetch-blob/formdata-polyfill -> node-domexception`

The warning is legitimate: supported Node versions provide a native
`DOMException`, and genai-lite already requires Node 20. It is a deprecation
notice rather than a security advisory or installation failure.

## Findings

`package.json` declares `@google/genai ^2.10.0`, so the range already admits
2.13.0 while the committed lockfile still resolves 2.10.0. Consumer installs
ignore genai-lite's lockfile, so refreshing this repository's lock alone does
not change downstream dependency trees.

Updating to `@google/genai` 2.13.0 does not remove the warning. Versions 2.10.0
and 2.13.0 both depend on `google-auth-library ^10.3.0`, which continues through
`gaxios` and `node-fetch`. genai-lite uses the SDK's API-key path, but the SDK's
Node bundle still installs its authentication dependencies.

A local override is not safe or useful:

- `node-domexception` 2.x is also deprecated.
- `fetch-blob` 4.0.0 still depends on `node-domexception ^1.0.0`.
- Overriding `fetch-blob` violates the ranges declared by `node-fetch` and
  `formdata-polyfill`.
- Removing or aliasing the package breaks `fetch-blob/from.js`, which imports
  and constructs it.
- Forking `gaxios`, vendoring the Google SDK, or replacing the official SDK
  with a hand-written REST client adds substantial transport and authentication
  maintenance merely to suppress a cosmetic warning.

## Recommendation

Do not add an npm override and do not replace `@google/genai`. Allow the normal
dependency update to 2.13.0 for currency, but do not present it as a fix for
this warning; the existing range already admits it, so no genai-lite release is
required solely for that update.

Track the warning upstream. The durable fix belongs in Google's stack, most
directly through `gaxios` adopting Node's native fetch on supported Node
versions or `@google/genai` avoiding an unconditional authentication dependency
for API-key-only use.

## Verification for routine SDK updates

Routine Google SDK updates should preserve the Gemini adapter's current request
and error behavior even though they do not remove this warning.

1. Refresh the lock explicitly with `npm update @google/genai`.
2. Run `npm run build`.
3. Run the Gemini adapter unit tests and `npm test`.
4. Run the documented CommonJS export smoke test and `npm pack --dry-run`.
5. Run `npm audit --audit-level=high`.
6. Optionally run the paid Gemini end-to-end suite.

Do not add a test that pins this transitive dependency graph; its removal is
owned upstream.
