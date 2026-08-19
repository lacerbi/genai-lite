import type { TokenLogprob } from "./types";

const DEFAULT_AMBIGUITY_LOGPROB_GAP = 5;
const LOGPROB_POSITIVE_EPSILON = 1e-6;
const PROBABILITY_SUM_EPSILON = 1e-6;

interface LabelTrieNode {
  children: Map<string, LabelTrieNode>;
  labelIndex: number | null;
  reachableLabels: Set<number>;
}

interface PreparedEvidence {
  tokenLogprobs: Map<string, number>;
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
 * Generates a llama.cpp-compatible GBNF grammar for one answer label.
 *
 * @param labels - Complete answer labels. Strict-prefix label sets are rejected.
 * @returns A GBNF grammar accepting one label with an optional leading ASCII space.
 */
export function generateAnswerTokenGrammar(labels: readonly string[]): string {
  const validatedLabels = validateLabels(labels);
  const alternatives = validatedLabels
    .map((label) => `"${escapeGbnfLiteral(label)}"`)
    .join(" | ");

  return `root ::= " "? answer\nanswer ::= ${alternatives}\n`;
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
  const rawTokenLogprob = snapshotTokenLogprob(tokenLogprob);
  const zeroLabelProbs = createZeroLabelRecord(validatedLabels);

  if (!Array.isArray(tokenLogprob?.topLogprobs) || tokenLogprob.topLogprobs.length === 0) {
    return createUnusableResult(
      "missing_alternatives",
      zeroLabelProbs,
      rawTokenLogprob
    );
  }

  const prepared = prepareEvidence(tokenLogprob);
  if (prepared.tokenLogprobs.size === 0) {
    return createUnusableResult(
      "invalid_evidence",
      zeroLabelProbs,
      prepared.rawTokenLogprob
    );
  }

  const totalVisibleMass = sumVisibleMass(prepared.tokenLogprobs);
  if (!Number.isFinite(totalVisibleMass) || totalVisibleMass > 1 + PROBABILITY_SUM_EPSILON) {
    return createUnusableResult(
      "invalid_evidence",
      zeroLabelProbs,
      prepared.rawTokenLogprob
    );
  }

  if (totalVisibleMass > 1) {
    const logScale = -Math.log(totalVisibleMass);
    for (const [token, logprob] of prepared.tokenLogprobs) {
      prepared.tokenLogprobs.set(token, logprob + logScale);
    }
  }

  const trie = buildLabelTrie(validatedLabels);
  const attributedMass = new Map<number, number>();
  let ambiguousMass = 0;

  for (const [token, logprob] of prepared.tokenLogprobs) {
    const probability = logprob === Number.NEGATIVE_INFINITY ? 0 : Math.exp(logprob);
    if (probability === 0) {
      continue;
    }

    const node = walkTrie(trie, token);
    if (!node) {
      continue;
    }

    if (node.labelIndex !== null) {
      attributedMass.set(
        node.labelIndex,
        (attributedMass.get(node.labelIndex) ?? 0) + probability
      );
      continue;
    }

    if (node.reachableLabels.size === 1) {
      // This attribution is sound only because strict-prefix label sets are rejected.
      const labelIndex = node.reachableLabels.values().next().value as number;
      attributedMass.set(labelIndex, (attributedMass.get(labelIndex) ?? 0) + probability);
      continue;
    }

    if (node.reachableLabels.size > 1) {
      ambiguousMass += probability;
    }
  }

  const totalAttributedMass = sumMapValues(attributedMass);
  if (totalAttributedMass === 0 && ambiguousMass === 0) {
    return createUnusableResult(
      "no_matching_tokens",
      zeroLabelProbs,
      prepared.rawTokenLogprob
    );
  }

  const absoluteEntries = validatedLabels.map(
    (label, index): [string, number] => [label, attributedMass.get(index) ?? 0]
  );
  const absoluteLabelProbs = Object.fromEntries(absoluteEntries);
  const conditionalLabelProbs = Object.fromEntries(
    absoluteEntries.map(([label, probability]): [string, number] => [
      label,
      totalAttributedMass > 0 ? probability / totalAttributedMass : 0,
    ])
  );
  const residualMass = Math.max(0, 1 - totalAttributedMass - ambiguousMass);
  const status = getExtractionStatus(
    attributedMass,
    ambiguousMass,
    ambiguityLogprobGap
  );

  return {
    status,
    absoluteLabelProbs,
    conditionalLabelProbs,
    residualMass,
    ambiguousMass,
    ...(prepared.rawTokenLogprob && { rawTokenLogprob: prepared.rawTokenLogprob }),
  };
}

function validateLabels(labels: readonly string[]): string[] {
  if (!Array.isArray(labels) || labels.length === 0) {
    throw new TypeError("labels must be a nonempty array of strings.");
  }

  const validatedLabels = labels.map((label, index) => {
    if (typeof label !== "string" || label.length === 0) {
      throw new TypeError(`labels[${index}] must be a nonempty string.`);
    }
    if (label.trim() !== label) {
      throw new TypeError(`labels[${index}] must not have leading or trailing whitespace.`);
    }
    if (containsUnsupportedCharacters(label)) {
      throw new TypeError(`labels[${index}] contains unsupported characters.`);
    }
    return label;
  });

  const sortedLabels = [...validatedLabels].sort();
  for (let index = 1; index < sortedLabels.length; index += 1) {
    const previous = sortedLabels[index - 1];
    const current = sortedLabels[index];
    if (current === previous) {
      throw new TypeError(`Duplicate label: ${JSON.stringify(current)}.`);
    }
    if (current.startsWith(previous)) {
      throw new TypeError(
        `Strict-prefix labels are not supported: ${JSON.stringify(previous)} prefixes ` +
        `${JSON.stringify(current)}.`
      );
    }
  }

  return validatedLabels;
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

function escapeGbnfLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function createTrieNode(): LabelTrieNode {
  return {
    children: new Map<string, LabelTrieNode>(),
    labelIndex: null,
    reachableLabels: new Set<number>(),
  };
}

function buildLabelTrie(labels: readonly string[]): LabelTrieNode {
  const root = createTrieNode();
  labels.forEach((label, labelIndex) => {
    insertLabelForm(root, label, labelIndex);
    insertLabelForm(root, ` ${label}`, labelIndex);
  });
  return root;
}

function insertLabelForm(root: LabelTrieNode, form: string, labelIndex: number): void {
  let node = root;
  node.reachableLabels.add(labelIndex);
  for (const character of form) {
    let child = node.children.get(character);
    if (!child) {
      child = createTrieNode();
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

function prepareEvidence(tokenLogprob: TokenLogprob): PreparedEvidence {
  const tokenLogprobs = new Map<string, number>();
  for (const alternative of tokenLogprob.topLogprobs ?? []) {
    const normalized = normalizeLogprob(alternative.logprob);
    if (typeof alternative.token !== "string" || normalized === undefined) {
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

  return {
    tokenLogprobs,
    rawTokenLogprob: snapshotTokenLogprob(tokenLogprob),
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

function snapshotTokenLogprob(tokenLogprob: TokenLogprob | undefined): TokenLogprob | undefined {
  if (!tokenLogprob || typeof tokenLogprob !== "object") {
    return undefined;
  }
  return {
    token: tokenLogprob.token,
    logprob: tokenLogprob.logprob,
    ...(Array.isArray(tokenLogprob.topLogprobs) && {
      topLogprobs: tokenLogprob.topLogprobs.map((alternative) => ({
        token: alternative.token,
        logprob: alternative.logprob,
      })),
    }),
  };
}
