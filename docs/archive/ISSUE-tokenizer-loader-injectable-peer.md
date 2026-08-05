# Tokenizer loader: injectable peer, lazy rank chain, guarded rank loading

Filed: 2026-08-05, by palimpsest-engine
Status: RESOLVED — 2026-08-05 (v0.17.2)
Package: genai-lite 0.17.1

Consumer context: Electron GUI, electron-vite/Rollup — the genai-lite root bundled into an
ESM main bundle, `./tokenizer-loader` externalized and shipped as a loose staged package
beside the ASAR.

Four related asks, all in the tokenization layer. Each currently forces bundling consumers
to carry workarounds; none blocks us today.

## 1. Peer resolution forces the loader external

`dist/llm/tokenization/loader/index.js:455` resolves the optional peer with
`createRequire(__filename)`, and `:472` loads it through a TypeScript-down-levelled dynamic
import (`require` over a template literal), which no bundler can see statically. `__filename`
does not exist inlined into an ESM bundle, so every bundling consumer must externalize
`genai-lite/tokenizer-loader` and ship it as a real file. Ask: accept an injected peer
(e.g. `options.tokenizersModule` or an `options.resolvePeer` callback) so the loader can be
bundled and the consumer controls where `@huggingface/tokenizers` comes from.

## 2. The eager js-tiktoken → base64-js chain

`loader/index.js:42` requires `../contentProfiles`, which requires `./profiles`
(`contentProfiles.js:11`), which does a top-level `require("js-tiktoken")` (`profiles.js:9`),
which eagerly requires `base64-js`. Loading a *content* tokenizer therefore drags the
tiktoken stack (22 MB installed, mostly rank tables) into every consumer's loose tree even
when no OpenAI profile is ever used. Ask: make the js-tiktoken import lazy — it is only
needed when a tiktoken-backed profile is actually resolved.

## 3. `loadRankData`'s dynamic require breaks under bundlers

`profiles.js:11-14`:

```js
function loadRankData(moduleId) { const loaded = require(moduleId); ... }
```

called with the literals `"js-tiktoken/ranks/cl100k_base"` (`:20`) and
`"js-tiktoken/ranks/o200k_base"` (`:26`). A computed `require` defeats static bundling:
Rollup's commonjs plugin replaces it with an always-throwing `commonjsRequire` stub, and
every bundling consumer needs bundler-specific handling (`dynamicRequireTargets` or
equivalent). The call sites are literal thunks — replacing the indirection with two direct
lazy requires (or `await import()`s) would make the specifiers statically visible.

## 4. Rank loading is invoked unguarded

`getTokenProfileById` calls `definition.loadRanks()` at `profiles.js:64` with no try/catch,
and `resolveTokenProfile` calls it at `:121` equally unguarded. Combined with (3), a
consumer whose bundler broke the dynamic require gets an **uncaught throw on any
`provider === 'openai'` model resolution** — in our GUI, selecting a shipped OpenAI preset
crashes rather than degrading, while every other failure in this layer degrades to an
estimate profile. Ask: route rank-loading failures into the same graceful path the rest of
the tokenization layer uses (an unavailable/estimate result), so a broken rank table is a
capability loss, not an exception.

## Acceptance criteria

- [x] `loadContentTokenizerProfile()` accepts a statically imported, caller-injected
  `@huggingface/tokenizers` module and validated asserted package version while
  preserving the installed-peer path when injection is omitted.
- [x] Importing the root, prompting, tokenizer-loader, or tokenizer-recipes entry
  does not eagerly evaluate `js-tiktoken` or its rank modules; the three focused
  subpaths also avoid `base64-js` (the root may load it independently through a
  provider SDK).
- [x] The cl100k and o200k rank modules are referenced through separate literal,
  statically analyzable lazy loads and retain their pinned hashes and identities.
- [x] Rank/runtime load, evaluation, validation, construction, and encode failures
  degrade to unavailable evidence without escaping through model capability or
  response-accounting APIs; legacy `countTokens()` retains its documented heuristic.
- [x] Packed declarations typecheck both without the optional peer and with an
  injected real peer namespace, without peer-owned types leaking into genai-lite
  declarations.
- [x] A packed Rollup ESM bundle runs without `dynamicRequireTargets` or loader
  externalization, counts with both built-in rank families, and loads a warm
  tokenizer recipe through the injected peer path.

## Reproduction sketch for 3+4

```bash
mkdir repro && cd repro && npm init -y && npm i genai-lite rollup @rollup/plugin-node-resolve @rollup/plugin-commonjs
printf "import { resolveTokenProfile } from 'genai-lite';\nconsole.log(resolveTokenProfile('openai','gpt-5.1'));\n" > entry.mjs
npx rollup entry.mjs --format esm --file dist/bundle.mjs -p node-resolve -p commonjs
node dist/bundle.mjs
# → Error: Could not dynamically require "js-tiktoken/ranks/o200k_base" (uncaught)
```

## Context

The consumer-side picture — externalized loader, staged loose closure
(genai-lite + js-tiktoken + base64-js + @huggingface/tokenizers), build-time checker — is in
palimpsest-engine's `docs/devlogs/2026-08-05-packaged-runtime-dependencies.md`. Asks 1 and 2
would shrink that staged closure; asks 3 and 4 close a live crash we are otherwise fixing
consumer-side with bundler configuration.

## Resolution

Resolved on 2026-08-05 for v0.17.2. The loader now accepts a validated,
caller-injected tokenizer runtime/version while preserving installed-peer
discovery. Built-in cl100k/o200k profiles use literal lazy rank loads,
hash-verified defensive snapshots, and the js-tiktoken lite runtime; rank and
runtime failures return unavailable evidence instead of escaping through
capability or response-accounting APIs. The legacy prompting wrapper remains
lazy and retains its documented numeric heuristic fallback.

Verification passed 49 Jest suites (1,134 tests), the TypeScript build, packed
peer-free and injected-peer declaration checks, real Rollup ESM execution for
both built-in rank families and the injected real peer, package dry-run,
compiled export smoke testing, and the production high-severity audit. The
full-tree audit retains one known dev-only `brace-expansion` advisory through
Jest/ts-jest. Independent doublecheck findings were fixed and rechecked. No
commit, push, tag, release, publication, or real-provider E2E call was made.
