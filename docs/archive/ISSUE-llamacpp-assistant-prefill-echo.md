# llama.cpp responses echo trailing assistant prefills into normalized content

Created: 2026-08-12
Status: RESOLVED — 2026-08-13 (v0.17.3)
Package: genai-lite (v0.17.2 at filing)

## Summary

When a llama.cpp chat-completion request ends with an `assistant` message used as a
prefill, llama-server can return the whole assistant turn in `choice.message.content`:
the supplied prefill followed by the newly generated continuation. The
`LlamaCppClientAdapter` currently exposes that combined string as normalized message
content.

This violates the useful consumer-level meaning of `message.content`: text generated
by this completion. It also disagrees with the response's own completion usage and
logprob evidence, which cover only the new tokens. Consumers that parse, display, or
chain the normalized content therefore receive prompt text as though the model had
generated it.

The llama.cpp adapter should remove one exact echoed copy of a nonempty trailing
assistant prefill from normalized content when present. It should retain the provider's
unaltered string in `rawContent` and `rawContentParts`, and leave provider usage,
termination evidence, and logprobs unchanged.

## Observed behavior

The issue is reproducible with genai-lite 0.17.2 against llama.cpp b9860 using Gemma 4
GGUF models. It affects both one-token constrained reads and free-generated reasoning
lines when they use an assistant prefill.

For a request whose final message is:

```json
{"role":"assistant","content":"1:"}
```

and whose completion generates one token, `" no"`, llama-server returns a choice with
the following internally inconsistent-looking fields:

```json
{
  "message": {
    "role": "assistant",
    "content": "1: no"
  },
  "logprobs": {
    "content": [
      {
        "token": " no",
        "logprob": -0.8,
        "top_logprobs": [
          {"token": " unlikely", "logprob": -0.4},
          {"token": " no", "logprob": -0.8}
        ]
      }
    ]
  }
}
```

The associated usage reports `completion_tokens: 1`. The logprob entry correctly says
that the sampled token was `" no"`; only `message.content` includes the supplied `"1:"`
prefix. The normalized genai-lite response currently preserves `"1: no"` in both
`message.content` and `rawContent`.

The same behavior applies to accumulated multiline prefills. If the request ends with:

```text
1: yes
2:
```

and the new token is `" no"`, the server can return:

```text
1: yes
2: no
```

rather than only the continuation `" no"`.

This is not an isolated response. A scan of 410 parseable physical calls from stored
local traces found an exact prefill echo in all 410:

| Physical call | Count | Exact prefill echo |
|---|---:|---:|
| Constrained answer reads | 398 | 398 |
| Free-generated reasoning lines | 6 | 6 |
| Constrained answers after reasoning | 6 | 6 |

Six constrained reads in that corpus sampled a token different from the top-logprob
argmax. Examples included `no` versus `unlikely` and `cooled` versus `warm`. A separate
acceptance run recorded 28 reasoning responses beginning `1:1:`, caused by treating the
echoed `1:` as new continuation text and prepending the expected line number again.

## Minimal reproduction

This wire-level request captures the behavior without depending on a particular
consumer. Use a llama-server build and chat template that support trailing assistant
prefill, with thinking disabled.

```json
POST /v1/chat/completions
{
  "model": "default",
  "messages": [
    {"role": "user", "content": "Choose yes or no."},
    {"role": "assistant", "content": "1:"}
  ],
  "max_tokens": 1,
  "logprobs": true,
  "top_logprobs": 2,
  "chat_template_kwargs": {"enable_thinking": false},
  "grammar": "root ::= \" \"? answer\nanswer ::= \"yes\" | \"no\"\n"
}
```

A response exhibiting the bug has this shape:

```json
{
  "choices": [
    {
      "message": {"role": "assistant", "content": "1: yes"},
      "finish_reason": "length",
      "logprobs": {
        "content": [
          {
            "token": " yes",
            "logprob": -0.01,
            "top_logprobs": [
              {"token": " yes", "logprob": -0.01},
              {"token": " no", "logprob": -4.2}
            ]
          }
        ]
      }
    }
  ],
  "usage": {
    "completion_tokens": 1
  }
}
```

After adapter normalization, the same response should expose:

```ts
choice.message.content === " yes"; // newly generated continuation
choice.rawContent === "1: yes";    // exact provider text before normalization
choice.logprobs[0].token === " yes";
response.usage.completion_tokens === 1;
```

The exact token and probabilities vary with sampling. The invariant is that
`rawContent` begins with the exact final assistant-message content, while the provider's
token and usage evidence describe only what follows it.

## Impact

The echo corrupts consumers in several distinct ways. The one-token case can appear
harmless when the sampled token is also the probability distribution's argmax, which is
why the defect can survive ordinary deterministic tests.

**Sample identity and trace accuracy:** A consumer resolving the sampled answer from
`message.content` sees `"1: no"` rather than `" no"`. If its off-vocabulary fallback uses
the highest-probability label, the recorded hard label describes the argmax instead of
the token actually sampled. Debug text and any label-to-value mapping derived from that
hard label are then wrong even when the full probability vector remains correct.

**Chained completions:** Stepwise consumers commonly append each resolved answer to the
assistant prefill before asking for the next item. A misread sampled label means later
items are conditioned on the argmax answer rather than the answer the model emitted.
This can change later probability vectors and final results; it is not merely a logging
defect.

**Reasoning-line parsing:** A caller that expects the continuation of `"1:"` and
reconstructs the line as `"1:" + content` obtains `"1:1: ..."`. In a multi-item batch,
an echoed multiline prefill can also make a first-line parser select an earlier completed
line instead of the newly generated one.

**Answer-bound accounting:** The provider may report one completion token while
`message.content` contains the complete, potentially multiline prefill plus that token.
A caller that counts normalized content instead of using provider-output accounting can
mistake a successful bounded read for an output overrun. Keeping the echo in
`rawContent` is still correct under genai-lite's documented raw-evidence contract, but
the public normalized content should not carry it.

**Visible output and streaming:** Any ordinary consumer of `message.content` may display
the prefill twice. The streaming path requires a separate audit because final streamed
responses pass through `createSuccessResponse()`, while public `content_delta` events are
emitted earlier from raw llama.cpp deltas. Fixing only the final response could leave
live output duplicated even though the terminal object is correct.

## Contract and ownership

This belongs in `LlamaCppClientAdapter`, the boundary that translates llama.cpp's
OpenAI-compatible response into genai-lite's provider-normalized response. The adapter
already removes template-injected no-thinking prefixes and extracts reasoning markers
while retaining `rawContent` as the exact pre-normalization string. Assistant-prefill
echo removal is the same class of provider-specific normalization.

A consumer-side workaround would have to know that the selected provider is llama.cpp,
retain the exact outbound trailing message, implement build-sensitive stripping, and do
so independently for complete responses, streams, and partial failures. It would also
leave the unified `LLMService` contract provider-dependent. The adapter has all required
information and is already responsible for this normalization layer.

Relevant code is concentrated in:

- `src/llm/clients/LlamaCppClientAdapter.ts`
  - `prepareCompletionRequest()` builds the exact outbound messages.
  - `prepareCompletionParams()` is the authoritative point at which prompt-delivered
    structured-output rewriting and llama.cpp message formatting have already produced
    the final outbound message list. Capture the trailing assistant prefill there.
  - `LlamaCppPreparedProviderRequest` is constructed by explicitly enumerating semantic
    fields. A captured prefill must therefore be copied into it explicitly; adding the
    field only to `LlamaCppSemanticRequest` will not propagate it to `sendPrepared()` or
    `streamPrepared()`.
  - `createSuccessResponse()` currently normalizes the no-thinking prefix and reasoning
    markers but leaves an assistant prefill echo intact.
  - `streamCompletion()` exposes live content deltas before terminal normalization.
  - `filterLiveNothinkPrefixDelta()` is the existing incremental-prefix buffering pattern.
  - `createSyntheticCompletion()` feeds accumulated stream text back through
    `createSuccessResponse()` for terminal and partial responses.
- `src/llm/clients/LlamaCppClientAdapter.test.ts` contains the adjacent reasoning,
  assistant-prefill, grammar/logprob, and streaming tests.
- `src/llm/clients/LlamaCppPrepared.test.ts` contains the real adapter's prepared-state
  coverage and is the natural place to verify that captured prefill state survives
  canonical preparation.
- `src/llm/LLMService.ts` consumes adapter-only raw evidence separately from public stream
  events and merges adapter partial responses. Prepared-flow tests should exercise this
  public path with the real llama.cpp adapter and mocked server/transport boundaries.

No public type or request-shape change is required.

## Recommended implementation

Normalize the provider response against the exact nonempty content of the final
formatted outbound assistant message. Capture this value only after any
prompt-delivered structured-output rewrite and llama.cpp message formatting have
produced the message list sent to the provider. The rule must be deliberately narrow:

1. Capture the raw provider content unchanged.
2. Apply the existing template-injected no-thinking-prefix cleanup.
3. If the exact outbound message list ends with an `assistant` message whose content is
   nonempty, and the cleaned response starts with that content, remove one copy.
4. Continue the existing reasoning-marker extraction on the resulting normalized text.
5. Preserve `rawContent`, `rawContentParts`, logprobs, usage, answer accounting, finish
   reason, and termination evidence exactly as before.

Once the authoritative value has been captured during preparation, equivalent
non-streaming stripping logic is:

```ts
function stripEchoedAssistantPrefill(
  content: string,
  assistantPrefill?: string
): string {
  if (
    !assistantPrefill ||
    !content.startsWith(assistantPrefill)
  ) {
    return content;
  }
  return content.slice(assistantPrefill.length);
}
```

Retain the trailing assistant prefill as an internal semantic field while preparing the
request instead of reconstructing it later from the original consumer request. Propagate
that field through both legacy and prepared dispatch. In particular, copy it explicitly
into `LlamaCppPreparedProviderRequest` when constructing the frozen provider request so
`sendPrepared()` and `streamPrepared()` receive the same authoritative value.

Perform an exact, case-sensitive, one-time prefix match. Do not trim either side, parse
line numbers, search for the prefill later in the string, use a case-insensitive
comparison, or repeatedly strip matching text. These broader heuristics can delete real
model output.

The exact-prefix guard keeps compatibility with llama.cpp builds or chat templates that
already return continuation-only content: when the raw response does not begin with the
prefill, normalization is a no-op. There is an unavoidable theoretical ambiguity if a
continuation-only server happens to generate text beginning with the entire prefill.
Avoid widening the heuristic; if the implementer finds reliable response metadata that
distinguishes the two server modes, prefer that evidence over guessing from prose.

For streaming, use one per-choice state machine with the ordered phases:

```text
nothinkPrefix -> assistantPrefill -> passthrough
```

Buffer only enough initial raw content to decide each phase. If a buffered candidate
diverges from the no-thinking prefix, reconsider the same buffered text as the possible
beginning of the assistant prefill before emitting it. Two independent filters can
prematurely flush text that the next phase still needs to inspect.

Raw evidence must be recorded and emitted before any buffering or normalization so it
retains every provider byte. The accumulated provider content used to build synthetic
terminal responses must likewise remain raw. Only public `content_delta` visibility is
filtered.

Finalize the same state machine on both normal stream termination and stream failure.
Finalization must first advance through any remaining viable phases; after that, any
still-unresolved partial candidate fails open and is emitted as a public content delta.
It must also appear in `error.partialResponse`. Suppressing such text would discard
provider output without having proved that it was an echo. This rule keeps public deltas
and partial normalized content aligned while preserving the exact provider bytes in raw
evidence.

For responses whose only content normalization is this leading no-thinking/assistant-
prefill pipeline, the concatenation of public `content_delta` events must equal the
terminal `complete.response` content or the final `error.partialResponse` content.
Complete-response prefill stripping runs before the existing reasoning-marker
extraction and must not change that behavior. Incremental reasoning-marker extraction is
explicitly out of scope; fallback marker streams can already differ between live deltas
and terminal normalized content independently of this issue.

## Required test coverage

Tests should exercise response semantics, evidence preservation, build compatibility,
and chunk boundaries. Mocked adapter tests are sufficient for the unit layer; one live
llama-server check should confirm the real wire behavior after the fix.

**Complete responses:**

- A trailing assistant prefill `"1:"` plus raw content `"1: yes"` normalizes to
  `" yes"`.
- A multiline prefill `"1: yes\n2:"` plus raw content `"1: yes\n2: no"` normalizes
  to `" no"`.
- A free-generated reasoning response strips the prefill without adding or removing
  whitespace from the continuation.
- A response that does not start with the prefill remains byte-identical.
- A request with no trailing assistant message remains unchanged.
- An empty trailing assistant message remains unchanged.
- Raw content equal to the prefill normalizes to an empty string.
- Exactly one prefill copy is removed.
- The no-thinking prefix and assistant-prefill echo both normalize in the intended order.
- Multiple returned choices, if supported on this path, normalize independently against
  the same outbound prefill.

**Evidence and accounting:**

- `rawContent` and text `rawContentParts` retain the exact echoed provider string.
- `message.content` contains only the continuation.
- Per-token logprobs, including the sampled `token` and `topLogprobs`, are unchanged.
- A regression case makes the sampled token differ from the highest-probability
  alternative and simultaneously verifies that `message.content` is exactly the sampled
  continuation, `rawContent` is exactly the echoed prefill plus that continuation, and
  the sampled-token and top-logprob evidence are unchanged.
- Provider usage and `answerAccounting.providerOutput` are unchanged.
- Existing raw-content accounting continues to describe `rawContent`, not the cleaned
  message.
- Finish reason and normalized termination evidence are unchanged.

**Streaming and failures:**

- An echoed prefill contained in one content chunk is suppressed from public deltas.
- An echoed prefill split at every relevant chunk boundary is suppressed without losing
  continuation text.
- A non-echoing stream whose opening text diverges partway through the candidate prefix
  flushes every buffered character in order.
- Streaming no-thinking-prefix cleanup and prefill cleanup compose when both prefixes
  are chunked.
- A no-thinking-prefix candidate that diverges is reconsidered as a possible assistant
  prefill before any buffered text is emitted.
- Normal stream termination and a mid-stream failure both fail open for any unresolved
  partial candidate after all remaining phases have been considered.
- For streams whose only content normalization is the leading prefix pipeline, the
  concatenated public `content_delta` text equals terminal
  `complete.response.choices[0].message.content`.
- Under the same scope, `error.partialResponse` uses the same normalized content after a
  mid-stream failure, while its raw evidence remains intact.

**Prepared paths:**

- Canonical preparation captures the prefill from the final formatted outbound messages
  and explicitly retains it in `LlamaCppPreparedProviderRequest`.
- At least one complete and one streaming test enter through the public `LLMService`
  prepared flow using the real `LlamaCppClientAdapter` with mocked llama.cpp state and
  OpenAI transport boundaries. These tests must verify capture, propagation, and final
  normalization rather than exercising only a private normalizer or generic fake
  adapter.

**Live check:**

- Against a current llama-server build with thinking disabled, send a one-token,
  grammar-constrained assistant-prefill request and verify that genai-lite returns only
  the sampled continuation in `message.content` while preserving the full echoed server
  string in `rawContent`.
- Repeat with a multiline prefill or a second step so the implementation is verified
  against the accumulated-prefix case, not only `"1:"`.

## Acceptance criteria

This issue is complete when normalized llama.cpp responses consistently expose generated
continuation without weakening the library's raw-evidence contract.

- [x] A nonempty trailing assistant prefill is removed once from normalized llama.cpp
  response content when, and only when, the provider content starts with that exact
  prefill under the adopted detection rule.
- [x] `rawContent`, `rawContentParts`, logprobs, usage, answer accounting, and termination
  evidence remain faithful to the provider response.
- [x] Continuation-only responses from builds or templates that do not echo the prefill
  remain unchanged.
- [x] Multiline accumulated prefills normalize correctly.
- [x] Free-generated reasoning lines and constrained answer-token reads both normalize
  correctly.
- [x] Streaming public deltas, terminal responses, and partial error responses agree on
  normalized content when the leading no-thinking/assistant-prefill pipeline is the only
  content normalization; raw streaming evidence remains lossless.
- [x] Unresolved partial prefix candidates fail open on normal termination and stream
  failure after all remaining prefix phases have been considered.
- [x] Complete-response prefill stripping composes with existing no-thinking-prefix and
  reasoning-marker normalization without changing marker extraction behavior.
- [x] The authoritative prefill is captured from the final formatted outbound messages
  and explicitly propagated through `LlamaCppPreparedProviderRequest`.
- [x] A sampled-token-versus-argmax regression proves that normalized content follows
  the sampled continuation while raw text and logprob evidence remain exact.
- [x] Real-adapter tests cover complete and streaming dispatch through the public
  `LLMService` prepared flow.
- [x] Focused unit tests cover the complete-response, evidence, streaming, and partial
  failure cases above.
- [x] A live llama-server check verifies one-token and accumulated-prefix behavior.
- [x] `npm test`, `npm run build`, `npm audit --omit=dev --audit-level=high`, and
  `npm pack --dry-run` pass.

## Non-goals

The fix should stay limited to normalizing llama.cpp responses that use assistant
prefill. It does not require changes to sampling, logprob extraction, grammars,
structured-output delivery, reasoning policy, or the existing rejection of assistant
prefill while thinking is enabled.

Changing llama-server itself is also not required. Even if a future server build returns
continuation-only content, genai-lite still needs the guarded normalization for supported
builds that echo the assistant turn. No response parser should infer semantic labels or
line structure as part of this adapter fix.

Incremental extraction of fallback reasoning markers from public streaming deltas is
also out of scope. The adapter's existing terminal reasoning-marker extraction remains
unchanged; this issue only requires the leading no-thinking/assistant-prefill pipeline
to be internally consistent across complete, streaming, and partial responses.

## Resolution

Resolved on 2026-08-13 for v0.17.3. `LlamaCppClientAdapter` now captures the
exact nonempty trailing assistant prefill from the final formatted outbound
messages and explicitly carries it through both legacy and prepared dispatch.
Complete responses remove one exact echoed copy after no-thinking-prefix
cleanup and before the existing reasoning-marker extraction. Streaming uses a
single ordered `nothinkPrefix → assistantPrefill → passthrough` state machine,
reconsiders failed candidates between phases, and fails open on both normal
termination and errors. Raw content and parts, usage, sampled-token logprobs,
answer accounting, finish reasons, and termination evidence remain unchanged.

Verification passed 50 Jest suites (1,156 tests), the TypeScript build, the
packed-consumer API/Rollup checks, package dry-run for `genai-lite@0.17.3`,
the production high-severity audit with zero vulnerabilities, and `git diff
--check`. Two focused live checks passed against llama.cpp b9860 with Gemma 4:
one-token and accumulated multiline prefills both normalized to the sampled
continuation while retaining the full provider echo as raw evidence. A final
systematic diagnostic verified complete/streaming equivalence across 46,660
prefix, raw-content, and chunk-partition combinations. GitHub publication and
npm publication were not yet performed when this record was archived.
