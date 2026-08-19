# Constrained Answer Labels

Use a single-position constrained completion when an LLM must choose exactly one label and you
need probability evidence for that choice. genai-lite provides two root exports for this workflow:

- `generateAnswerTokenGrammar(labels)` creates a llama.cpp-compatible GBNF grammar.
- `extractSingleTokenLabelProbs(labels, tokenLogprob, options?)` interprets one normalized
  `TokenLogprob` position.

This is a **single-position** utility. The grammar constrains character sequences; it does not
guarantee that a label is one tokenizer token. A request using `maxTokens: 1` therefore requires
labels known to fit one output token for the selected model. The utility does not issue requests
or continue across multiple token positions.

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
caller can diagnose the unresolved branch. `rawTokenLogprob`, when present, is a defensive
snapshot for diagnostics.

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

## Multi-Token Labels

Suffix follow-up requests are intentionally deferred. Reissuing a request from decoded prefix
text can retokenize differently from the original continuation, so multiplying cumulative and
follow-up logprobs is not guaranteed to recover the original label probability without token
IDs or opaque provider token-state evidence. Use labels known to fit the one-position workflow.

## Compatibility Note

Starting in `v0.18.0`, `topLogprobs` without effective `logprobs: true` is a validation error.
The check runs after preset, request, provider-default, and model-default settings are merged;
template metadata is preserved until the final combination is known.

For custom OpenAI-compatible adapters, `mapOpenAIChatLogprobs(raw)` is also available from the
package root. It accepts `unknown`, filters malformed entries, and returns normalized
`TokenLogprob[] | undefined`.
