import {
  createProviderOutputAccounting,
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

  it("creates provider-output accounting only from sound direct evidence", () => {
    expect(
      createProviderOutputAccounting({
        source: { completion_tokens: 7 },
        directFields: ["completion_tokens"],
        choiceCount: 1,
        hasGeneratedOutput: true,
        reasoning: "included_native",
      })
    ).toEqual({
      tokens: 7,
      method: "exact",
      source: "provider",
      reasoning: "included_native",
    });

    for (const value of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        createProviderOutputAccounting({
          source: { completion_tokens: value },
          directFields: ["completion_tokens"],
          choiceCount: 1,
          hasGeneratedOutput: false,
          reasoning: "unknown",
        })
      ).toBeUndefined();
    }
  });

  it("rejects aggregate, impossible-zero, and incomplete component evidence", () => {
    const base = {
      source: { completion_tokens: 0 },
      directFields: ["completion_tokens"],
      choiceCount: 1,
      hasGeneratedOutput: true,
      reasoning: "included_native" as const,
    };
    expect(createProviderOutputAccounting(base)).toBeUndefined();
    expect(
      createProviderOutputAccounting({
        ...base,
        source: { completion_tokens: 5 },
        choiceCount: 2,
      })
    ).toBeUndefined();
    expect(
      createProviderOutputAccounting({
        source: { candidatesTokenCount: 4 },
        componentFields: ["candidatesTokenCount", "thoughtsTokenCount"],
        choiceCount: 1,
        hasGeneratedOutput: true,
        reasoning: "included_native",
      })
    ).toBeUndefined();
  });

  it("sums complete provider components and permits a truthful empty zero", () => {
    expect(
      createProviderOutputAccounting({
        source: { candidatesTokenCount: 4, thoughtsTokenCount: 3 },
        componentFields: ["candidatesTokenCount", "thoughtsTokenCount"],
        choiceCount: 1,
        hasGeneratedOutput: true,
        reasoning: "included_native",
      })
    ).toMatchObject({ tokens: 7, source: "provider", method: "exact" });
    expect(
      createProviderOutputAccounting({
        source: { completion_tokens: 0 },
        directFields: ["completion_tokens"],
        choiceCount: 1,
        hasGeneratedOutput: false,
        reasoning: "excluded",
      })
    ).toMatchObject({ tokens: 0, reasoning: "excluded" });
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
