import { AnthropicClientAdapter } from "./AnthropicClientAdapter";
import { GeminiClientAdapter } from "./GeminiClientAdapter";
import { LlamaCppClientAdapter } from "./LlamaCppClientAdapter";
import { MistralClientAdapter } from "./MistralClientAdapter";
import { MockClientAdapter } from "./MockClientAdapter";
import { OpenAIClientAdapter } from "./OpenAIClientAdapter";
import { OpenRouterClientAdapter } from "./OpenRouterClientAdapter";
import type { InternalLLMChatRequest } from "./types";
import type { LLMSettings } from "../types";

function request(providerId: string): InternalLLMChatRequest {
  return {
    providerId,
    modelId: "test-model",
    messages: [{ role: "user", content: "hello" }],
    settings: {
      maxTokens: 128,
      stopSequences: [],
      temperature: 0,
    } as unknown as Required<LLMSettings>,
  };
}

describe("built-in accounting evidence", () => {
  it("OpenAI retains raw content, raw termination, and provider usage evidence", () => {
    const response = (new OpenAIClientAdapter() as any).createSuccessResponse(
      {
        id: "id",
        model: "model",
        created: 1,
        choices: [{
          index: 0,
          finish_reason: "length",
          message: { role: "assistant", content: " raw " },
        }],
        usage: { prompt_tokens: 0, completion_tokens: 2, total_tokens: 2 },
      },
      request("openai")
    );

    expect(response.choices[0]).toMatchObject({
      rawContent: " raw ",
      termination: {
        rawReason: "length",
        kind: "limit",
        limit: "unknown",
      },
    });
    expect(response.usage).toEqual({
      prompt_tokens: 0,
      completion_tokens: 2,
      total_tokens: 2,
    });
    expect(response.usageEvidence.prompt_tokens.source).toBe("provider");
  });

  it("OpenRouter preserves absent usage and raw finish reason", () => {
    const response = (new OpenRouterClientAdapter() as any).createSuccessResponse(
      {
        id: "id",
        model: "model",
        created: 1,
        choices: [{
          index: 0,
          finish_reason: "tool_calls",
          message: { role: "assistant", content: "" },
        }],
      },
      request("openrouter")
    );

    expect(response.usage).toBeUndefined();
    expect(response.choices[0].termination).toEqual({
      rawReason: "tool_calls",
      kind: "tool_call",
    });
  });

  it("Anthropic keeps ordered raw parts and presence-aware usage", () => {
    const response = (new AnthropicClientAdapter() as any).createSuccessResponse(
      {
        id: "id",
        model: "model",
        stop_reason: "max_tokens",
        content: [
          { type: "thinking", thinking: "reason" },
          { type: "text", text: "answer" },
        ],
        usage: { input_tokens: 0 },
      },
      request("anthropic")
    );

    expect(response.usage).toEqual({ prompt_tokens: 0 });
    expect(response.choices[0]).toMatchObject({
      rawContent: "answer",
      rawContentParts: [
        { type: "thinking", text: "reason", reasoning: true },
        { type: "text", text: "answer" },
      ],
      finish_reason: "length",
      termination: {
        rawReason: "max_tokens",
        kind: "limit",
        limit: "output",
      },
    });
  });

  it("Gemini never fabricates missing usage and preserves zero", () => {
    const adapter = new GeminiClientAdapter() as any;
    const withoutUsage = adapter.createSuccessResponse(
      {
        candidates: [{
          finishReason: "STOP",
          content: { parts: [{ text: "answer" }] },
        }],
      },
      request("gemini")
    );
    const withZero = adapter.createSuccessResponse(
      {
        candidates: [{
          finishReason: "MAX_TOKENS",
          content: {
            parts: [
              { text: "thought", thought: true },
              { text: "answer" },
            ],
          },
        }],
        usageMetadata: { promptTokenCount: 0 },
      },
      request("gemini")
    );

    expect(withoutUsage.usage).toBeUndefined();
    expect(withZero.usage).toEqual({ prompt_tokens: 0 });
    expect(withZero.choices[0].termination).toEqual({
      rawReason: "MAX_TOKENS",
      kind: "limit",
      limit: "output",
    });
    expect(withZero.choices[0].rawContentParts).toEqual([
      {
        type: "thought",
        text: "thought",
        reasoning: true,
        value: { text: "thought", thought: true },
      },
      {
        type: "text",
        text: "answer",
        value: { text: "answer" },
      },
    ]);
  });

  it("preserves non-text provider parts as detached JSON-safe values", () => {
    const anthropic = (new AnthropicClientAdapter() as any)
      .createSuccessResponse(
        {
          id: "id",
          model: "model",
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "calling" },
            {
              type: "tool_use",
              id: "tool-1",
              name: "lookup",
              input: { city: "Paris" },
            },
          ],
        },
        request("anthropic")
      );
    const gemini = (new GeminiClientAdapter() as any)
      .createSuccessResponse(
        {
          candidates: [{
            finishReason: "STOP",
            content: {
              parts: [{
                functionCall: {
                  name: "lookup",
                  args: { city: "Paris" },
                },
              }],
            },
          }],
        },
        request("gemini")
      );

    expect(anthropic.choices[0].rawContentParts[1]).toMatchObject({
      type: "tool_use",
      value: {
        id: "tool-1",
        name: "lookup",
        input: { city: "Paris" },
      },
    });
    expect(gemini.choices[0].rawContentParts[0]).toEqual({
      type: "functionCall",
      value: {
        functionCall: {
          name: "lookup",
          args: { city: "Paris" },
        },
      },
    });
  });

  it("Mistral preserves missing usage and unknown termination", () => {
    const adapter = new MistralClientAdapter() as any;
    const absent = adapter.createSuccessResponse(
      {
        id: "id",
        choices: [{ message: { content: "answer" } }],
      },
      request("mistral")
    );
    const zero = adapter.createSuccessResponse(
      {
        id: "id",
        choices: [{ message: { content: "answer" }, finishReason: "stop" }],
        usage: { promptTokens: 0 },
      },
      request("mistral")
    );

    expect(absent.usage).toBeUndefined();
    expect(absent.choices[0]).toMatchObject({
      finish_reason: null,
      termination: { rawReason: null, kind: "unknown" },
    });
    expect(zero.usage).toEqual({ prompt_tokens: 0 });
  });

  it("labels Mistral native structured output as JSON-only", async () => {
    const internal = request("mistral");
    internal.settings.structuredOutput = {
      name: "answer",
      schema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
      },
      delivery: "native",
    };
    const result = await new MistralClientAdapter().prepareRequest(
      internal,
      {
        mode: "complete",
        modelInfo: {} as any,
      }
    );

    expect(result).toMatchObject({
      prepared: {
        requestView: {
          structuredOutput: {
            delivery: "native",
            enforcement: "json_only",
          },
        },
      },
    });
    if ("prepared" in result) {
      expect(result.prepared.requestView.structuredOutput?.schema)
        .toBeUndefined();
      expect(result.prepared.requestView.settings.responseFormat).toEqual({
        type: "json_object",
      });
    }
  });

  it("llama.cpp keeps content before local cleanup", () => {
    const raw = "<think>\n\n</think>\n\nanswer";
    const response = (new LlamaCppClientAdapter() as any).createSuccessResponse(
      {
        id: "id",
        model: "model",
        created: 1,
        choices: [{
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: raw },
        }],
      },
      request("llamacpp"),
      {
        localReasoning: {
          nothinkPrefix: "<think>\n\n</think>\n\n",
        },
      }
    );

    expect(response.choices[0].rawContent).toBe(raw);
    expect(response.choices[0].message.content).toBe("answer");
  });

  it("Mock retains legacy usage while labeling it heuristic", async () => {
    const response = await (
      new MockClientAdapter("mock") as any
    ).createSuccessResponse(request("mock"), "hello", "hello");

    expect(response.usage).toBeDefined();
    expect(response.usageEvidence).toEqual({
      prompt_tokens: { source: "heuristic" },
      completion_tokens: { source: "heuristic" },
      total_tokens: { source: "heuristic" },
    });
    expect(response.choices[0].rawAnswerAccounting.method).toBe("heuristic");
  });

  it("keeps normalized filtering aligned with provider-native reasons", () => {
    const anthropic = (new AnthropicClientAdapter() as any)
      .createSuccessResponse(
        {
          id: "id",
          model: "model",
          stop_reason: "refusal",
          content: [{ type: "text", text: "declined" }],
        },
        request("anthropic")
      );
    const gemini = (new GeminiClientAdapter() as any)
      .createSuccessResponse(
        {
          candidates: [{
            finishReason: "RECITATION",
            content: { parts: [{ text: "blocked" }] },
          }],
        },
        request("gemini")
      );

    expect(anthropic.choices[0]).toMatchObject({
      finish_reason: "content_filter",
      termination: { rawReason: "refusal", kind: "content_filter" },
    });
    expect(gemini.choices[0]).toMatchObject({
      finish_reason: "content_filter",
      termination: { rawReason: "RECITATION", kind: "content_filter" },
    });
  });

  it("reports mock max-token truncation as an ambiguous length limit", async () => {
    const internal = request("mock");
    internal.settings.maxTokens = 4;
    const response = await new MockClientAdapter("mock").sendMessage(
      internal,
      "unused"
    );

    expect(response.object).toBe("chat.completion");
    if (response.object === "chat.completion") {
      expect(response.choices[0]).toMatchObject({
        finish_reason: "length",
        termination: {
          rawReason: "length",
          kind: "limit",
          limit: "unknown",
        },
      });
    }
  });
});
