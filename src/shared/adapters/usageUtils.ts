import type {
  LLMAnswerAccounting,
  LLMTermination,
  LLMUsage,
  LLMUsageEvidence,
  LLMUsageFieldEvidence,
} from "../../llm/types";

export interface UsageAliases {
  prompt: readonly string[];
  completion: readonly string[];
  total: readonly string[];
}

export interface NormalizedUsage {
  usage?: LLMUsage;
  usageEvidence?: LLMUsageEvidence;
}

export interface ProviderOutputAccountingOptions {
  /** Provider-owned usage object for one physical response envelope. */
  source: Record<string, unknown> | null | undefined;
  /** Exact aliases for one direct provider-output count. */
  directFields?: readonly string[];
  /** Components that must all be present and are summed in provider space. */
  componentFields?: readonly string[];
  /** Number of physical choices represented by the usage object. */
  choiceCount: number;
  /** Whether content or reasoning is known to have been generated. */
  hasGeneratedOutput: boolean;
  /** Provider-output reasoning scope. */
  reasoning: LLMAnswerAccounting["reasoning"];
}

function readFiniteNumber(
  source: Record<string, unknown>,
  aliases: readonly string[]
): { value: number; field: string } | undefined {
  for (const field of aliases) {
    const value = source[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      return { value, field };
    }
  }
  return undefined;
}

function readNonnegativeSafeInteger(
  source: Record<string, unknown>,
  fields: readonly string[]
): number | undefined {
  for (const field of fields) {
    const value = source[field];
    if (value === undefined) {
      continue;
    }
    return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
      ? value
      : undefined;
  }
  return undefined;
}

/**
 * Creates exact provider-output accounting only when attribution is sound.
 *
 * This intentionally rejects aggregate/multi-choice usage, incomplete
 * component sums, invalid token values, and impossible zero counts for known
 * generated output. Missing or ambiguous evidence remains absent.
 */
export function createProviderOutputAccounting(
  options: ProviderOutputAccountingOptions
): LLMAnswerAccounting | undefined {
  const {
    source,
    directFields,
    componentFields,
    choiceCount,
    hasGeneratedOutput,
    reasoning,
  } = options;

  if (!source || choiceCount !== 1) {
    return undefined;
  }

  let tokens: number | undefined;
  if (componentFields && componentFields.length > 0) {
    let sum = 0;
    for (const field of componentFields) {
      const component = readNonnegativeSafeInteger(source, [field]);
      if (component === undefined || !Number.isSafeInteger(sum + component)) {
        return undefined;
      }
      sum += component;
    }
    tokens = sum;
  } else if (directFields && directFields.length > 0) {
    tokens = readNonnegativeSafeInteger(source, directFields);
  }

  if (tokens === undefined || (tokens === 0 && hasGeneratedOutput)) {
    return undefined;
  }

  return {
    tokens,
    method: "exact",
    source: "provider",
    reasoning,
  };
}

/**
 * Maps provider usage without converting absence to zero.
 *
 * The first present finite alias wins, including an explicit zero. Total is
 * derived only when both prompt and completion values exist.
 */
export function normalizeUsage(
  source: Record<string, unknown> | null | undefined,
  aliases: UsageAliases
): NormalizedUsage {
  if (!source) {
    return {};
  }

  const prompt = readFiniteNumber(source, aliases.prompt);
  const completion = readFiniteNumber(source, aliases.completion);
  const providerTotal = readFiniteNumber(source, aliases.total);
  const derivedTotal =
    providerTotal === undefined && prompt !== undefined && completion !== undefined
      ? prompt.value + completion.value
      : undefined;

  const usage: LLMUsage = {
    ...(prompt && { prompt_tokens: prompt.value }),
    ...(completion && { completion_tokens: completion.value }),
    ...(providerTotal && { total_tokens: providerTotal.value }),
    ...(derivedTotal !== undefined && { total_tokens: derivedTotal }),
  };

  if (Object.keys(usage).length === 0) {
    return {};
  }

  const providerEvidence = (
    field: string
  ): LLMUsageFieldEvidence => ({
    source: "provider",
    providerField: field,
  });
  const usageEvidence: LLMUsageEvidence = {
    ...(prompt && { prompt_tokens: providerEvidence(prompt.field) }),
    ...(completion && {
      completion_tokens: providerEvidence(completion.field),
    }),
    ...(providerTotal && {
      total_tokens: providerEvidence(providerTotal.field),
    }),
    ...(derivedTotal !== undefined && {
      total_tokens: { source: "derived" as const },
    }),
  };

  return { usage, usageEvidence };
}

/** Presence-aware merge for usage fragments received during streaming. */
export function mergeUsageRecords(
  current: Record<string, unknown> | undefined,
  update: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!update) {
    return current;
  }
  return {
    ...(current ?? {}),
    ...Object.fromEntries(
      Object.entries(update).filter(
        ([, value]) =>
          value !== undefined &&
          (typeof value !== "number" || Number.isFinite(value))
      )
    ),
  };
}

/** Normalizes a raw provider finish/stop reason without inventing a cause. */
export function normalizeTermination(
  rawReason: string | null | undefined,
  limit?: "output" | "context" | "unknown"
): LLMTermination {
  if (rawReason === null || rawReason === undefined || rawReason === "") {
    return { rawReason: rawReason ?? null, kind: "unknown" };
  }

  const normalized = rawReason.toLowerCase();
  if (
    normalized === "stop" ||
    normalized === "end_turn" ||
    normalized === "stop_sequence"
  ) {
    return { rawReason, kind: "stop" };
  }
  if (
    normalized === "length" ||
    normalized === "max_tokens" ||
    normalized === "max_tokens_reached" ||
    normalized === "max_output_tokens"
  ) {
    return { rawReason, kind: "limit", limit: limit ?? "unknown" };
  }
  if (
    normalized === "content_filter" ||
    normalized === "safety" ||
    normalized === "blocked" ||
    normalized === "refusal" ||
    normalized === "recitation" ||
    normalized === "prohibited_content" ||
    normalized === "spii" ||
    normalized === "blocklist"
  ) {
    return { rawReason, kind: "content_filter" };
  }
  if (
    normalized === "tool_calls" ||
    normalized === "tool_call" ||
    normalized === "tool_use" ||
    normalized === "function_call"
  ) {
    return { rawReason, kind: "tool_call" };
  }

  return { rawReason, kind: "other" };
}
