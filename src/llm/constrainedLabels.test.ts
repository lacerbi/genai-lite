import {
  extractSingleTokenLabelProbs,
  generateAnswerTokenGrammar,
} from "./constrainedLabels";
import type { TokenLogprob } from "./types";

function evidence(
  sampledToken: string,
  sampledProbability: number,
  alternatives: Array<[string, number]>
): TokenLogprob {
  return {
    token: sampledToken,
    logprob: Math.log(sampledProbability),
    topLogprobs: alternatives.map(([token, probability]) => ({
      token,
      logprob: probability === 0 ? Number.NEGATIVE_INFINITY : Math.log(probability),
    })),
  };
}

describe("generateAnswerTokenGrammar", () => {
  it("generates ordered grammar with optional leading space and no accepted newline", () => {
    expect(generateAnswerTokenGrammar(["yes", "no"])).toBe(
      'root ::= " "? answer\nanswer ::= "yes" | "no"\n'
    );
  });

  it("escapes quotes and backslashes", () => {
    expect(generateAnswerTokenGrammar(['a"b', "c\\d"])).toBe(
      'root ::= " "? answer\nanswer ::= "a\\"b" | "c\\\\d"\n'
    );
  });

  it("preserves valid Unicode labels", () => {
    expect(generateAnswerTokenGrammar(["sí", "いいえ", "😀"])).toContain(
      'answer ::= "sí" | "いいえ" | "😀"'
    );
  });
});

describe("constrained-label validation", () => {
  const invalidLabelSets: Array<[string, readonly string[]]> = [
    ["empty array", []],
    ["empty label", [""]],
    ["duplicate", ["yes", "yes"]],
    ["whitespace only", ["   "]],
    ["leading whitespace", [" yes"]],
    ["trailing whitespace", ["yes "]],
    ["control character", ["yes\n"]],
    ["line separator", ["yes\u2028no"]],
    ["unpaired high surrogate", ["yes\ud800"]],
    ["unpaired low surrogate", ["yes\udc00"]],
    ["strict prefix", ["a", "ab"]],
  ];

  it.each(invalidLabelSets)("rejects %s labels", (_name, labels) => {
    expect(() => generateAnswerTokenGrammar(labels)).toThrow();
    expect(() => extractSingleTokenLabelProbs(labels, undefined)).toThrow();
  });

  it("rejects strict prefixes before a shorter terminal can steal longer-label mass", () => {
    expect(() =>
      extractSingleTokenLabelProbs(
        ["a", "ab"],
        evidence(" a", 0.6, [[" a", 0.6], [" ab", 0.4]])
      )
    ).toThrow("Strict-prefix labels");
  });

  it("rejects strict prefixes before a trie terminal can also expose descendants", () => {
    expect(() =>
      extractSingleTokenLabelProbs(
        ["no", "nobody"],
        evidence(" no", 0.7, [[" no", 0.7], [" nobody", 0.3]])
      )
    ).toThrow("Strict-prefix labels");
  });

  it("allows shared non-terminal prefixes", () => {
    expect(() => generateAnswerTokenGrammar(["answer_one", "answer_two"])).not.toThrow();
  });

  it("validates the ambiguity gap", () => {
    const tokenLogprob = evidence("yes", 1, [["yes", 1]]);
    expect(() =>
      extractSingleTokenLabelProbs(["yes"], tokenLogprob, {
        ambiguityLogprobGap: -1,
      })
    ).toThrow("ambiguityLogprobGap");
    expect(() =>
      extractSingleTokenLabelProbs(["yes"], tokenLogprob, {
        ambiguityLogprobGap: Number.POSITIVE_INFINITY,
      })
    ).toThrow("ambiguityLogprobGap");
  });
});

describe("extractSingleTokenLabelProbs", () => {
  it("combines bare and space-prefixed alternatives under one label", () => {
    const result = extractSingleTokenLabelProbs(
      ["yes", "no"],
      evidence("yes", 0.3, [
        ["yes", 0.3],
        [" yes", 0.2],
        ["no", 0.1],
        ["other", 0.1],
      ])
    );

    expect(result.status).toBe("ok");
    expect(result.absoluteLabelProbs.yes).toBeCloseTo(0.5);
    expect(result.absoluteLabelProbs.no).toBeCloseTo(0.1);
    expect(result.conditionalLabelProbs.yes).toBeCloseTo(5 / 6);
    expect(result.conditionalLabelProbs.no).toBeCloseTo(1 / 6);
    expect(result.residualMass).toBeCloseTo(0.4);
    expect(result.ambiguousMass).toBe(0);
  });

  it("attributes a partial token when exactly one label is reachable", () => {
    const result = extractSingleTokenLabelProbs(
      ["answer"],
      evidence(" ans", 0.8, [[" ans", 0.8]])
    );

    expect(result.status).toBe("ok");
    expect(result.absoluteLabelProbs.answer).toBeCloseTo(0.8);
    expect(result.conditionalLabelProbs.answer).toBe(1);
  });

  it("combines duplicate decoded strings with log-sum-exp", () => {
    const result = extractSingleTokenLabelProbs(
      ["yes", "no"],
      evidence("yes", 0.2, [
        ["yes", 0.2],
        ["yes", 0.3],
        ["no", 0.1],
      ])
    );

    expect(result.absoluteLabelProbs.yes).toBeCloseTo(0.5);
    expect(result.absoluteLabelProbs.no).toBeCloseTo(0.1);
    expect(result.residualMass).toBeCloseTo(0.4);
  });

  it("includes sampled-token mass when absent from alternatives", () => {
    const result = extractSingleTokenLabelProbs(
      ["yes", "no"],
      evidence("yes", 0.4, [["no", 0.3]])
    );

    expect(result.absoluteLabelProbs.yes).toBeCloseTo(0.4);
    expect(result.absoluteLabelProbs.no).toBeCloseTo(0.3);
    expect(result.residualMass).toBeCloseTo(0.3);
  });

  it("does not double-count sampled-token mass already present", () => {
    const result = extractSingleTokenLabelProbs(
      ["yes", "no"],
      evidence("yes", 0.4, [
        ["yes", 0.4],
        ["no", 0.3],
      ])
    );

    expect(result.absoluteLabelProbs.yes).toBeCloseTo(0.4);
    expect(result.residualMass).toBeCloseTo(0.3);
  });

  it("reports negligible aggregate shared-prefix mass while remaining usable", () => {
    const result = extractSingleTokenLabelProbs(
      ["answer_one", "answer_two"],
      evidence("answer_one", 0.9, [
        ["answer_one", 0.9],
        [" answer", 0.001],
        ["other", 0.099],
      ])
    );

    expect(result.status).toBe("ok");
    expect(result.ambiguousMass).toBeCloseTo(0.001);
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.9);
  });

  it("returns ambiguous_prefix for significant shared-prefix mass", () => {
    const result = extractSingleTokenLabelProbs(
      ["answer_one", "answer_two"],
      evidence(" answer", 0.5, [
        [" answer", 0.5],
        ["answer_one", 0.3],
        ["answer_two", 0.2],
      ])
    );

    expect(result.status).toBe("ambiguous_prefix");
    expect(result.ambiguousMass).toBeCloseTo(0.5);
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.3);
    expect(result.absoluteLabelProbs.answer_two).toBeCloseTo(0.2);
  });

  it("uses aggregate ambiguous mass for the gap decision", () => {
    const result = extractSingleTokenLabelProbs(
      ["answer_one", "answer_two"],
      evidence("answer_one", 0.6, [
        ["answer_one", 0.6],
        ["answer", 0.003],
        [" answer", 0.003],
        ["other", 0.394],
      ])
    );

    expect(result.ambiguousMass).toBeCloseTo(0.006);
    expect(result.status).toBe("ambiguous_prefix");
  });

  it("returns missing_alternatives with zero vectors and full residual", () => {
    const result = extractSingleTokenLabelProbs(["yes", "no"], {
      token: "yes",
      logprob: Math.log(0.8),
    });

    expect(result).toMatchObject({
      status: "missing_alternatives",
      absoluteLabelProbs: { yes: 0, no: 0 },
      conditionalLabelProbs: { yes: 0, no: 0 },
      ambiguousMass: 0,
      residualMass: 1,
    });
  });

  it("returns no_matching_tokens for wholly off-label evidence", () => {
    const result = extractSingleTokenLabelProbs(
      ["yes", "no"],
      evidence("maybe", 0.8, [["maybe", 0.8]])
    );

    expect(result).toMatchObject({
      status: "no_matching_tokens",
      absoluteLabelProbs: { yes: 0, no: 0 },
      conditionalLabelProbs: { yes: 0, no: 0 },
      ambiguousMass: 0,
      residualMass: 1,
    });
  });

  it("returns invalid_evidence for materially overfull mass", () => {
    const result = extractSingleTokenLabelProbs(
      ["yes", "no"],
      evidence("yes", 0.7, [
        ["yes", 0.7],
        ["no", 0.4],
      ])
    );

    expect(result).toMatchObject({
      status: "invalid_evidence",
      absoluteLabelProbs: { yes: 0, no: 0 },
      conditionalLabelProbs: { yes: 0, no: 0 },
      ambiguousMass: 0,
      residualMass: 1,
    });
  });

  it("scales a floating-point overage within tolerance", () => {
    const result = extractSingleTokenLabelProbs(
      ["yes", "no"],
      evidence("yes", 0.50000025, [
        ["yes", 0.50000025],
        ["no", 0.50000025],
      ])
    );

    expect(result.status).toBe("ok");
    expect(result.absoluteLabelProbs.yes).toBeCloseTo(0.5);
    expect(result.absoluteLabelProbs.no).toBeCloseTo(0.5);
    expect(result.residualMass).toBeCloseTo(0);
  });

  it("clamps tiny positive logprob drift to zero", () => {
    const result = extractSingleTokenLabelProbs(["yes"], {
      token: "yes",
      logprob: 1e-7,
      topLogprobs: [{ token: "yes", logprob: 1e-7 }],
    });

    expect(result.status).toBe("ok");
    expect(result.absoluteLabelProbs.yes).toBe(1);
  });

  it("excludes materially positive logprobs without producing NaN", () => {
    const result = extractSingleTokenLabelProbs(["yes"], {
      token: "yes",
      logprob: 0.01,
      topLogprobs: [{ token: "yes", logprob: 0.01 }],
    });

    expect(result.status).toBe("invalid_evidence");
    expect(Number.isNaN(result.residualMass)).toBe(false);
  });

  it("treats negative infinity as zero mass", () => {
    const result = extractSingleTokenLabelProbs(["yes"], {
      token: "yes",
      logprob: Number.NEGATIVE_INFINITY,
      topLogprobs: [{ token: "yes", logprob: Number.NEGATIVE_INFINITY }],
    });

    expect(result.status).toBe("no_matching_tokens");
    expect(result.residualMass).toBe(1);
  });

  it("safely materializes prototype-like label keys", () => {
    const result = extractSingleTokenLabelProbs(
      ["__proto__", "constructor"],
      evidence("__proto__", 0.6, [
        ["__proto__", 0.6],
        ["constructor", 0.3],
      ])
    );

    expect(Object.prototype.hasOwnProperty.call(result.absoluteLabelProbs, "__proto__")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result.absoluteLabelProbs, "constructor")).toBe(true);
    expect(result.absoluteLabelProbs.__proto__).toBeCloseTo(0.6);
  });

  it("defensively snapshots raw evidence", () => {
    const source = evidence("yes", 0.7, [["yes", 0.7]]);
    const result = extractSingleTokenLabelProbs(["yes"], source);

    source.token = "changed";
    source.topLogprobs![0].token = "changed";

    expect(result.rawTokenLogprob).toEqual({
      token: "yes",
      logprob: Math.log(0.7),
      topLogprobs: [{ token: "yes", logprob: Math.log(0.7) }],
    });
  });

  it("demonstrates the full-distribution precondition for residual mass", () => {
    const fullDistribution = extractSingleTokenLabelProbs(
      ["yes", "no"],
      evidence("yes", 0.6, [
        ["yes", 0.6],
        ["no", 0.3],
      ])
    );
    const renormalizedTopN = extractSingleTokenLabelProbs(
      ["yes", "no"],
      evidence("yes", 2 / 3, [
        ["yes", 2 / 3],
        ["no", 1 / 3],
      ])
    );

    expect(fullDistribution.residualMass).toBeCloseTo(0.1);
    expect(renormalizedTopN.residualMass).toBeCloseTo(0);
  });
});
