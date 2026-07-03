// AI Summary: Shared mapper for OpenAI-shaped chat-completions logprobs payloads.
// Used by the OpenAI, OpenRouter and llama.cpp adapters (identical wire shape).

import type { TokenLogprob } from "../../llm/types";

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
export function mapOpenAIChatLogprobs(logprobs: any): TokenLogprob[] | undefined {
  const content = logprobs?.content;
  if (!Array.isArray(content) || content.length === 0) {
    return undefined;
  }

  return content.map((entry: any) => ({
    token: entry.token,
    logprob: entry.logprob,
    ...(Array.isArray(entry.top_logprobs) &&
      entry.top_logprobs.length > 0 && {
        topLogprobs: entry.top_logprobs.map((alt: any) => ({
          token: alt.token,
          logprob: alt.logprob,
        })),
      }),
  }));
}
