import { mapOpenAIChatLogprobs } from "./logprobsUtils";

describe("mapOpenAIChatLogprobs", () => {
  it.each([undefined, null, {}, { content: null }, { content: [] }])(
    "returns undefined for absent or empty payload %#",
    (payload) => {
      expect(mapOpenAIChatLogprobs(payload)).toBeUndefined();
    }
  );

  it("maps valid OpenAI-shaped content", () => {
    expect(mapOpenAIChatLogprobs({
      content: [
        {
          token: "yes",
          logprob: -0.2,
          bytes: [121, 101, 115],
          top_logprobs: [
            { token: "yes", logprob: -0.2 },
            { token: "no", logprob: -1.8 },
          ],
        },
      ],
    })).toEqual([
      {
        token: "yes",
        logprob: -0.2,
        topLogprobs: [
          { token: "yes", logprob: -0.2 },
          { token: "no", logprob: -1.8 },
        ],
      },
    ]);
  });

  it("filters malformed entries and alternatives independently", () => {
    expect(mapOpenAIChatLogprobs({
      content: [
        null,
        { token: 42, logprob: -0.1 },
        { token: "bad", logprob: Number.NaN },
        {
          token: "yes",
          logprob: -0.2,
          top_logprobs: [
            { token: "yes", logprob: -0.2 },
            { token: 42, logprob: -0.4 },
            { token: "bad", logprob: Number.POSITIVE_INFINITY },
          ],
        },
      ],
    })).toEqual([
      {
        token: "yes",
        logprob: -0.2,
        topLogprobs: [{ token: "yes", logprob: -0.2 }],
      },
    ]);
  });

  it("omits topLogprobs when no alternatives are valid", () => {
    expect(mapOpenAIChatLogprobs({
      content: [{
        token: "yes",
        logprob: -0.2,
        top_logprobs: [{ token: "bad", logprob: 0.1 }],
      }],
    })).toEqual([{ token: "yes", logprob: -0.2 }]);
  });

  it("returns undefined when every content entry is malformed", () => {
    expect(mapOpenAIChatLogprobs({
      content: [
        { token: "yes", logprob: Number.NaN },
        { token: "no", logprob: Number.POSITIVE_INFINITY },
      ],
    })).toBeUndefined();
  });

  it("preserves negative infinity as zero-mass evidence", () => {
    expect(mapOpenAIChatLogprobs({
      content: [{ token: "yes", logprob: Number.NEGATIVE_INFINITY }],
    })).toEqual([{ token: "yes", logprob: Number.NEGATIVE_INFINITY }]);
  });

  it("clamps tiny positive drift and rejects material positive values", () => {
    expect(mapOpenAIChatLogprobs({
      content: [
        { token: "tiny", logprob: 1e-7 },
        { token: "material", logprob: 1e-3 },
      ],
    })).toEqual([{ token: "tiny", logprob: 0 }]);
  });

  it("returns defensive copies", () => {
    const payload = {
      content: [{
        token: "yes",
        logprob: -0.2,
        top_logprobs: [{ token: "yes", logprob: -0.2 }],
      }],
    };
    const mapped = mapOpenAIChatLogprobs(payload)!;

    payload.content[0].token = "changed";
    payload.content[0].top_logprobs[0].token = "changed";

    expect(mapped).toEqual([{
      token: "yes",
      logprob: -0.2,
      topLogprobs: [{ token: "yes", logprob: -0.2 }],
    }]);
  });
});
