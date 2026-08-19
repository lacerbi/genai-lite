import type { TokenLogprob } from "./types";

const DEFAULT_AMBIGUITY_LOGPROB_GAP = 5;
const DEFAULT_MAX_SUFFIX_FETCHES = 8;
const LOGPROB_POSITIVE_EPSILON = 1e-6;
const PROBABILITY_SUM_EPSILON = 1e-6;
const FRONTIER_KEY_SEPARATOR = "\u0000";

interface LabelTrieNode {
  id: number;
  children: Map<string, LabelTrieNode>;
  labelIndex: number | null;
  reachableLabels: Set<number>;
}

interface FormValidationPolicy {
  /** Plural noun used in array-level and index-level messages. */
  plural: string;
  /** Singular noun used in duplicate messages. */
  singular: string;
  /** Whether a form may begin with whitespace that is part of the fragment. */
  allowLeadingWhitespace: boolean;
}

type PreparedEvidence =
  | { kind: "missing_alternatives"; rawTokenLogprob?: TokenLogprob }
  | { kind: "invalid_evidence"; rawTokenLogprob?: TokenLogprob }
  | {
      kind: "ok";
      tokenLogprobs: Map<string, number>;
      rawTokenLogprob?: TokenLogprob;
    };

interface FrontierCandidate {
  node: LabelTrieNode;
  /** Exact decoded token text that reached this node from the interpreted node. */
  text: string;
  /** Local probability share of this candidate within the interpreted position. */
  share: number;
}

interface NodeInterpretation {
  /** Local probability share resolved to each label index. */
  resolved: Map<number, number>;
  /** Local shares that stopped on a node reachable by several labels. */
  frontier: FrontierCandidate[];
  /** Local share not attributable to any label path, including truncated mass. */
  residual: number;
}

interface PositionZeroAnalysis {
  result: SingleTokenLabelProbExtraction;
  attributed: Map<number, number>;
  frontier: FrontierCandidate[];
}

interface FrontierState {
  node: LabelTrieNode;
  /** Cumulative exact decoded answer text that reaches this node. */
  prefix: string;
  /** Absolute probability mass entering this state. */
  mass: number;
  /** Monotonic discovery order used to break equal-mass ties. */
  sequence: number;
}

interface WalkState {
  labels: string[];
  ambiguityLogprobGap: number;
  maxFetches: number;
  attributed: Map<number, number>;
  residualMass: number;
  frontier: FrontierState[];
  frontierIndex: Map<string, FrontierState>;
  /** State removed from the frontier for the in-flight fetch, if any. */
  pending: FrontierState | null;
  sequence: number;
  fetchCount: number;
  termination: SuffixWalkTermination;
  rawTokenLogprob?: TokenLogprob;
}

/** Status returned by single-position constrained-label extraction. */
export type SingleTokenLabelProbStatus =
  | "ok"
  | "ambiguous_prefix"
  | "missing_alternatives"
  | "no_matching_tokens"
  | "invalid_evidence";

/** Options for single-position constrained-label extraction. */
export interface SingleTokenLabelProbOptions {
  /** Minimum logprob gap required to treat ambiguous prefix mass as negligible. */
  ambiguityLogprobGap?: number;
}

/** Probability evidence recovered from one generated token position. */
export interface SingleTokenLabelProbExtraction {
  /** Whether the returned position contains usable label evidence. */
  status: SingleTokenLabelProbStatus;
  /** Visible probability mass attributable to each label. */
  absoluteLabelProbs: Record<string, number>;
  /** Attributed label mass normalized over recognized labels only. */
  conditionalLabelProbs: Record<string, number>;
  /** Probability mass not attributable to a supplied label. */
  residualMass: number;
  /** Visible probability mass shared by several reachable labels. */
  ambiguousMass: number;
  /** Defensive snapshot of the source token evidence, when supplied. */
  rawTokenLogprob?: TokenLogprob;
}

/**
 * Library-generated context for one caller-owned suffix continuation request.
 *
 * The library builds this request and never dispatches it. A caller translates it
 * into its own provider call, appending `prefix` to the assistant answer text and
 * constraining the new position with `grammar`.
 */
export interface SuffixWalkFetchRequest {
  /**
   * Cumulative exact decoded answer text already attributed to this branch. Reissue
   * it verbatim as assistant prefill; the library never re-fetches position 0.
   */
  prefix: string;
  /** Remaining label fragments still reachable after `prefix`. */
  suffixes: readonly string[];
  /** GBNF grammar accepting exactly one entry of `suffixes`. */
  grammar: string;
}

/**
 * Synchronous caller-owned fetcher for one suffix continuation position.
 *
 * @param request - Library-generated prefix, reachable suffixes, and grammar.
 * @returns Normalized evidence for the next position, or `undefined` when the
 *   caller cannot supply it. Returning `undefined` stops the walk without erasing
 *   already-resolved mass; throwing propagates to the caller unchanged.
 */
export type SuffixTokenLogprobFetcher = (
  request: SuffixWalkFetchRequest
) => TokenLogprob | undefined;

/**
 * Asynchronous caller-owned fetcher for one suffix continuation position.
 *
 * @param request - Library-generated prefix, reachable suffixes, and grammar.
 * @returns A promise for normalized evidence for the next position, or `undefined`
 *   when the caller cannot supply it. A rejected promise propagates unchanged.
 */
export type AsyncSuffixTokenLogprobFetcher = (
  request: SuffixWalkFetchRequest
) => Promise<TokenLogprob | undefined>;

/** Options for suffix-walk resolution of shared-prefix label mass. */
export interface SuffixWalkLabelProbOptions extends SingleTokenLabelProbOptions {
  /**
   * Global budget of fetcher invocations across every frontier path. Must be a
   * finite positive integer. Defaults to 8.
   */
  maxFetches?: number;
}

/**
 * Whether a result came from one position only, or from suffix continuation.
 *
 * - `single_position` - no fetcher call was made; this is position-0 evidence.
 * - `suffix_walk` - at least one fetcher call completed. This records that fetching
 *   *happened*, not that it succeeded: a walk whose only response was rejected still
 *   reports `suffix_walk` with `termination: "fetch_rejected"`.
 */
export type LabelProbResolution = "single_position" | "suffix_walk";

/**
 * Why a suffix walk stopped.
 *
 * - `not_started` - the supplied result was not `ambiguous_prefix`, or recomputation
 *   made it non-ambiguous, so no walk ran.
 * - `complete` - no visible frontier remains. Off-label or truncated suffix mass may
 *   still be present in `residualMass`.
 * - `budget_exhausted` - `maxFetches` was reached with frontier states still queued;
 *   their mass remains in `ambiguousMass`.
 * - `fetch_rejected` - a response carried no usable advancing evidence. That fetch was
 *   discarded whole; earlier resolved mass is kept and the current plus queued mass
 *   remains in `ambiguousMass`.
 */
export type SuffixWalkTermination =
  | "not_started"
  | "complete"
  | "budget_exhausted"
  | "fetch_rejected";

/**
 * Single-position evidence combined with any suffix-resolved probability mass.
 *
 * `status` describes the probability outcome, `resolution` whether suffix fetching
 * occurred, and `termination` whether the walk finished. The three axes are
 * independent: a result can be `status: "ok"` with a `budget_exhausted` walk.
 */
export interface SuffixWalkLabelProbExtraction
  extends SingleTokenLabelProbExtraction {
  /** Whether any suffix continuation fetch was made for this result. */
  resolution: LabelProbResolution;
  /** Why the walk stopped, independent of whether the result is usable. */
  termination: SuffixWalkTermination;
  /** Completed fetcher invocations, including one whose evidence was rejected. */
  fetchCount: number;
}

/**
 * Generates a llama.cpp-compatible GBNF grammar for one answer label.
 *
 * @param labels - Complete answer labels. Strict-prefix label sets are rejected.
 * @returns A GBNF grammar accepting one label with an optional leading ASCII space.
 */
export function generateAnswerTokenGrammar(labels: readonly string[]): string {
  const validatedLabels = validateLabels(labels);
  return `root ::= " "? answer\nanswer ::= ${buildOrderedAlternatives(
    validatedLabels
  )}\n`;
}

/**
 * Generates a llama.cpp-compatible GBNF grammar for one label suffix fragment.
 *
 * Suffix fragments continue an already-decoded answer prefix, so this grammar adds
 * no optional leading space. Whitespace that is genuinely part of a fragment — as
 * in the fragments `" one"` and `" two"` left by labels `"answer one"` and
 * `"answer two"` — is preserved literally.
 *
 * @param suffixes - Remaining label fragments. Duplicate, strict-prefix,
 *   whitespace-only, and trailing-whitespace fragments are rejected.
 * @returns A GBNF grammar accepting exactly one supplied suffix fragment.
 */
export function generateSuffixGrammar(suffixes: readonly string[]): string {
  const validatedSuffixes = validateSuffixes(suffixes);
  return `root ::= suffix\nsuffix ::= ${buildOrderedAlternatives(
    validatedSuffixes
  )}\n`;
}

/**
 * Extracts label probability evidence from one generated token position.
 *
 * Provider logprobs must be normalized over the complete effective candidate
 * distribution before top-N truncation. This function cannot detect a provider
 * that renormalizes only the returned alternatives.
 *
 * @param labels - Complete answer labels. Strict-prefix label sets are rejected.
 * @param tokenLogprob - Normalized sampled-token evidence for one position.
 * @param options - Ambiguity threshold options.
 * @returns Absolute, conditional, ambiguous, and residual probability evidence.
 */
export function extractSingleTokenLabelProbs(
  labels: readonly string[],
  tokenLogprob: TokenLogprob | undefined,
  options: SingleTokenLabelProbOptions = {}
): SingleTokenLabelProbExtraction {
  const validatedLabels = validateLabels(labels);
  const ambiguityLogprobGap = validateAmbiguityGap(options.ambiguityLogprobGap);
  const trie = buildLabelTrie(validatedLabels);
  return analyzePositionZero(
    validatedLabels,
    trie,
    tokenLogprob,
    ambiguityLogprobGap
  ).result;
}

/**
 * Resolves shared-prefix label mass by walking suffixes through an injected fetcher.
 *
 * This is a documented **approximation**. The caller reissues decoded answer text,
 * which a provider may tokenize differently from the original generated path, and
 * duplicate or converged decoded strings can collapse distinct hidden token
 * histories. Suffix-resolved probabilities are therefore decoded-text-state
 * estimates carrying no numerical error bound, not the model's exact original
 * continuation probabilities.
 *
 * A non-`ambiguous_prefix` result is trusted typed pass-through: it is copied
 * defensively, with no fetch and no reconciliation of its fields against `labels`
 * or `options`. An `ambiguous_prefix` result is re-interpreted from its
 * `rawTokenLogprob` snapshot under the supplied labels and current options; if that
 * recomputation is no longer ambiguous, it is returned without fetching. Position 0
 * is never re-fetched.
 *
 * Every suffix position inherits the single-position evidence precondition:
 * logprobs must be normalized over the provider's complete effective candidate
 * distribution before top-N truncation.
 *
 * Do not resume a walk by passing its own result back in. The result carries no suffix
 * transcript, so an incomplete walk would be restarted from the position-0 snapshot and
 * its suffix-resolved mass discarded. Raise `maxFetches` instead.
 *
 * @param labels - Complete answer labels. Strict-prefix label sets are rejected.
 * @param initial - The single-position extraction to resolve.
 * @param fetcher - Caller-owned continuation fetcher. The library never dispatches.
 * @param options - Ambiguity threshold and fetch budget options.
 * @returns Position-0 evidence plus any suffix-resolved mass, with provenance.
 * @throws TypeError When labels or options are invalid, or when an
 *   `ambiguous_prefix` result carries no `rawTokenLogprob`.
 */
export function resolveLabelProbsWithSuffixWalk(
  labels: readonly string[],
  initial: SingleTokenLabelProbExtraction,
  fetcher: SuffixTokenLogprobFetcher,
  options: SuffixWalkLabelProbOptions = {}
): SuffixWalkLabelProbExtraction {
  const initialization = initializeWalk(labels, initial, options);
  if (initialization.shortCircuit) {
    return initialization.shortCircuit;
  }

  const state = initialization.state;
  for (;;) {
    const request = beginStep(state);
    if (!request) {
      break;
    }
    if (!commitStep(state, fetcher(request))) {
      state.termination = "fetch_rejected";
      break;
    }
  }

  return finalizeWalk(state);
}

/**
 * Asynchronous counterpart of {@link resolveLabelProbsWithSuffixWalk}.
 *
 * Fetches run sequentially so the highest remaining mass is always resolved next,
 * which means a default walk can serialize up to eight follow-up round trips. Every
 * approximation, pass-through, recomputation, budget, and accounting rule of the
 * synchronous resolver applies unchanged.
 *
 * @param labels - Complete answer labels. Strict-prefix label sets are rejected.
 * @param initial - The single-position extraction to resolve.
 * @param fetcher - Caller-owned asynchronous fetcher. The library never dispatches.
 * @param options - Ambiguity threshold and fetch budget options.
 * @returns Position-0 evidence plus any suffix-resolved mass, with provenance.
 *   Because this function is `async`, the validation errors that the synchronous
 *   resolver throws are delivered here as a rejected promise with the same `TypeError`.
 */
export async function resolveLabelProbsWithSuffixWalkAsync(
  labels: readonly string[],
  initial: SingleTokenLabelProbExtraction,
  fetcher: AsyncSuffixTokenLogprobFetcher,
  options: SuffixWalkLabelProbOptions = {}
): Promise<SuffixWalkLabelProbExtraction> {
  const initialization = initializeWalk(labels, initial, options);
  if (initialization.shortCircuit) {
    return initialization.shortCircuit;
  }

  const state = initialization.state;
  for (;;) {
    const request = beginStep(state);
    if (!request) {
      break;
    }
    if (!commitStep(state, await fetcher(request))) {
      state.termination = "fetch_rejected";
      break;
    }
  }

  return finalizeWalk(state);
}

function initializeWalk(
  labels: readonly string[],
  initial: SingleTokenLabelProbExtraction,
  options: SuffixWalkLabelProbOptions
):
  | { shortCircuit: SuffixWalkLabelProbExtraction; state?: undefined }
  | { shortCircuit?: undefined; state: WalkState } {
  const validatedLabels = validateLabels(labels);
  const ambiguityLogprobGap = validateAmbiguityGap(options.ambiguityLogprobGap);
  const maxFetches = validateMaxFetches(options.maxFetches);

  if (initial.status !== "ambiguous_prefix") {
    return { shortCircuit: createPassThroughResult(initial) };
  }

  const rawTokenLogprob = initial.rawTokenLogprob;
  if (!rawTokenLogprob || typeof rawTokenLogprob !== "object") {
    throw new TypeError(
      "An ambiguous_prefix extraction must carry rawTokenLogprob to resolve suffixes."
    );
  }

  const trie = buildLabelTrie(validatedLabels);
  const analysis = analyzePositionZero(
    validatedLabels,
    trie,
    rawTokenLogprob,
    ambiguityLogprobGap
  );
  if (analysis.result.status !== "ambiguous_prefix") {
    return { shortCircuit: createPassThroughResult(analysis.result) };
  }

  const state: WalkState = {
    labels: validatedLabels,
    ambiguityLogprobGap,
    maxFetches,
    attributed: new Map(analysis.attributed),
    residualMass: analysis.result.residualMass,
    frontier: [],
    frontierIndex: new Map(),
    pending: null,
    sequence: 0,
    fetchCount: 0,
    termination: "not_started",
    ...(analysis.result.rawTokenLogprob && {
      rawTokenLogprob: analysis.result.rawTokenLogprob,
    }),
  };
  for (const candidate of analysis.frontier) {
    enqueueFrontier(state, candidate.node, candidate.text, candidate.share);
  }

  return { state };
}

function beginStep(state: WalkState): SuffixWalkFetchRequest | null {
  if (state.frontier.length === 0) {
    state.termination = "complete";
    return null;
  }
  if (state.fetchCount >= state.maxFetches) {
    state.termination = "budget_exhausted";
    return null;
  }

  const selectedIndex = selectFrontierIndex(state.frontier);
  const [selected] = state.frontier.splice(selectedIndex, 1);
  state.frontierIndex.delete(createFrontierKey(selected.prefix, selected.node));
  state.pending = selected;

  const suffixes = collectSuffixForms(selected.node);
  return {
    prefix: selected.prefix,
    suffixes,
    grammar: generateSuffixGrammar(suffixes),
  };
}

function commitStep(
  state: WalkState,
  tokenLogprob: TokenLogprob | undefined
): boolean {
  const pending = state.pending;
  if (!pending) {
    return false;
  }

  // Counted here, once per completed callback, so both drivers agree by construction.
  state.fetchCount += 1;

  const prepared = prepareEvidence(tokenLogprob);
  if (prepared.kind !== "ok") {
    return false;
  }

  const interpretation = interpretEvidenceAtNode(
    pending.node,
    prepared.tokenLogprobs
  );
  const advancing = interpretation.frontier.filter(
    (candidate) => candidate.text.length > 0
  );
  if (interpretation.resolved.size === 0 && advancing.length === 0) {
    return false;
  }

  for (const [labelIndex, share] of interpretation.resolved) {
    addMass(state.attributed, labelIndex, share * pending.mass);
  }

  // An empty decoded token re-lands on this same node, so it cannot advance. Unlike
  // position 0, where it opens a root frontier, here its mass becomes residual: keeping
  // it ambiguous would re-queue an identical state and stall the walk.
  let stalledShare = 0;
  for (const candidate of interpretation.frontier) {
    if (candidate.text.length === 0) {
      stalledShare += candidate.share;
    }
  }
  state.residualMass += (interpretation.residual + stalledShare) * pending.mass;

  for (const candidate of advancing) {
    enqueueFrontier(
      state,
      candidate.node,
      pending.prefix + candidate.text,
      candidate.share * pending.mass
    );
  }

  state.pending = null;
  return true;
}

function finalizeWalk(state: WalkState): SuffixWalkLabelProbExtraction {
  let ambiguousMass = state.pending ? state.pending.mass : 0;
  for (const frontierState of state.frontier) {
    ambiguousMass += frontierState.mass;
  }

  const materialized = materializeLabelProbs(state.labels, state.attributed);
  const status = getExtractionStatus(
    state.attributed,
    ambiguousMass,
    state.ambiguityLogprobGap
  );

  return {
    status,
    absoluteLabelProbs: materialized.absoluteLabelProbs,
    conditionalLabelProbs: materialized.conditionalLabelProbs,
    residualMass: Math.max(0, state.residualMass),
    ambiguousMass,
    ...(state.rawTokenLogprob && { rawTokenLogprob: state.rawTokenLogprob }),
    resolution: state.fetchCount > 0 ? "suffix_walk" : "single_position",
    termination: state.termination,
    fetchCount: state.fetchCount,
  };
}

function selectFrontierIndex(frontier: readonly FrontierState[]): number {
  let bestIndex = 0;
  for (let index = 1; index < frontier.length; index += 1) {
    const candidate = frontier[index];
    const best = frontier[bestIndex];
    if (
      candidate.mass > best.mass ||
      (candidate.mass === best.mass && candidate.sequence < best.sequence)
    ) {
      bestIndex = index;
    }
  }
  return bestIndex;
}

function enqueueFrontier(
  state: WalkState,
  node: LabelTrieNode,
  prefix: string,
  mass: number
): void {
  const key = createFrontierKey(prefix, node);
  const existing = state.frontierIndex.get(key);
  if (existing) {
    existing.mass += mass;
    return;
  }

  const created: FrontierState = {
    node,
    prefix,
    mass,
    sequence: state.sequence,
  };
  state.sequence += 1;
  state.frontier.push(created);
  state.frontierIndex.set(key, created);
}

function createFrontierKey(prefix: string, node: LabelTrieNode): string {
  return `${prefix}${FRONTIER_KEY_SEPARATOR}${node.id}`;
}

function analyzePositionZero(
  validatedLabels: readonly string[],
  trie: LabelTrieNode,
  tokenLogprob: TokenLogprob | undefined,
  ambiguityLogprobGap: number
): PositionZeroAnalysis {
  const zeroLabelProbs = createZeroLabelRecord(validatedLabels);
  const prepared = prepareEvidence(tokenLogprob);
  if (prepared.kind !== "ok") {
    return {
      result: createUnusableResult(
        prepared.kind,
        zeroLabelProbs,
        prepared.rawTokenLogprob
      ),
      attributed: new Map(),
      frontier: [],
    };
  }

  const interpretation = interpretEvidenceAtNode(trie, prepared.tokenLogprobs);
  const totalAttributedMass = sumMapValues(interpretation.resolved);
  let ambiguousMass = 0;
  for (const candidate of interpretation.frontier) {
    ambiguousMass += candidate.share;
  }

  if (totalAttributedMass === 0 && ambiguousMass === 0) {
    return {
      result: createUnusableResult(
        "no_matching_tokens",
        zeroLabelProbs,
        prepared.rawTokenLogprob
      ),
      attributed: new Map(),
      frontier: [],
    };
  }

  const materialized = materializeLabelProbs(
    validatedLabels,
    interpretation.resolved
  );
  const status = getExtractionStatus(
    interpretation.resolved,
    ambiguousMass,
    ambiguityLogprobGap
  );

  return {
    result: {
      status,
      absoluteLabelProbs: materialized.absoluteLabelProbs,
      conditionalLabelProbs: materialized.conditionalLabelProbs,
      residualMass: Math.max(0, 1 - totalAttributedMass - ambiguousMass),
      ambiguousMass,
      ...(prepared.rawTokenLogprob && {
        rawTokenLogprob: prepared.rawTokenLogprob,
      }),
    },
    attributed: interpretation.resolved,
    frontier: interpretation.frontier,
  };
}

function interpretEvidenceAtNode(
  startNode: LabelTrieNode,
  tokenLogprobs: ReadonlyMap<string, number>
): NodeInterpretation {
  const resolved = new Map<number, number>();
  const frontier: FrontierCandidate[] = [];
  let recognizedMass = 0;

  for (const [token, logprob] of tokenLogprobs) {
    const probability =
      logprob === Number.NEGATIVE_INFINITY ? 0 : Math.exp(logprob);
    if (probability === 0) {
      continue;
    }

    const node = walkTrie(startNode, token);
    if (!node) {
      continue;
    }

    if (node.labelIndex !== null) {
      addMass(resolved, node.labelIndex, probability);
      recognizedMass += probability;
      continue;
    }

    if (node.reachableLabels.size === 1) {
      // This attribution is sound only because strict-prefix label sets are rejected.
      const labelIndex = node.reachableLabels.values().next().value as number;
      addMass(resolved, labelIndex, probability);
      recognizedMass += probability;
      continue;
    }

    if (node.reachableLabels.size > 1) {
      frontier.push({ node, text: token, share: probability });
      recognizedMass += probability;
    }
  }

  return { resolved, frontier, residual: Math.max(0, 1 - recognizedMass) };
}

function validateLabels(labels: readonly string[]): string[] {
  return validateFormStrings(labels, {
    plural: "labels",
    singular: "label",
    allowLeadingWhitespace: false,
  });
}

function validateSuffixes(suffixes: readonly string[]): string[] {
  return validateFormStrings(suffixes, {
    plural: "suffixes",
    singular: "suffix",
    allowLeadingWhitespace: true,
  });
}

function validateFormStrings(
  values: readonly string[],
  policy: FormValidationPolicy
): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError(`${policy.plural} must be a nonempty array of strings.`);
  }

  const validatedValues = values.map((value, index) => {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(`${policy.plural}[${index}] must be a nonempty string.`);
    }
    if (policy.allowLeadingWhitespace) {
      if (value.trim().length === 0) {
        throw new TypeError(
          `${policy.plural}[${index}] must not be whitespace only.`
        );
      }
      if (value.trimEnd() !== value) {
        throw new TypeError(
          `${policy.plural}[${index}] must not have trailing whitespace.`
        );
      }
    } else if (value.trim() !== value) {
      throw new TypeError(
        `${policy.plural}[${index}] must not have leading or trailing whitespace.`
      );
    }
    if (containsUnsupportedCharacters(value)) {
      throw new TypeError(
        `${policy.plural}[${index}] contains unsupported characters.`
      );
    }
    return value;
  });

  const sortedValues = [...validatedValues].sort();
  for (let index = 1; index < sortedValues.length; index += 1) {
    const previous = sortedValues[index - 1];
    const current = sortedValues[index];
    if (current === previous) {
      throw new TypeError(
        `Duplicate ${policy.singular}: ${JSON.stringify(current)}.`
      );
    }
    if (current.startsWith(previous)) {
      throw new TypeError(
        `Strict-prefix ${policy.plural} are not supported: ${JSON.stringify(previous)} prefixes ` +
        `${JSON.stringify(current)}.`
      );
    }
  }

  return validatedValues;
}

function containsUnsupportedCharacters(value: string): boolean {
  if (/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u.test(value)) {
    return true;
  }

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (
        index + 1 >= value.length ||
        nextCodeUnit < 0xdc00 ||
        nextCodeUnit > 0xdfff
      ) {
        return true;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }

  return false;
}

function validateAmbiguityGap(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_AMBIGUITY_LOGPROB_GAP;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError("ambiguityLogprobGap must be a finite non-negative number.");
  }
  return value;
}

function validateMaxFetches(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_MAX_SUFFIX_FETCHES;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError("maxFetches must be a finite positive integer.");
  }
  return value;
}

function buildOrderedAlternatives(values: readonly string[]): string {
  return values.map((value) => `"${escapeGbnfLiteral(value)}"`).join(" | ");
}

function escapeGbnfLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function createTrieNode(id: number): LabelTrieNode {
  return {
    id,
    children: new Map<string, LabelTrieNode>(),
    labelIndex: null,
    reachableLabels: new Set<number>(),
  };
}

function buildLabelTrie(labels: readonly string[]): LabelTrieNode {
  let nextNodeId = 0;
  const createNode = (): LabelTrieNode => {
    const node = createTrieNode(nextNodeId);
    nextNodeId += 1;
    return node;
  };

  const root = createNode();
  labels.forEach((label, labelIndex) => {
    insertLabelForm(root, label, labelIndex, createNode);
    insertLabelForm(root, ` ${label}`, labelIndex, createNode);
  });
  return root;
}

function insertLabelForm(
  root: LabelTrieNode,
  form: string,
  labelIndex: number,
  createNode: () => LabelTrieNode
): void {
  let node = root;
  node.reachableLabels.add(labelIndex);
  for (const character of form) {
    let child = node.children.get(character);
    if (!child) {
      child = createNode();
      node.children.set(character, child);
    }
    child.reachableLabels.add(labelIndex);
    node = child;
  }
  node.labelIndex = labelIndex;
}

function walkTrie(root: LabelTrieNode, token: string): LabelTrieNode | undefined {
  let node = root;
  for (const character of token) {
    const child = node.children.get(character);
    if (!child) {
      return undefined;
    }
    node = child;
  }
  return node;
}

function collectSuffixForms(node: LabelTrieNode): string[] {
  const forms: string[] = [];
  const visit = (current: LabelTrieNode, path: string): void => {
    if (current.labelIndex !== null) {
      forms.push(path);
      return;
    }
    for (const [character, child] of current.children) {
      visit(child, path + character);
    }
  };

  for (const [character, child] of node.children) {
    visit(child, character);
  }
  return forms;
}

function prepareEvidence(
  tokenLogprob: TokenLogprob | undefined
): PreparedEvidence {
  const rawTokenLogprob = snapshotTokenLogprob(tokenLogprob);
  if (
    !tokenLogprob ||
    !Array.isArray(tokenLogprob.topLogprobs) ||
    tokenLogprob.topLogprobs.length === 0
  ) {
    return {
      kind: "missing_alternatives",
      ...(rawTokenLogprob && { rawTokenLogprob }),
    };
  }

  const tokenLogprobs = new Map<string, number>();
  for (const alternative of tokenLogprob.topLogprobs) {
    const normalized = normalizeLogprob(alternative?.logprob);
    if (typeof alternative?.token !== "string" || normalized === undefined) {
      continue;
    }
    addLogprob(tokenLogprobs, alternative.token, normalized);
  }

  const sampledLogprob = normalizeLogprob(tokenLogprob.logprob);
  if (
    typeof tokenLogprob.token === "string" &&
    sampledLogprob !== undefined &&
    !tokenLogprobs.has(tokenLogprob.token)
  ) {
    tokenLogprobs.set(tokenLogprob.token, sampledLogprob);
  }

  if (tokenLogprobs.size === 0) {
    return {
      kind: "invalid_evidence",
      ...(rawTokenLogprob && { rawTokenLogprob }),
    };
  }

  const totalVisibleMass = sumVisibleMass(tokenLogprobs);
  if (
    !Number.isFinite(totalVisibleMass) ||
    totalVisibleMass > 1 + PROBABILITY_SUM_EPSILON
  ) {
    return {
      kind: "invalid_evidence",
      ...(rawTokenLogprob && { rawTokenLogprob }),
    };
  }

  if (totalVisibleMass > 1) {
    const logScale = -Math.log(totalVisibleMass);
    for (const [token, logprob] of tokenLogprobs) {
      tokenLogprobs.set(token, logprob + logScale);
    }
  }

  return {
    kind: "ok",
    tokenLogprobs,
    ...(rawTokenLogprob && { rawTokenLogprob }),
  };
}

function normalizeLogprob(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value) || value === Number.POSITIVE_INFINITY) {
    return undefined;
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return value;
  }
  if (value > LOGPROB_POSITIVE_EPSILON) {
    return undefined;
  }
  return value > 0 ? 0 : value;
}

function addLogprob(target: Map<string, number>, token: string, logprob: number): void {
  const existing = target.get(token);
  target.set(token, existing === undefined ? logprob : logSumExp(existing, logprob));
}

function addMass(target: Map<number, number>, key: number, mass: number): void {
  target.set(key, (target.get(key) ?? 0) + mass);
}

function logSumExp(left: number, right: number): number {
  if (left === Number.NEGATIVE_INFINITY) {
    return right;
  }
  if (right === Number.NEGATIVE_INFINITY) {
    return left;
  }
  const maximum = Math.max(left, right);
  return maximum + Math.log1p(Math.exp(Math.min(left, right) - maximum));
}

function sumVisibleMass(tokenLogprobs: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const logprob of tokenLogprobs.values()) {
    total += logprob === Number.NEGATIVE_INFINITY ? 0 : Math.exp(logprob);
  }
  return total;
}

function sumMapValues(values: ReadonlyMap<number, number>): number {
  let total = 0;
  for (const value of values.values()) {
    total += value;
  }
  return total;
}

function getExtractionStatus(
  attributedMass: ReadonlyMap<number, number>,
  ambiguousMass: number,
  ambiguityLogprobGap: number
): SingleTokenLabelProbStatus {
  if (ambiguousMass === 0) {
    return "ok";
  }

  let bestLabelMass = 0;
  for (const probability of attributedMass.values()) {
    bestLabelMass = Math.max(bestLabelMass, probability);
  }
  if (bestLabelMass === 0) {
    return "ambiguous_prefix";
  }

  const gap = Math.log(bestLabelMass) - Math.log(ambiguousMass);
  return gap >= ambiguityLogprobGap ? "ok" : "ambiguous_prefix";
}

function materializeLabelProbs(
  labels: readonly string[],
  attributedMass: ReadonlyMap<number, number>
): {
  absoluteLabelProbs: Record<string, number>;
  conditionalLabelProbs: Record<string, number>;
} {
  const totalAttributedMass = sumMapValues(attributedMass);
  const absoluteEntries = labels.map(
    (label, index): [string, number] => [label, attributedMass.get(index) ?? 0]
  );

  return {
    absoluteLabelProbs: Object.fromEntries(absoluteEntries),
    conditionalLabelProbs: Object.fromEntries(
      absoluteEntries.map(([label, probability]): [string, number] => [
        label,
        totalAttributedMass > 0 ? probability / totalAttributedMass : 0,
      ])
    ),
  };
}

function createZeroLabelRecord(labels: readonly string[]): Record<string, number> {
  return Object.fromEntries(labels.map((label): [string, number] => [label, 0]));
}

function createUnusableResult(
  status: "missing_alternatives" | "no_matching_tokens" | "invalid_evidence",
  zeroLabelProbs: Record<string, number>,
  rawTokenLogprob: TokenLogprob | undefined
): SingleTokenLabelProbExtraction {
  return {
    status,
    absoluteLabelProbs: { ...zeroLabelProbs },
    conditionalLabelProbs: { ...zeroLabelProbs },
    residualMass: 1,
    ambiguousMass: 0,
    ...(rawTokenLogprob && { rawTokenLogprob }),
  };
}

function createPassThroughResult(
  initial: SingleTokenLabelProbExtraction
): SuffixWalkLabelProbExtraction {
  const rawTokenLogprob = snapshotTokenLogprob(initial.rawTokenLogprob);
  return {
    status: initial.status,
    absoluteLabelProbs: cloneProbabilityRecord(initial.absoluteLabelProbs),
    conditionalLabelProbs: cloneProbabilityRecord(initial.conditionalLabelProbs),
    residualMass: initial.residualMass,
    ambiguousMass: initial.ambiguousMass,
    ...(rawTokenLogprob && { rawTokenLogprob }),
    resolution: "single_position",
    termination: "not_started",
    fetchCount: 0,
  };
}

function cloneProbabilityRecord(
  record: Record<string, number> | undefined
): Record<string, number> {
  if (!record || typeof record !== "object") {
    return {};
  }
  return Object.fromEntries(Object.entries(record));
}

function snapshotTokenLogprob(tokenLogprob: TokenLogprob | undefined): TokenLogprob | undefined {
  if (!tokenLogprob || typeof tokenLogprob !== "object") {
    return undefined;
  }
  return {
    token: tokenLogprob.token,
    logprob: tokenLogprob.logprob,
    ...(Array.isArray(tokenLogprob.topLogprobs) && {
      topLogprobs: tokenLogprob.topLogprobs.map((alternative) => ({
        token: alternative?.token,
        logprob: alternative?.logprob,
      })),
    }),
  };
}
