# Issue: Public Prepared LLM Calls and Truthful Token Accounting

Created: 2026-07-29
Status: RESOLVED — 2026-07-29 (v0.15.0)

## Summary

Consumers need to inspect the final provider-specific request before dispatch, budget against the
same request that is sent, and interpret completion limits without relying on fabricated usage
values. The current service prepares requests privately, while adapters perform additional
message, schema, system-prompt, and settings transformations later.

Add a public prepared-call seam, model-aware token-counting metadata, certified cross-tokenizer
bounds, prepared-call revision binding, and lossless completion accounting. These features form
one contract: inspection is useful only when it describes the payload actually dispatched and the
response reports which accounting evidence is real.

## Prepared-call API

Expose an immutable prepare, inspect, and dispatch flow alongside the existing convenience
methods. The exact naming may follow existing conventions; the required shape is:

```ts
const prepared = await service.prepareMessage(request, { mode: 'complete' });
const inspection = await service.inspectPrepared(prepared);
const response = await service.sendPrepared(prepared, options);

const preparedStream = await service.prepareMessage(request, { mode: 'stream' });
const events = service.streamPrepared(preparedStream, options);
```

Preparation is mode-bound. `sendPrepared()` accepts only a `complete` artifact, and
`streamPrepared()` accepts only a `stream` artifact. This ensures that streaming-only request
fields, including provider usage-reporting options, are fixed before inspection rather than added
during dispatch.

Preparation must include every deterministic transformation that affects the provider request:

- preset and model-default resolution;
- capability validation;
- unsupported-setting filtering;
- system-message conversion;
- provider-specific message conversion;
- structured-output schema normalization and delivery;
- prompt-based structured-output fallback when selected;
- reasoning and chat-template settings;
- mode-specific provider fields;
- the effective completion-token limit.

Add an explicit structured-output delivery selection for prompt fallback instead of silently
choosing it. Native delivery remains the compatibility default. When prompt delivery is selected,
the deterministic schema instruction and its message placement are part of the prepared request,
inspection, and prompt accounting; no provider-native schema field is also sent. Inspection marks
prompt delivery as instruction-only rather than provider-enforced, and native capability rejection
does not incorrectly reject an explicitly selected prompt fallback.

`sendPrepared()` and `streamPrepared()` dispatch that prepared representation without rebuilding
it through a different transformation path. A prepared call is immutable, reusable, bound to the
`LLMService` instance that created it, and safe to redispatch unchanged where the dispatch mode
permits transport retries. It is opaque and nonserializable; forged, deserialized, cross-service,
and mode-mismatched artifacts are rejected. It contains no API key or other credential in publicly
inspectable data; credentials are resolved only when needed for dispatch.

For built-in adapters, the existing `sendMessage()` and `streamMessage()` remain convenience
wrappers around the same prepare-and-dispatch implementation. The optional capability does not
make existing implementations of the exported adapter interface add new required methods.

## Request inspection

Inspection exposes a stable, read-only, library-owned view of the final semantic provider request.
The view includes the final provider-facing message order and content, system-instruction
placement, structured-output or tool delivery, reasoning and chat-template options, effective
semantic settings, and dispatch mode. It excludes credentials, authorization headers, SDK client
instances, and other transport-only state. Provider SDK request classes remain private.

Inspection also reports enough accounting evidence to enforce a context boundary without implying
false precision. The exact type decomposition may vary, but it must preserve these distinctions:

```ts
interface PreparedPromptTokenCount {
  tokens: number;
  method: 'exact' | 'model' | 'heuristic';
  tokenizerId?: string;
  tokenProfileRevision?: string;
  uncertaintyTokens?: number;
}

interface TokenBoundCertificateRef {
  id: string;
  derivation: string;
  provenance: string;
  sourceProfileRevision?: string;
  targetProfileRevision: string;
}

interface PreparedPromptTokenUpperBound {
  tokens: number;
  certificate: TokenBoundCertificateRef;
}

type PreparedPromptAccounting =
  | {
      status: 'available';
      count: PreparedPromptTokenCount;
      upperBound?: PreparedPromptTokenUpperBound;
    }
  | {
      status: 'available';
      count?: undefined;
      upperBound: PreparedPromptTokenUpperBound;
    }
  | { status: 'unavailable' };

interface EffectiveOutputTokenLimit {
  tokens: number;
  source:
    | 'request'
    | 'preset'
    | 'model_default'
    | 'library_default'
    | 'provider_default';
  requestedTokens?: number;
  clamp?: {
    tokens: number;
    source: 'model_hard_limit' | 'provider_hard_limit';
  };
  counts: 'visible_output' | 'visible_and_reasoning' | 'provider_defined' | 'unknown';
}

interface PreparedRequestBindings {
  adapterRevision: string;
  requestShapeRevision: string;
  tokenProfileRevision?: string;
  providerEndpointRevision?: string;
  serverStateFingerprint?: string;
  chatTemplateFingerprint?: string;
}

interface PreparedRequestInspection {
  provider: ApiProviderId;
  model: string;
  mode: 'complete' | 'stream';
  request: PreparedProviderRequestView;
  promptAccounting: PreparedPromptAccounting;
  outputTokenLimit?: EffectiveOutputTokenLimit;
  bindings: PreparedRequestBindings;
}
```

An available prompt-accounting object contains at least a count, a certified upper bound, or both.
A count covers the final provider-facing messages and schema framing rather than only concatenated
content strings. An upper bound is structurally conservative over that same final representation.
A model or heuristic point estimate is never placed in `upperBound`. `uncertaintyTokens` is zero
or absent for exact counting and describes the provenance and uncertainty of a non-exact point
count. It is not an application safety margin and is not silently added to a certified upper
bound. Inspection must not silently use a different tokenizer or fall back from exact to heuristic
without changing the count method.

Certified prompt bounds contain only tokenizer-, framing-, and transformation-derived structural
allowances. They exclude every consumer/session heuristic safety margin. A consuming application
applies its margin exactly once at the capacity boundary:

```ts
const effectiveCapacity = rawCapacity - heuristicMargin;
const fits =
  promptTokenUpperBound + outputBound + countingSlack <= effectiveCapacity;
```

`countingSlack` is a separately visible allowance chosen from the available counting evidence; it
is not the application's `heuristicMargin`. For exact profiles the application uses
`heuristicMargin = 0`. The library does not accept a consumer margin as input to a certified-bound
API, add one to a returned bound, or subtract one from a model's capacity.

When a request specifies a completion-token maximum, inspection must report the actual
output-token limit that dispatch will enforce after provider/model defaults, capability filtering,
and hard-limit clamping. Its metadata states where the limit came from and whether the provider
counts visible output, visible plus reasoning tokens, or provider-defined units. Absence means the
consumer cannot prove an output boundary; it must not imply that the requested setting survived.

Every prepared call is bound to its model and to required library-controlled adapter and request
shape revisions. Token-profile, provider-endpoint, local-server-state, and chat-template bindings
are included when they are used and observable. Cloud APIs are not assigned a fictional endpoint
revision, and a local server is represented by a stable state fingerprint rather than an assumed
monotonic generation counter.

Immediately before inference dispatch, `sendPrepared()` and `streamPrepared()` revalidate every
available and locally observable binding and reject detected staleness before sending the
inference request. Revalidation may itself require preflight traffic; the contract does not claim
to detect unobservable remote changes or eliminate the interval between validation and dispatch.
Exact local prepared-message counting requires model/server/template fingerprints that are
rechecked before inference dispatch.

## Token-counting profiles

Expose model-aware counting as a reusable capability rather than requiring every consumer to
maintain its own provider and model table.

The API must distinguish:

- synchronous content counting suitable for repeated prompt assembly;
- final prepared-message counting, which may be asynchronous;
- exact model tokenization;
- model-family approximations;
- generic heuristics.

For known local GGUF families, provide a stable model/tokenizer mapping and an offline synchronous
counter where an implementation is available. For a running llama.cpp model, final message
counting must account for its actual chat template; raw `/tokenize` counting of concatenated text
must not be labeled exact prepared-message counting.

Unknown models remain supported. They return an explicit heuristic or unavailable profile rather
than borrowing an unrelated tokenizer under an exact label.

Expose a certified upper bound for text that is bounded in one tokenizer and will later be
consumed by another:

```ts
retokenizationUpperBound(
  sourceTokenBound: number,
  sourceProfile: TokenProfile,
  targetProfile: TokenProfile
): {
  targetTokenUpperBound: number;
  certificate: TokenBoundCertificateRef;
} | undefined;
```

The exact API name and profile handles may vary. The semantic requirement is that every returned
value is a proven conservative upper bound for every text produced by decoding at most
`sourceTokenBound` ordinary generation tokens under the pinned source profile, not a point estimate
for sample text. It does not claim to cover arbitrary input strings merely because a normalizing
source encoder maps them to at most that many tokens: a normalizer may erase or collapse
unbounded input. This decoded-output domain is the startup-sizing case for text that a source model
will generate before a target model consumes it.

The certificate pins the relevant tokenizer/profile revisions and documents its derivation and
provenance. Unsupported profile pairs return unavailable. Heuristic retokenization estimates, if
offered, use a separate API and can never populate a certified bound. Consumers must be able to
distinguish this capability from ordinary `count(text)`, because startup sizing occurs before the
future text exists. Returned values contain structural tokenization bounds only and exclude
consumer/session heuristic safety margins.

Also expose an upper bound for future text known only by Unicode code-point length:

```ts
codePointBoundToTokenUpperBound(
  codePointBound: number,
  targetProfile: TokenProfile
): {
  targetTokenUpperBound: number;
  certificate: TokenBoundCertificateRef;
} | undefined;
```

Every returned value is conservative for all Unicode strings within the code-point bound,
including astral characters, combining sequences, dense scripts, and byte fallback. Unsupported
profiles return unavailable rather than a point estimate. Certificates may be derived and tested
using full tokenizer artifacts during development, but the runtime registry stores only the small
revision-pinned constants and provenance required to apply the proof; supporting a bound does not
require bundling every tokenizer implementation. Returned values exclude consumer/session
heuristic safety margins.

Bound inputs must be nonnegative safe integers. If applying a certificate would overflow a safe
integer or otherwise lose conservativeness, the API returns unavailable or a typed validation
error rather than a rounded number.

## Usage and termination evidence

Response normalization must preserve missing information as missing. It must never turn an absent
provider count into zero.

Replace truthiness-based mappings such as `value || 0` with presence-aware mappings. A real zero
remains zero; an unavailable field remains `undefined`. Derive `total_tokens` only when the inputs
needed for that derivation are available, and identify library estimates explicitly if estimates
are ever added.

Add normalized termination evidence while retaining the raw provider reason:

```ts
interface LLMTermination {
  rawReason: string | null;
  kind: 'stop' | 'limit' | 'content_filter' | 'tool_call' | 'other' | 'unknown';
  limit?: 'output' | 'context' | 'unknown';
}
```

Only report `output` or `context` when the provider supplies enough evidence to distinguish them.
A generic provider `length` result maps to `kind: 'limit', limit: 'unknown'`, not an invented
output or context diagnosis. Preserve the existing normalized `finish_reason` during any API
transition.

Streaming and non-streaming responses expose equivalent final usage and termination evidence.
Partial responses on failure preserve any evidence received before the failure.

Preserve pre-normalization answer evidence. Responses expose `rawContent`, raw-answer accounting,
or both. `rawContent`, when present, is the exact textual sequence that would otherwise be
normalized into `choice.content`, captured before reasoning extraction, tag stripping, whitespace
cleanup, or any other content transformation. If a provider returns ordered typed content parts
whose boundaries or types would be lost by textual concatenation, preserve a JSON-safe ordered
library-owned raw-parts representation as well. Native reasoning remains separately identifiable.
Raw-answer accounting is not a substitute for that content; it reports the pre-normalization token
count together with its tokenizer/profile revision, counting method, evidence source, and whether
native or extracted reasoning tokens are included. This evidence is available in streaming
terminal envelopes and partial failures. Normalized content and provider-reported usage remain
separate fields.

Every event emitted for a physical stream carries one stable attempt ID. A consumed stream emits
exactly one terminal envelope: a completion envelope for success or an error envelope for failure.
Cancellation uses the normal error envelope with `REQUEST_ABORTED`. No delta may be emitted after
terminal completion or cancellation, and late adapter events are suppressed by the library rather
than left for each consumer to interpret. If a consumer abandons iteration, the library performs
best-effort cancellation but cannot promise delivery of a terminal event to that abandoned
consumer.

`streamPrepared()` does not transparently retry a physical stream. A caller may redispatch the
same prepared streaming artifact, creating a new physical stream and attempt ID.

## Capability metadata

Extend model capabilities with facts needed to interpret inspection:

- known context window and its provenance;
- content-token and prepared-message counting availability;
- tokenizer/profile identity;
- structured-output delivery mechanism;
- whether prompt and completion usage are normally reported;
- whether limit termination is distinguishable by the provider.

Capabilities describe known provider/model facts, not guarantees about an individual response.
Per-response fields remain authoritative.

Existing implementations of the exported custom-adapter interface remain source-compatible.
`LLMService` does not currently expose a custom-adapter registration API, and this issue does not
add one. Wherever a legacy adapter is accepted by an existing lower-level extension seam, absence
of the new optional prepared-call/counting capability is reported as unsupported or unavailable
rather than receiving fabricated inspection data. All built-in adapters implement the canonical
prepared-call path.

## Retry boundary

Prepared calls support identical transport retries. The library must not silently create a
content-modified retry after dispatch.

A fallback that changes messages, schema instructions, output limits, or other content produces a
new prepared call visible to the consumer. Provider capability selection performed during initial
preparation is not a retry.

## Acceptance criteria

- [x] Public prepare, inspect, non-streaming dispatch, and streaming dispatch APIs exist.
- [x] Prepared artifacts are immutable, reusable, service-bound, nonserializable, and mode-bound;
      forged, cross-service, and mode-mismatched artifacts are rejected.
- [x] Existing convenience methods use the same preparation and dispatch implementation for every
      built-in adapter; the exported legacy custom-adapter interface remains source-compatible.
- [x] Inspection exposes a stable library-owned view of the exact semantic prepared
      representation passed to the adapter without exposing credentials or SDK objects.
- [x] Schema and system-message transformations are included before inspection.
- [x] Explicit prompt-based structured-output delivery is injected deterministically before
      inspection/counting and is not combined with provider-native schema delivery.
- [x] Prepared calls expose no credentials and are safe for identical transport redispatch.
- [x] Inspection reports count method, tokenizer/profile identity, uncertainty, certified bounds,
      output-limit provenance, and output-limit counting semantics.
- [x] Inspection distinctly represents exact/model/heuristic prompt counts, certified
      prompt-token upper bounds, and unavailable accounting.
- [x] Certified prompt, code-point, and retokenization bounds contain structural allowances only;
      no consumer/session heuristic margin is baked into a bound or subtracted from capacity.
- [x] Capacity guidance applies `heuristicMargin` exactly once and keeps any explicit
      `countingSlack` separate; exact profiles use a zero heuristic margin.
- [x] A numeric regression test uses `rawCapacity = 1000`, `heuristicMargin = 100`,
      `promptTokenUpperBound = 700`, `outputBound = 150`, and `countingSlack = 25`: the correct
      comparison is `875 <= 900`; an implementation that also adds the margin to the prompt side
      produces `975 <= 900` and fails the test.
- [x] A requested output maximum is reported as the actual enforced value after filtering and
      clamping; a dropped/unprovable setting remains absent.
- [x] Prepared calls expose required model/adapter/request-shape bindings and every observable
      endpoint/template/profile/server-state binding used during preparation.
- [x] Dispatch revalidates every available and locally observable binding before the inference
      request and rejects detected staleness.
- [x] Exact local prepared-message counting includes the active chat template.
- [x] Unknown models report heuristic or unavailable counting honestly.
- [x] Cross-tokenizer upper-bound APIs return revision-pinned proof certificates, remain separate
      from point estimates, and report unsupported pairs as unavailable.
- [x] Retokenization certificates cover text decoded from the declared source-token bound and do
      not overclaim coverage for arbitrary strings collapsed by source normalization.
- [x] Documented derivations establish each certified bound; property and adversarial tests over
      representative exact/model pairs validate the implementations and find no counterexample.
- [x] Code-point-to-token upper bounds cover ASCII, dense scripts, astral Unicode, combining
      sequences, and byte fallback using revision-pinned certificates; unsupported profiles remain
      unavailable.
- [x] Certified-bound APIs reject invalid bounds and never return an unsafe rounded value after
      numeric overflow.
- [x] Missing Gemini and Mistral usage fields remain absent rather than becoming zero.
- [x] Real zero usage values remain zero.
- [x] Raw and normalized termination evidence is available.
- [x] Ambiguous `length` termination remains explicitly ambiguous.
- [x] Streaming and non-streaming final envelopes have equivalent accounting semantics.
- [x] Every emitted stream event exposes its stable physical attempt ID; a consumed stream emits
      exactly one completion/error terminal envelope and no post-terminal or post-cancellation
      delta.
- [x] Streaming cancellation terminates with `REQUEST_ABORTED`; abandoned iteration triggers
      best-effort cancellation, and stream dispatch does not transparently retry.
- [x] Partial failures preserve available usage and termination evidence.
- [x] Lossless pre-normalization content and/or explicitly sourced raw-answer token accounting
      survives reasoning extraction, cleanup, streaming, and partial failure.
- [x] No content-modifying retry is hidden inside dispatch.
- [x] Legacy custom-adapter implementations remain source-compatible and absent optional
      prepared/counting capabilities report unsupported explicitly; built-ins use the canonical
      prepared path.
- [x] Tests cover every provider adapter, missing and partial usage, exact zero values, streaming,
      structured-output delivery, ambiguous limits, and prepared-call redispatch.
- [x] User documentation and TypeScript API references describe the new contract.

## Non-goals

This issue does not define application-specific prompt budgets, request classes, routing,
admission policy, brevity instructions, summary splitting, or content-retry decisions.

## Resolution

Resolved on 2026-07-29 for v0.15.0. The implementation adds service-owned,
credential-free prepared calls; immutable semantic inspection; identical
prepared redispatch; exact active-template llama.cpp counting with coherent
state binding; hash-verified token profiles and structural certificates;
truthful raw, usage, and termination evidence; and a single-terminal streaming
lifecycle.

Certified bounds exclude consumer/session margins. The numeric regression locks
the application-side formula to `875 <= 900` and proves that charging the
margin twice would incorrectly produce `975 <= 900`.

Verification completed with 43 unit suites / 1,019 tests, a strict TypeScript
build, production dependency audit, dry-run package inspection, packed-consumer
typecheck, root-export/lazy-tokenizer check, and a live llama.cpp exact-count
E2E against the running Gemma server.
