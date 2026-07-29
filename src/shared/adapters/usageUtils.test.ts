import {
  mergeUsageRecords,
  normalizeTermination,
  normalizeUsage,
} from "./usageUtils";

const aliases = {
  prompt: ["promptTokens", "prompt_tokens"],
  completion: ["completionTokens", "completion_tokens"],
  total: ["totalTokens", "total_tokens"],
} as const;

describe("usageUtils", () => {
  it("preserves absence instead of fabricating zero", () => {
    expect(normalizeUsage(undefined, aliases)).toEqual({});
    expect(normalizeUsage({}, aliases)).toEqual({});
    expect(normalizeUsage({ unrelated: 2 }, aliases)).toEqual({});
  });

  it("preserves explicit zero and the selected provider alias", () => {
    expect(
      normalizeUsage(
        {
          promptTokens: 0,
          prompt_tokens: 9,
          completion_tokens: 0,
          total_tokens: 0,
        },
        aliases
      )
    ).toEqual({
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      usageEvidence: {
        prompt_tokens: {
          source: "provider",
          providerField: "promptTokens",
        },
        completion_tokens: {
          source: "provider",
          providerField: "completion_tokens",
        },
        total_tokens: {
          source: "provider",
          providerField: "total_tokens",
        },
      },
    });
  });

  it("derives total only when both operands are present", () => {
    expect(normalizeUsage({ promptTokens: 4 }, aliases).usage).toEqual({
      prompt_tokens: 4,
    });
    expect(
      normalizeUsage(
        { promptTokens: 4, completionTokens: 6 },
        aliases
      )
    ).toEqual({
      usage: {
        prompt_tokens: 4,
        completion_tokens: 6,
        total_tokens: 10,
      },
      usageEvidence: {
        prompt_tokens: {
          source: "provider",
          providerField: "promptTokens",
        },
        completion_tokens: {
          source: "provider",
          providerField: "completionTokens",
        },
        total_tokens: { source: "derived" },
      },
    });
  });

  it("merges streaming fragments without zero-filling", () => {
    expect(
      mergeUsageRecords(
        { input_tokens: 5 },
        { output_tokens: 0 }
      )
    ).toEqual({ input_tokens: 5, output_tokens: 0 });
    expect(
      mergeUsageRecords(
        { input_tokens: 5, output_tokens: 2 },
        { input_tokens: undefined, output_tokens: Number.NaN }
      )
    ).toEqual({ input_tokens: 5, output_tokens: 2 });
  });

  it("retains raw termination and keeps generic limits ambiguous", () => {
    expect(normalizeTermination("length")).toEqual({
      rawReason: "length",
      kind: "limit",
      limit: "unknown",
    });
    expect(normalizeTermination("max_tokens", "output")).toEqual({
      rawReason: "max_tokens",
      kind: "limit",
      limit: "output",
    });
    expect(normalizeTermination(undefined)).toEqual({
      rawReason: null,
      kind: "unknown",
    });
    expect(normalizeTermination("tool_use")).toEqual({
      rawReason: "tool_use",
      kind: "tool_call",
    });
  });
});
