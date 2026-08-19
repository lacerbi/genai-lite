# Constrained Answer Labels

Use a single-position constrained completion when an LLM must choose exactly one label and you
need probability evidence for that choice. genai-lite provides these root exports for this workflow:

- `generateAnswerTokenGrammar(labels)` creates a llama.cpp-compatible GBNF grammar.
- `extractSingleTokenLabelProbs(labels, tokenLogprob, options?)` interprets one normalized
  `TokenLogprob` position.
- `resolveLabelProbsWithSuffixWalk` / `resolveLabelProbsWithSuffixWalkAsync` optionally resolve a
  shared-prefix position through caller-owned follow-up requests, as a documented approximation.
- `generateSuffixGrammar(suffixes)` builds the grammar for one such follow-up position.

Extraction itself is **single-position**. The grammar constrains character sequences; it does not
guarantee that a label is one tokenizer token. A request using `maxTokens: 1` therefore requires
labels known to fit one output token for the selected model. The library never issues requests: the
optional suffix walk in [Resolving Shared Prefixes](#resolving-shared-prefixes-suffix-walk) builds
each follow-up request but leaves dispatch to the caller.

## Basic Workflow

```typescript
import {
  LLMService,
  extractSingleTokenLabelProbs,
  generateAnswerTokenGrammar,
} from 'genai-lite';

const labels = ['yes', 'no'] as const;
const grammar = generateAnswerTokenGrammar(labels);
const service = new LLMService(async () => 'not-needed');

const response = await service.sendMessage({
  providerId: 'llamacpp',
  modelId: 'local-model',
  messages: [{ role: 'user', content: 'Is water wet? Answer yes or no.' }],
  settings: {
    maxTokens: 1,
    temperature: 0,
    reasoning: { enabled: false },
    logprobs: true,
    topLogprobs: 5,
    llamacpp: { grammar },
  },
});

if (response.object === 'chat.completion') {
  const evidence = response.choices[0].logprobs?.[0];
  const result = extractSingleTokenLabelProbs(labels, evidence);

  if (result.status === 'ok') {
    console.log(result.absoluteLabelProbs);
    console.log(result.conditionalLabelProbs);
  } else {
    console.warn(result.status, result.residualMass, result.ambiguousMass);
  }
}
```

The generated grammar accepts exactly one listed label, optionally preceded by one ASCII space.
It does not accept a trailing newline. Masking a token such as `"yes\n"` is preferable to
accepting it and then losing its mass during label matching.

## Probability Spaces

`absoluteLabelProbs[label]` is the visible probability mass attributed to that label.
`conditionalLabelProbs[label]` renormalizes only over recognized labels and therefore sums to
one when any label mass is recognized. These fields are deliberately separate: a conditional
probability is not an absolute probability.

For example, visible evidence of `yes: 0.6`, `no: 0.3`, and unrelated tokens totaling `0.1`
produces absolute probabilities `{ yes: 0.6, no: 0.3 }`, conditional probabilities near
`{ yes: 0.667, no: 0.333 }`, and `residualMass: 0.1`.

- `ambiguousMass` is visible mass that matches a shared, unresolved prefix of multiple labels.
- `residualMass` is mass not attributed to a supplied label, including unreturned distribution
  mass.

### Evidence Precondition

Absolute label probabilities and residual mass are meaningful only when incoming logprobs are
natural-log probabilities normalized over the provider's complete effective candidate
distribution after its sampling constraints, but before the response is truncated to top N.
The extractor cannot detect a provider or route that renormalizes only the returned top-N list.
When this precondition is uncertain, treat `conditionalLabelProbs` as relative evidence among
recognized labels and do not present the absolute/residual fields as calibrated probabilities.

## Status Handling

Always branch on `status`:

| Status | Meaning |
|---|---|
| `ok` | Usable one-position label evidence was recovered. |
| `ambiguous_prefix` | Too much visible mass ended on a prefix shared by multiple labels. |
| `missing_alternatives` | No non-empty `topLogprobs` list was available. |
| `no_matching_tokens` | Valid visible evidence existed, but none matched a label path. |
| `invalid_evidence` | Evidence contained materially invalid probabilities or impossible mass. |

`missing_alternatives`, `no_matching_tokens`, and `invalid_evidence` return zero-valued label
records and `residualMass: 1`; they do not fabricate a uniform label distribution.
`ambiguous_prefix` instead preserves the observed label, ambiguous, and residual masses so the
caller can diagnose the unresolved branch, or resolve it with
[a suffix walk](#resolving-shared-prefixes-suffix-walk). `rawTokenLogprob`, when present, is a
defensive snapshot for diagnostics; the suffix-walk resolvers require it only when the result they
are given is itself `ambiguous_prefix`.

The default ambiguity threshold requires aggregate ambiguous prefix mass to be at least five
nats below the best aggregate resolved-label mass before it is tolerated. Override it with
`{ ambiguityLogprobGap }` only when the caller owns the calibration policy.

## Label Rules

Labels must be non-empty, unique, valid Unicode strings without leading/trailing whitespace,
control characters, or line separators. A complete label may not be a strict prefix of another:
`['no', 'nobody']` is rejected, while `['answer_one', 'answer_two']` is valid.

Strict-prefix rejection is necessary for sound one-position attribution. Without it, a terminal
trie node could also have children: one extraction path would double-count the same token mass,
while another would silently give all mass to the shorter label.

The implementation aggregates duplicate decoded token strings with log-sum-exp, includes the
sampled token when providers omit it from alternatives, tolerates only tiny positive floating
point drift, and uses map-safe internals for labels such as `__proto__` and `constructor`.

## Streaming

genai-lite keeps logprobs on the terminal `complete` response. It does not emit public
`logprob_delta` events. Extract evidence from `event.response.choices[0].logprobs` after receiving
the terminal event.

## Provider Notes

- **llama.cpp:** static capability metadata is `supported`. Its server source serializes
  `logprob` as `log(probability)` in the default mode. Use the generated grammar, one output token,
  disabled reasoning, and a sufficiently large `topLogprobs` value. See the
  [llama.cpp server source](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-task.cpp).
- **OpenAI:** request/response transport is available, but static capability metadata remains
  `unknown` because support is model-dependent. OpenAI documents token log probabilities and
  top alternatives for supported chat models; verify the selected model before relying on them.
- **OpenRouter:** transport is pass-through and support depends on the selected route, model, and
  upstream provider. Static capability metadata remains `unknown`. Its API documents the request
  fields but also notes that provider parameter support varies; do not assume a route preserves
  the full-distribution normalization precondition. See the
  [OpenRouter Chat Completion API reference](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion).
- **Anthropic, Gemini, and Mistral:** static metadata is `unsupported` for the normalized
  `choice.logprobs` contract. Existing unsupported-parameter filtering remains in effect.

Capability metadata describes known transport/model support; it does not prove probability
calibration or the full-distribution evidence precondition.

## Resolving Shared Prefixes (Suffix Walk)

`ambiguous_prefix` means visible mass stopped on a prefix that several labels still share, so the
position alone cannot say which label it belongs to. Rather than discarding that position, you can
resolve it by asking the model for further constrained positions — at least one per unresolved
branch, and more when a continuation lands on a shared prefix of its own:

- `resolveLabelProbsWithSuffixWalk(labels, initial, fetcher, options?)`
- `resolveLabelProbsWithSuffixWalkAsync(labels, initial, fetcher, options?)`
- `generateSuffixGrammar(suffixes)` builds the grammar for a continuation position.

### This Is an Approximation

Suffix-walk products are **decoded-text-state approximations with no numerical error bound**, not
the model's exact original continuation probabilities. Two distinct reasons:

- **Retokenization.** You reissue a request whose assistant text ends with a decoded prefix such as
  `" answer"`. The provider tokenizes that text afresh, and the resulting token boundaries need not
  match the hidden token path that produced the original position. Multiplying the first-position
  mass by probabilities from the reissued request is therefore not the exact probability of the
  original continuation.
- **Collapsed token identity.** `TokenLogprob` carries decoded strings, not token IDs. Distinct
  hidden token histories that decode to the same string are combined, and the walk tracks decoded
  text state rather than token state.

The library exposes this openly: `resolution` tells you whether suffix fetching happened at all —
it says fetching *occurred*, not that it succeeded, so a walk whose only response was rejected still
reports `suffix_walk` — and every mass field remains visible so you can see how much was resolved
this way. If your
calibration requirements cannot tolerate an unbounded approximation, keep the single-position result
and treat `ambiguousMass` as unresolved.

The library never dispatches. It builds the request; you make the call.

### Normal Flow

```typescript
import {
  extractSingleTokenLabelProbs,
  generateAnswerTokenGrammar,
  resolveLabelProbsWithSuffixWalkAsync,
} from 'genai-lite';
import type { SuffixWalkFetchRequest } from 'genai-lite';

const labels = ['answer_one', 'answer_two'];
const question = 'Which answer applies?';
// The assistant text already committed before the constrained position, if any.
const answerPrefill = '';

// Position 0, exactly as in the Basic Workflow but with this label set.
const first = await service.sendMessage({
  providerId: 'llamacpp',
  modelId: 'local-model',
  messages: [{ role: 'user', content: question }],
  settings: {
    maxTokens: 1,
    temperature: 0,
    reasoning: { enabled: false },
    logprobs: true,
    topLogprobs: 5,
    llamacpp: { grammar: generateAnswerTokenGrammar(labels) },
  },
});
const evidence =
  first.object === 'chat.completion' ? first.choices[0].logprobs?.[0] : undefined;
const initial = extractSingleTokenLabelProbs(labels, evidence);

const resolved = await resolveLabelProbsWithSuffixWalkAsync(
  labels,
  initial,
  async (request: SuffixWalkFetchRequest) => {
    // `request.prefix` is the exact decoded answer text already attributed to
    // this branch. Reissue it verbatim as assistant prefill, then constrain the
    // new position with `request.grammar`.
    const response = await service.sendMessage({
      providerId: 'llamacpp',
      modelId: 'local-model',
      messages: [
        { role: 'user', content: question },
        { role: 'assistant', content: answerPrefill + request.prefix },
      ],
      settings: {
        maxTokens: 1,
        temperature: 0,
        reasoning: { enabled: false },
        logprobs: true,
        topLogprobs: 5,
        llamacpp: { grammar: request.grammar },
      },
    });

    return response.object === 'chat.completion'
      ? response.choices[0].logprobs?.[0]
      : undefined;
  },
  { maxFetches: 8 }
);
```

`request.suffixes` lists the label fragments still reachable after `request.prefix`; the grammar
accepts exactly one of them. You may inspect `suffixes` (for logging, or to build a provider request
by hand), but you do not have to: the grammar is already generated from them.

The fetcher must return evidence for **one** position, under the same full-distribution precondition
as position 0. Returning `undefined` is a clean way to say "no evidence available"; it stops the walk
without discarding anything already resolved.

### What the Resolver Does With `initial`

| Supplied `status` | Behavior |
|---|---|
| anything except `ambiguous_prefix` | Trusted typed pass-through. |
| `ambiguous_prefix` | Recomputed from `rawTokenLogprob`, then walked. |

A pass-through result is deep-copied and returned with `resolution: "single_position"`,
`termination: "not_started"`, `fetchCount: 0`, and no fetcher call. An `ambiguous_prefix` input is
re-interpreted from its `rawTokenLogprob` snapshot under the labels and options you pass now;
position 0 is never re-fetched.

The pass-through path is deliberately *not* runtime certification. Non-ambiguous public fields are
copied as supplied; they are not reconciled against `labels` or `options`. Pass the result you
actually got from `extractSingleTokenLabelProbs`.

For an `ambiguous_prefix` input the reverse holds: its public fields are ignored and recomputed from
`rawTokenLogprob`. Because that recomputation uses your current options, changing
`ambiguityLogprobGap` can make the position non-ambiguous, in which case the recomputed result is
returned with zero fetches. An `ambiguous_prefix` result **without** `rawTokenLogprob` throws
`TypeError` before any fetch — there is nothing left to reconstruct the branch from.

### Three Independent Axes

| Field | Question it answers |
|---|---|
| `status` | Is the probability evidence usable? (`ok`, `ambiguous_prefix`, …) |
| `resolution` | Did suffix fetching happen at all? (`single_position`, `suffix_walk`) |
| `termination` | Why did the walk stop? (`not_started`, `complete`, `budget_exhausted`, …) |

They do not imply one another. A result can be `status: "ok"` — the remaining ambiguous mass is
negligible under the gap policy — while `termination` records `budget_exhausted`. Conversely
`termination: "complete"` means no visible frontier remains, not that all mass became label mass:
off-label or truncated suffix mass still lands in `residualMass`.

`fetchCount` reports **completed** fetcher invocations: `0` on the pass-through path, incremented for
a call whose evidence was rejected, and never above `maxFetches`. A fetcher that throws or rejects
produces no result at all, so a failed request you were nevertheless billed for is not counted
anywhere — track those on your side.

### Cost and Ordering

`maxFetches` is a global budget across all branches, not per branch. It must be a finite positive
integer and defaults to **8**.

Frontier branches are processed **sequentially**, highest remaining mass first, with equal masses
broken by discovery order. Reprioritization happens after every committed response, so a branch
discovered mid-walk competes fairly with the ones already queued. The consequence to plan for is
latency: a default walk can serialize up to eight follow-up round trips. Lower `maxFetches` when
that tail matters; the walk then stops with `termination: "budget_exhausted"` and leaves the
unprocessed branches' mass in `ambiguousMass`.

Bare and space-prefixed paths are kept apart on purpose. `"answer"` and `" answer"` decode to
different text, so they are reissued as different prefixes and only recombine when their mass lands
on the same label. Branches merge only when both the exact decoded prefix and the trie position
match, and only while both are still queued.

When position 0's decoded token is empty, the single request carries `prefix: ""` and offers both
form families, e.g. `["answer_one", "answer_two", " answer_one", " answer_two"]`.

### Failure Handling

Two different things can go wrong, and they are handled differently on purpose:

- **Unusable returned evidence** — `undefined`, no or empty `topLogprobs`, no valid entries after
  filtering, materially overfull mass, or nothing that advances at least one character of a
  remaining suffix. That fetch is discarded whole, the walk stops with
  `termination: "fetch_rejected"`, mass resolved by earlier fetches stays resolved, and the current
  plus queued branches stay in `ambiguousMass`. Individually malformed alternatives are still just
  filtered, exactly as at position 0, as long as valid advancing entries remain.
- **An operational failure in your fetcher** — a thrown error or a rejected promise propagates
  unchanged. Retries, backoff, and provider error handling stay yours; the library never converts an
  outage into probability mass.

### Mass After Walking

`absoluteLabelProbs` holds position-0 mass plus suffix-resolved mass, `conditionalLabelProbs`
renormalizes over attributed labels only, `ambiguousMass` holds every still-unresolved branch, and
`residualMass` holds position-0 residual plus suffix-level unrecognized or truncated mass. The three
still sum to one within the library's epsilon after complete, partial, budget-exhausted, and
rejected walks. The ambiguity-gap policy is reapplied to these final aggregates.

`rawTokenLogprob` remains the position-0 diagnostic snapshot. The result deliberately does not carry
a transcript of suffix evidence.

One consequence is worth stating plainly: **do not resume a walk by passing its own result back in.**
A `budget_exhausted` result is still typed as an extraction and will be accepted, but with no
transcript to resume from it would be recomputed from the position-0 snapshot — discarding the mass
the first walk resolved and restarting `fetchCount` at `0`. Raise `maxFetches` and walk once instead.
Re-passing a completed walk result is equally lossy in the other direction: it takes the pass-through
path and reports `resolution: "single_position"`, erasing the record that fetching occurred.

One asymmetry to be aware of: an empty decoded token at position 0 opens a root branch (see above),
but an empty decoded token at a *suffix* position cannot advance, so its mass goes to `residualMass`
rather than staying ambiguous. Keeping it ambiguous would re-queue an identical branch forever.

Strict-prefix label sets remain rejected with a `TypeError`. Shared prefixes are what the walk
serves; a label that is a strict prefix of another is still malformed input, including for labels
built at runtime.

## Compatibility Note

Starting in `v0.18.0`, `topLogprobs` without effective `logprobs: true` is a validation error.
The check runs after preset, request, provider-default, and model-default settings are merged;
template metadata is preserved until the final combination is known.

For custom OpenAI-compatible adapters, `mapOpenAIChatLogprobs(raw)` is also available from the
package root. It accepts `unknown`, filters malformed entries, and returns normalized
`TokenLogprob[] | undefined`.
