// AI Summary: Shared mapper for OpenAI-shaped chat-completions logprobs payloads.
// Used by the OpenAI, OpenRouter and llama.cpp adapters (identical wire shape).

import type { TokenLogprob } from "../../llm/types";

const LOGPROB_POSITIVE_EPSILON = 1e-6;

interface UnknownRecord {
  [key: string]: unknown;
}

/**
 * Maps an OpenAI-shaped chat-completions logprobs payload
 * (`choice.logprobs.content[].{token, logprob, top_logprobs[]}`) to the
 * library's normalized {@link TokenLogprob} array.
 *
 * llama-server's chat endpoint produces the same shape, so this mapper is
 * shared across the OpenAI-SDK-based adapters.
 *
 * @param logprobs - The raw `choice.logprobs` object from the provider response
 * @returns Normalized token logprobs, or undefined when absent/empty
 */
export function mapOpenAIChatLogprobs(logprobs: unknown): TokenLogprob[] | undefined {
  if (!isRecord(logprobs)) {
    return undefined;
  }

  const content = logprobs.content;
  if (!Array.isArray(content) || content.length === 0) {
    return undefined;
  }

  const mapped = content.flatMap((entry): TokenLogprob[] => {
    if (!isRecord(entry) || typeof entry.token !== "string") {
      return [];
    }

    const logprob = normalizeLogprob(entry.logprob);
    if (logprob === undefined) {
      return [];
    }

    const topLogprobs = Array.isArray(entry.top_logprobs)
      ? entry.top_logprobs.flatMap((alternative): Array<{ token: string; logprob: number }> => {
          if (!isRecord(alternative) || typeof alternative.token !== "string") {
            return [];
          }
          const alternativeLogprob = normalizeLogprob(alternative.logprob);
          return alternativeLogprob === undefined
            ? []
            : [{ token: alternative.token, logprob: alternativeLogprob }];
        })
      : [];

    return [{
      token: entry.token,
      logprob,
      ...(topLogprobs.length > 0 && { topLogprobs }),
    }];
  });

  return mapped.length > 0 ? mapped : undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
