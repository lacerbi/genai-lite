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

`ContentTokenProfile` is intentionally separate from the certified
`TokenProfile` type. Registered profiles are always forced to `model` quality
and certificate functions reject them, including through runtime casts. A
recipe hash and passing self-tests prove reproducibility, not a structural
token-bound certificate.

Registration is process-global, transactional, and startup-only. Register the
complete backend and exact-alias set before the first content-profile lookup,
resolution, count, mapping-revision read, capability query, preparation, or
send:

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

The first content-profile read freezes the registry. Module import and
certified-bound calls do not freeze it. Failed multi-backend registration
commits nothing.

Aliases are exact, case-sensitive `(providerId, modelId)` tuples. There is no
family inference or GGUF-name normalization. An alias may target a built-in
exact profile or a registered model-quality profile. The profile's stable
semantic revision is separate from the runtime mapping revision, which also
binds exact aliases and validated runtime package provenance.

### Optional loader and recipes

The loader runtime is an optional peer:

```bash
npm install @huggingface/tokenizers@^0.1.3
```

Importing `genai-lite`, `genai-lite/tokenizer-recipes`, or
`genai-lite/tokenizer-loader` does not load that peer. Only
`loadContentTokenizerProfile()` resolves it. A missing, indeterminate, or
unsupported runtime fails at that call with an actionable typed error.

Recipe loading is an explicit asynchronous startup step. It:

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

For Vite/esbuild-style application bundles, externalize
`@huggingface/tokenizers` and preserve the loader's runtime import.
Externalizing `genai-lite/tokenizer-loader` itself is the simplest safe option
when the bundler cannot preserve optional dynamic dependencies.

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
