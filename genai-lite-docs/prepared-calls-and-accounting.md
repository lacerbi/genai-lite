# Prepared Calls and Token Accounting

Use prepared calls when an application must inspect the final semantic provider
request, enforce a context boundary, or retain truthful response evidence.
`sendMessage()` and `streamMessage()` remain convenient wrappers over this same
path.

## Prepare, inspect, and dispatch

```typescript
import {
  LLMService,
  fromEnvironment,
} from "genai-lite";

const service = new LLMService(fromEnvironment);
const result = await service.prepareMessage(
  {
    providerId: "openai",
    modelId: "gpt-4.1-mini",
    messages: [{ role: "user", content: "Return a short answer." }],
    settings: { maxTokens: 200 },
  },
  { mode: "complete" }
);

if ("object" in result) {
  throw new Error(result.error.message);
}

const prepared = result;
const inspection = await service.inspectPrepared(prepared);
if ("object" in inspection) {
  throw new Error(inspection.error.message);
}

const response = await service.sendPrepared(prepared);
```

Preparation is credential-free. API keys, abort signals, timeout state, SDK
clients, and authorization headers are created or resolved only at dispatch.
The inspection view is an immutable library-owned semantic representation, not
the provider SDK request class.

A prepared handle:

- belongs to the `LLMService` instance that created it;
- is immutable, reusable, and not serializable;
- is fixed to `complete` or `stream` mode;
- rejects forged, deserialized, cross-service, and wrong-mode use.

Complete retries redispatch the same frozen semantic command. Observable local
bindings are revalidated before every physical inference request.

## Streaming

```typescript
const result = await service.prepareMessage(request, { mode: "stream" });
if ("object" in result) {
  throw new Error(result.error.message);
}

for await (const event of service.streamPrepared(result)) {
  console.log(event.attemptId, event.type);
}
```

Every event from one invocation has the same `attemptId`. A consumed stream has
exactly one `complete` or `error` terminal. genai-lite does not automatically
retry a physical stream. Redispatching a stream handle starts a new attempt with
a new ID.

If a stream is cancelled or fails, its `partialResponse` retains raw content,
usage provenance, answer accounting, and termination evidence that the provider
had already delivered. Built-in adapters record all evidence in a received
provider chunk before exposing any public event from that chunk, including when
usage, content, and a finish reason arrive together.

## Structured-output delivery

Native delivery is the default:

```typescript
structuredOutput: {
  name: "answer",
  schema,
  delivery: "native",
}
```

Use `delivery: "prompt"` explicitly when the schema should be injected as a
versioned instruction:

```typescript
structuredOutput: {
  name: "answer",
  schema,
  delivery: "prompt",
}
```

Prompt delivery suppresses the provider-native schema field. Inspection marks
it as `instruction_only`, and the injected instruction is part of the inspected
messages and prepared accounting. It is guidance, not provider enforcement.

For native delivery, inspection reports `provider` when the final provider
payload contains the schema and `json_only` when that provider can request JSON
syntax but cannot enforce the supplied schema. The optional inspected `name`
and `schema` are derived from the final payload rather than copied from the
original settings.

## Prompt and output evidence

`promptAccounting` is either unavailable or contains a point count, a certified
upper bound, or both:

- `exact`, `model`, and `heuristic` describe point-count strength.
- `uncertaintyTokens` describes non-exact evidence. It is not a capacity margin.
- `upperBound` is present only for a proof-backed structural certificate.
- Content-only tokenization is not reported as prepared-message accounting.

`outputTokenLimit` reports the value actually serialized, its source
(`request`, `preset`, `model_default`, `library_default`, or
`provider_default`), any verified hard-limit clamp, and what the provider counts.
An ordinary model default is not treated as a hard limit.

For llama.cpp, preparation uses
`/v1/chat/completions/input_tokens` over the final mode-bound body. The exact
count is bound to hashes of the active model, server build, and chat template.
Dispatch rejects a detected change as `PREPARED_CALL_STALE`.

### Authoritative endpoint revisions

An application that manages a local provider process can bind prepared calls to
an authoritative process generation or endpoint revision without coupling
genai-lite to that process manager:

```typescript
const localService = new LLMService(async () => "not-needed", {
  providerEndpointRevisionProvider: async ({ providerId, modelId }) => {
    const ready = await localEndpointManager.getReadyState(providerId, modelId);
    return ready?.serverGeneration;
  },
  cachePreparationStateByEndpointRevision: true,
});
```

The callback is optional. Omit it for services whose providers do not expose an
authoritative endpoint revision. When configured, it applies to every prepared
call created by that service and must return a non-empty string or finite
number. A missing revision during preparation fails closed with
`PREPARED_CALL_STALE`.

The callback must read live authoritative state on every invocation. It must not
close over the generation current when the service or prepared call was
created. Genai-lite captures the revision before provider capability, state, or
token-count preparation so a restart during those preflights leaves the handle
bound to the earlier generation. The captured value is available at
`inspection.bindings.providerEndpointRevision`. Genai-lite invokes the callback
again after adapter-specific state validation and immediately before every
physical complete-call attempt or streaming dispatch. A missing or different
current value rejects the dispatch with `PREPARED_CALL_STALE` before inference.

For llama.cpp, the authoritative endpoint revision complements rather than
replaces `serverStateFingerprint`: the fingerprint detects model, build, or
template changes within one server generation, while the revision detects a
process restart whose observable state is otherwise identical.

`cachePreparationStateByEndpointRevision` is false by default and cannot be
enabled without `providerEndpointRevisionProvider`. Enabling it is a host
assertion that the revision changes whenever cached model, server-build, or
chat-template state changes. In that mode genai-lite:

- reads the live revision before model resolution;
- reuses one model/build/template snapshot for resolution and preparation;
- still performs the final prepared-message token count for every call;
- reads the live revision again after all preparation work and rejects a
  changed or missing value;
- keeps adapter and endpoint revalidation live before every complete retry and
  stream dispatch.

Without that assertion, genai-lite retains the conservative live path: it reads
llama.cpp model/build/template state before and after each exact prompt count.
An incorrect host assertion still fails closed at live dispatch revalidation;
it never authorizes a send against a detected stale binding.

## Content-token profiles

Content-token profiles count ordinary JavaScript string text without chat
framing, BOS/EOS insertion, postprocessor tokens, or special-token
interpretation. They are useful for retained answer text and advisory sizing;
they do not replace prepared-message counting.

The content API has two trust levels:

- `exact`: built-in hash-verified js-tiktoken profiles;
- `model`: host-registered synchronous tokenizers, including recipe-loaded
  tokenizers.

The built-in cl100k/o200k rank modules and lite runtime are loaded only when a
matching profile is resolved or counted. Rank-module evaluation, shape, hash,
byte-completeness, tokenizer construction, and encoding failures fail closed:
the relevant resolution or count is `unavailable`, and certificate APIs remain
unavailable rather than substituting a heuristic.

`ContentTokenProfile` is intentionally separate from the certified
`TokenProfile` type. Registered profiles are always forced to `model` quality
and certificate functions reject them, including through runtime casts. A
recipe hash and passing self-tests prove reproducibility, not a structural
token-bound certificate.

Registration is process-global, synchronous, transactional, and append-only.
It may run during startup or later after a model-specific loader finishes. Each
batch adds new backend IDs and exact aliases; it cannot replace existing
backends, registered aliases, or built-in mappings. Register a new backend and
its aliases together when they should become visible as one state transition:

```typescript
import {
  registerContentTokenProfileConfiguration,
  resolveContentTokenProfile,
} from "genai-lite";
import {
  loadContentTokenizerProfile,
} from "genai-lite/tokenizer-loader";
import {
  GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE,
} from "genai-lite/tokenizer-recipes";

const backend = await loadContentTokenizerProfile(
  GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE,
  {
    cacheDir: "/application-owned/tokenizer-cache",
    allowDownload: true,
  }
);

registerContentTokenProfileConfiguration({
  backends: [backend],
  aliases: [
    {
      providerId: "llamacpp",
      modelId: "gemma-4-12b-it-IQ4_XS.gguf",
      profileId: backend.id,
    },
  ],
});

const resolved = resolveContentTokenProfile(
  "llamacpp",
  "gemma-4-12b-it-IQ4_XS.gguf"
);
```

Content-profile reads do not close the registry. A lookup that is unavailable
in one snapshot may become available after a later successful addition, so
re-query resolutions and model capabilities after registering. Once a key is
available, its profile identity cannot change. Failed multi-backend
registration commits nothing.

To add another model alias for an already registered tokenizer, use an
alias-only batch rather than registering the backend ID again:

```typescript
registerContentTokenProfileConfiguration({
  backends: [],
  aliases: [{
    providerId: "llamacpp",
    modelId: "another-gemma-4-model.gguf",
    profileId: backend.id,
  }],
});
```

Aliases are exact, case-sensitive `(providerId, modelId)` tuples. There is no
family inference or GGUF-name normalization. An alias may target a built-in
exact profile or a registered model-quality profile. The profile's stable
semantic revision is separate from the runtime mapping revision, which also
binds exact aliases and validated runtime package provenance. The mapping
revision identifies the complete registry snapshot read by that result. It
changes after a successful addition even when an existing key still resolves
to the same profile; failed batches do not change it.

`LLMService` capability results are point-in-time snapshots. Response
post-processing resolves content profiles live, so a profile registered after
preparation but before terminal processing may add missing model-quality
raw-content evidence. It never changes the prepared provider request or
overwrites provider-output evidence.

### Optional loader and recipes

The loader runtime is an optional peer:

```bash
npm install @huggingface/tokenizers@^0.1.3
```

By default, the loader discovers the installed peer relative to its own package
location and proves the version from the nearest package manifest. Bundled
applications may instead inject a statically imported namespace:

```typescript
import * as tokenizersModule from "@huggingface/tokenizers";
import {
  loadContentTokenizerProfile,
} from "genai-lite/tokenizer-loader";
import {
  GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE,
} from "genai-lite/tokenizer-recipes";

const backend = await loadContentTokenizerProfile(
  GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE,
  {
    cacheDir: "/application-owned/tokenizer-cache",
    allowDownload: false,
    tokenizersPeer: {
      module: tokenizersModule,
      packageVersion: "0.1.3",
    },
  }
);
```

For injection, `packageVersion` is the caller's assertion about the supplied
namespace. The loader validates it against `^0.1.3` and records it in runtime
provenance, but it cannot prove it from a package path. Recipe-loaded backends
remain model-quality evidence and cannot enter certificate APIs.
Unsupported or indeterminate asserted versions fail with
`TOKENIZER_PEER_VERSION_UNSUPPORTED`; malformed injected modules and tokenizer
construction failures use `TOKENIZER_LOAD_FAILED`. Unknown fields in the
options or `tokenizersPeer` wrapper remain strict recipe-validation errors.

Importing `genai-lite`, `genai-lite/tokenizer-recipes`, or
`genai-lite/tokenizer-loader` does not load that peer. Only
`loadContentTokenizerProfile()` resolves it. A missing, indeterminate, or
unsupported runtime fails at that call with an actionable typed error.

Recipe loading is an explicit asynchronous initialization step that may run at
startup or as part of a later model-install workflow. It:

- validates the complete recipe before filesystem or network work;
- requires a caller-selected cache and explicit download permission;
- verifies SHA-256 on downloads and every warm-cache use;
- quarantines corrupt blobs and publishes verified downloads atomically;
- runs fixed ordinary-text regression tests before returning;
- returns a synchronous backend whose ordinary counts perform no filesystem,
  network, dynamic-import, or subprocess work.

The Gemma 4 IT recipe records coverage for the official E4B, 12B, 26B-A4B,
and 31B instruction-tuned repositories at immutable revisions. Coverage is
provenance, not an alias allowlist. Aliasing another model or quantized GGUF is
the caller's equivalence assertion.

For a local GGUF, use a lifecycle-stable exact slug rather than a mutable ID
such as `llamacpp`. Before registering an out-of-coverage alias, compare a
representative ordinary-text corpus with the active server's `/tokenize`
endpoint using no BOS and no special parsing. Continue to prefer
llama.cpp's active-template prepared count as hard prompt evidence; a local
content profile remains model evidence.

For Rollup/Vite/esbuild-style application bundles, prefer the injected form so
the application owns a statically analyzable peer import. The injected path
does not evaluate the loader's `createRequire(__filename)` discovery branch and
does not require `dynamicRequireTargets`. Externalizing
`genai-lite/tokenizer-loader` and preserving the installed-peer path remains a
fallback when injection is unsuitable.

The loader and recipes subpaths do not traverse js-tiktoken. Built-in ranks use
separate literal lazy loads, and ordinary root/prompting imports do not evaluate
js-tiktoken. This is an evaluation and bundler-analyzability guarantee, not a
promise that every bundler will prune the same bytes: `js-tiktoken@1.0.21`
remains an exact production dependency and therefore remains in npm's installed
dependency graph. The package root may also evaluate `base64-js` independently
through Google's authentication SDK; that is not the removed tiktoken chain.

## Certified structural bounds and margins

`countTextTokens()` returns exact ordinary-text evidence for a pinned profile.
`retokenizationUpperBound()` and `codePointBoundToTokenUpperBound()` return
certificate-backed structural bounds. These APIs have no consumer-margin
parameter and never add a session heuristic margin.

Apply an application margin exactly once:

```typescript
const effectiveCapacity = rawCapacity - heuristicMargin;
const fits =
  promptTokenUpperBound + outputBound + countingSlack <= effectiveCapacity;
```

Numeric example:

```text
rawCapacity = 1000
heuristicMargin = 100
effectiveCapacity = 900
promptTokenUpperBound = 700
outputBound = 150
countingSlack = 25
875 <= 900
```

Charging the margin again gives `975 <= 900`, which is false. For an exact
profile, use `heuristicMargin = 0`; keep any explicit `countingSlack` separate.

Retokenization certificates cover text decoded from the declared number of
ordinary source-generation tokens. They exclude special/control tokens and do
not assume a same-profile `n -> n` identity proof.

These certificates are proof tools, not ordinary capacity estimates. For
example,
`retokenizationUpperBound(1000, o200kProfile, cl100kProfile)` returns a
sound **384,000-token** upper bound because it covers maximum decoded bytes and
worst-case invalid-byte replacement. That result is deliberately too
conservative for routine context sizing.

For advisory sizing, use known profile identity or an application-owned
estimate/ratio and keep it explicitly non-certified. If the source is bounded
by Unicode code points rather than generated tokens, use
`codePointBoundToTokenUpperBound()`; its `codePoints * 4` byte bound is the
appropriate certified conversion.

## Response evidence

Provider usage fields remain optional. A missing field is not rewritten to
zero; a provider-reported zero remains zero. `usageEvidence` records whether a
field is provider-reported, derived, or heuristic.

Choices retain:

- `rawContent` before library cleanup;
- ordered `rawContentParts` where the provider exposes typed parts;
- `answerAccounting.rawContent` for a count over retained pre-normalization
  answer content;
- `answerAccounting.providerOutput` for exact provider-native output usage,
  which may include hidden/native reasoning;
- deprecated `rawAnswerAccounting` as a compatibility mirror of
  `answerAccounting.rawContent` only;
- the legacy `finish_reason`;
- `termination.rawReason` plus a normalized termination classification.

The two accounting scopes are independent and may coexist. Provider-output
evidence never overwrites raw-content evidence and is never copied into the
legacy field. Provider output is attached only when a nonnegative safe-integer
count belongs to exactly one physical choice. Aggregates over multiple choices,
missing components, ambiguous reasoning scope, and a zero count alongside
known generated output remain absent. No byte-based fallback is used for answer
enforcement.

For Gemini, candidates and thoughts are summed when both are known.
Candidates-only accounting is used only when either the exact resolved model
has no provider-native thinking or the exact model supports full disable and
the serialized request contains `thinkingBudget: 0`. A positive reported
thoughts count overrides either exclusion claim.

Accounting belongs to the physical response envelope that supplied it,
including terminal streaming and partial-error envelopes. A public multi-step
workflow therefore receives evidence per subcall. Hidden provider retries are
not guessed or aggregated; if the returned envelope does not expose attributable
usage, the scope remains absent.

Generic reasons such as `length` remain ambiguous unless the provider supplied
enough evidence to distinguish an output limit from a context limit. Partial
failures preserve usage and accumulated choice evidence where available.
