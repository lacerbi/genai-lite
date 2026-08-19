import {
  extractSingleTokenLabelProbs,
  generateSuffixGrammar,
  resolveLabelProbsWithSuffixWalk,
  resolveLabelProbsWithSuffixWalkAsync,
} from "./constrainedLabels";
import type {
  SingleTokenLabelProbExtraction,
  SuffixWalkFetchRequest,
  SuffixWalkLabelProbExtraction,
  SuffixWalkLabelProbOptions,
} from "./constrainedLabels";
import type { TokenLogprob } from "./types";

const SHARED_PREFIX_LABELS = ["answer_one", "answer_two"] as const;
/** Mirrors the library's documented default fetch budget. */
const DEFAULT_MAX_FETCHES = 8;

function evidence(
  sampledToken: string,
  sampledProbability: number,
  alternatives: Array<[string, number]>
): TokenLogprob {
  return {
    token: sampledToken,
    logprob: sampledProbability === 0 ? Number.NEGATIVE_INFINITY : Math.log(sampledProbability),
    topLogprobs: alternatives.map(([token, probability]) => ({
      token,
      logprob: probability === 0 ? Number.NEGATIVE_INFINITY : Math.log(probability),
    })),
  };
}

/** Position-0 evidence that leaves 0.5 ambiguous on the shared ` answer` prefix. */
function ambiguousPositionZero(): TokenLogprob {
  return evidence(" answer", 0.5, [
    [" answer", 0.5],
    ["answer_one", 0.3],
    ["other", 0.1],
  ]);
}

function ambiguousExtraction(
  labels: readonly string[] = SHARED_PREFIX_LABELS,
  tokenLogprob: TokenLogprob = ambiguousPositionZero()
): SingleTokenLabelProbExtraction {
  const extraction = extractSingleTokenLabelProbs(labels, tokenLogprob);
  expect(extraction.status).toBe("ambiguous_prefix");
  return extraction;
}

/** Records every request and replays a queued response per call. */
function recordingFetcher(
  responses: Array<TokenLogprob | undefined>
): {
  requests: SuffixWalkFetchRequest[];
  fetch: (request: SuffixWalkFetchRequest) => TokenLogprob | undefined;
} {
  const requests: SuffixWalkFetchRequest[] = [];
  let index = 0;
  return {
    requests,
    fetch: (request) => {
      requests.push(request);
      if (index >= responses.length) {
        throw new Error(
          `fetcher called ${index + 1} times but only ${responses.length} responses were queued`
        );
      }
      const response = responses[index];
      index += 1;
      return response;
    },
  };
}

/** Answers each request by splitting evenly across the next reachable characters. */
function splittingFetcher(requests: SuffixWalkFetchRequest[]) {
  return (request: SuffixWalkFetchRequest): TokenLogprob => {
    requests.push(request);
    const firstCharacters: string[] = [];
    for (const suffix of request.suffixes) {
      const character = Array.from(suffix)[0];
      if (!firstCharacters.includes(character)) {
        firstCharacters.push(character);
      }
    }
    const share = 1 / firstCharacters.length;
    return {
      token: firstCharacters[0],
      logprob: Math.log(share),
      topLogprobs: firstCharacters.map((token) => ({
        token,
        logprob: Math.log(share),
      })),
    };
  };
}

function sumValues(record: Record<string, number>): number {
  return Object.values(record).reduce((total, value) => total + value, 0);
}

function expectConservedMass(
  result: SuffixWalkLabelProbExtraction,
  maxFetches = DEFAULT_MAX_FETCHES
): void {
  const attributed = sumValues(result.absoluteLabelProbs);
  expect(attributed + result.ambiguousMass + result.residualMass).toBeCloseTo(1, 9);
  expect(sumValues(result.conditionalLabelProbs)).toBeCloseTo(
    attributed > 0 ? 1 : 0,
    9
  );
  expect(result.fetchCount).toBeLessThanOrEqual(maxFetches);
  // A rejected or budget-capped walk must never report an empty frontier.
  if (result.termination === "complete") {
    expect(result.ambiguousMass).toBe(0);
  } else if (result.termination !== "not_started") {
    expect(result.ambiguousMass).toBeGreaterThan(0);
  }
}

/**
 * Drives one fixture through both resolvers and asserts they agree on the
 * result and on the emitted request sequence.
 */
async function resolveBothWays(
  labels: readonly string[],
  initial: SingleTokenLabelProbExtraction,
  responses: Array<TokenLogprob | undefined>,
  options?: SuffixWalkLabelProbOptions
): Promise<{
  result: SuffixWalkLabelProbExtraction;
  requests: SuffixWalkFetchRequest[];
}> {
  const before = JSON.stringify(initial);
  const sync = recordingFetcher(responses);
  const syncResult = resolveLabelProbsWithSuffixWalk(
    labels,
    initial,
    sync.fetch,
    options
  );
  expect(JSON.stringify(initial)).toBe(before);

  const asyncDriver = recordingFetcher(responses);
  const asyncResult = await resolveLabelProbsWithSuffixWalkAsync(
    labels,
    initial,
    async (request) => asyncDriver.fetch(request),
    options
  );

  expect(JSON.stringify(initial)).toBe(before);
  expect(asyncResult).toStrictEqual(syncResult);
  expect(asyncDriver.requests).toEqual(sync.requests);
  expectConservedMass(syncResult, options?.maxFetches ?? DEFAULT_MAX_FETCHES);
  return { result: syncResult, requests: sync.requests };
}

describe("generateSuffixGrammar", () => {
  it("generates an ordered grammar without an optional leading space", () => {
    expect(generateSuffixGrammar(["_one", "_two"])).toBe(
      'root ::= suffix\nsuffix ::= "_one" | "_two"\n'
    );
  });

  it("escapes quotes and backslashes like the answer grammar", () => {
    expect(generateSuffixGrammar(['a"b', "c\\d"])).toBe(
      'root ::= suffix\nsuffix ::= "a\\"b" | "c\\\\d"\n'
    );
  });

  it("preserves valid Unicode fragments", () => {
    expect(generateSuffixGrammar(["í", "いえ", "😀"])).toContain(
      'suffix ::= "í" | "いえ" | "😀"'
    );
  });

  it("preserves required leading whitespace inside fragments", () => {
    expect(generateSuffixGrammar([" one", " two"])).toBe(
      'root ::= suffix\nsuffix ::= " one" | " two"\n'
    );
  });

  const invalidSuffixSets: Array<[string, readonly string[]]> = [
    ["empty array", []],
    ["empty fragment", [""]],
    ["whitespace only", ["   "]],
    ["trailing whitespace", ["one "]],
    ["duplicate", ["_one", "_one"]],
    ["control character", ["_one\n"]],
    ["line separator", ["_one\u2028"]],
    ["unpaired high surrogate", ["_one\ud800"]],
    ["unpaired low surrogate", ["_one\udc00"]],
    ["strict prefix", ["_on", "_one"]],
  ];

  it.each(invalidSuffixSets)("rejects %s fragments", (_name, suffixes) => {
    expect(() => generateSuffixGrammar(suffixes)).toThrow(TypeError);
  });
});

describe("suffix-walk option validation", () => {
  const invalidBudgets: Array<[string, number]> = [
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["infinite", Number.POSITIVE_INFINITY],
    ["not a number", Number.NaN],
  ];

  it.each(invalidBudgets)("rejects a %s maxFetches", (_name, maxFetches) => {
    const initial = ambiguousExtraction();
    expect(() =>
      resolveLabelProbsWithSuffixWalk(SHARED_PREFIX_LABELS, initial, () => undefined, {
        maxFetches,
      })
    ).toThrow("maxFetches");
  });

  it("rejects strict-prefix label sets before any fetch", () => {
    const fetcher = jest.fn();
    expect(() =>
      resolveLabelProbsWithSuffixWalk(
        ["a", "ab"],
        ambiguousExtraction(),
        fetcher
      )
    ).toThrow("Strict-prefix labels");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an invalid ambiguity gap before any fetch", () => {
    const fetcher = jest.fn();
    expect(() =>
      resolveLabelProbsWithSuffixWalk(
        SHARED_PREFIX_LABELS,
        ambiguousExtraction(),
        fetcher,
        { ambiguityLogprobGap: -1 }
      )
    ).toThrow("ambiguityLogprobGap");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("single-position pass-through", () => {
  const passThroughCases: Array<[string, TokenLogprob | undefined]> = [
    [
      "ok",
      evidence("answer_one", 0.8, [
        ["answer_one", 0.8],
        ["answer_two", 0.1],
      ]),
    ],
    [
      "ok with tolerated ambiguous mass",
      evidence("answer_one", 0.9, [
        ["answer_one", 0.9],
        [" answer", 0.001],
        ["other", 0.099],
      ]),
    ],
    ["missing_alternatives", { token: "answer_one", logprob: Math.log(0.8) }],
    ["no_matching_tokens", evidence("maybe", 0.8, [["maybe", 0.8]])],
    [
      "invalid_evidence",
      evidence("answer_one", 0.7, [
        ["answer_one", 0.7],
        ["answer_two", 0.4],
      ]),
    ],
  ];

  it.each(passThroughCases)(
    "copies a %s result without fetching",
    (expectedStatus, tokenLogprob) => {
      const initial = extractSingleTokenLabelProbs(SHARED_PREFIX_LABELS, tokenLogprob);
      expect(initial.status).toBe(
        expectedStatus.startsWith("ok") ? "ok" : expectedStatus
      );

      const fetcher = jest.fn();
      const result = resolveLabelProbsWithSuffixWalk(
        SHARED_PREFIX_LABELS,
        initial,
        fetcher
      );

      expect(fetcher).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        status: initial.status,
        absoluteLabelProbs: initial.absoluteLabelProbs,
        conditionalLabelProbs: initial.conditionalLabelProbs,
        residualMass: initial.residualMass,
        ambiguousMass: initial.ambiguousMass,
        resolution: "single_position",
        termination: "not_started",
        fetchCount: 0,
      });
    }
  );

  it("copies a result that carries no raw evidence", () => {
    const initial: SingleTokenLabelProbExtraction = {
      status: "ok",
      absoluteLabelProbs: { answer_one: 0.6, answer_two: 0.2 },
      conditionalLabelProbs: { answer_one: 0.75, answer_two: 0.25 },
      residualMass: 0.2,
      ambiguousMass: 0,
    };

    const fetcher = jest.fn();
    const result = resolveLabelProbsWithSuffixWalk(
      SHARED_PREFIX_LABELS,
      initial,
      fetcher
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.rawTokenLogprob).toBeUndefined();
    expect("rawTokenLogprob" in result).toBe(false);
    expect(result.resolution).toBe("single_position");
  });

  it("returns records and raw alternatives that do not alias the input", () => {
    const initial = extractSingleTokenLabelProbs(
      SHARED_PREFIX_LABELS,
      evidence("answer_one", 0.8, [
        ["answer_one", 0.8],
        ["answer_two", 0.1],
      ])
    );
    const result = resolveLabelProbsWithSuffixWalk(
      SHARED_PREFIX_LABELS,
      initial,
      () => undefined
    );

    expect(result.absoluteLabelProbs).not.toBe(initial.absoluteLabelProbs);
    expect(result.conditionalLabelProbs).not.toBe(initial.conditionalLabelProbs);
    expect(result.rawTokenLogprob).not.toBe(initial.rawTokenLogprob);
    expect(result.rawTokenLogprob?.topLogprobs).not.toBe(
      initial.rawTokenLogprob?.topLogprobs
    );

    initial.absoluteLabelProbs.answer_one = 42;
    initial.conditionalLabelProbs.answer_one = 42;
    initial.rawTokenLogprob!.token = "mutated";
    initial.rawTokenLogprob!.topLogprobs![0].token = "mutated";

    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.8);
    expect(result.conditionalLabelProbs.answer_one).toBeCloseTo(8 / 9);
    expect(result.rawTokenLogprob?.token).toBe("answer_one");
    expect(result.rawTokenLogprob?.topLogprobs?.[0].token).toBe("answer_one");
  });

  it("short-circuits the asynchronous resolver without awaiting a fetch", async () => {
    const initial = extractSingleTokenLabelProbs(
      SHARED_PREFIX_LABELS,
      evidence("answer_one", 0.8, [
        ["answer_one", 0.8],
        ["answer_two", 0.1],
      ])
    );
    const fetcher = jest.fn();

    const result = await resolveLabelProbsWithSuffixWalkAsync(
      SHARED_PREFIX_LABELS,
      initial,
      fetcher
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "ok",
      resolution: "single_position",
      termination: "not_started",
      fetchCount: 0,
    });
    expect(result.absoluteLabelProbs).not.toBe(initial.absoluteLabelProbs);
  });

  it("trusts a stale non-ambiguous object instead of certifying it", () => {
    const stale: SingleTokenLabelProbExtraction = {
      status: "ok",
      absoluteLabelProbs: { stale_label: 0.5 },
      conditionalLabelProbs: { stale_label: 1 },
      residualMass: 0.5,
      ambiguousMass: 0,
      rawTokenLogprob: ambiguousPositionZero(),
    };

    const fetcher = jest.fn();
    const result = resolveLabelProbsWithSuffixWalk(
      SHARED_PREFIX_LABELS,
      stale,
      fetcher,
      { ambiguityLogprobGap: 0 }
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.absoluteLabelProbs).toEqual({ stale_label: 0.5 });
    expect(result.conditionalLabelProbs).toEqual({ stale_label: 1 });
    expect(result.resolution).toBe("single_position");
    expect(result.termination).toBe("not_started");
  });
});

describe("ambiguous initialization", () => {
  it("throws before fetching when raw evidence is missing", () => {
    const initial = ambiguousExtraction();
    delete initial.rawTokenLogprob;

    const fetcher = jest.fn();
    expect(() =>
      resolveLabelProbsWithSuffixWalk(SHARED_PREFIX_LABELS, initial, fetcher)
    ).toThrow(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("ignores public fields that disagree with recomputation", async () => {
    const clean = ambiguousExtraction();
    const corrupted: SingleTokenLabelProbExtraction = {
      ...clean,
      absoluteLabelProbs: { answer_one: 99, answer_two: 99 },
      conditionalLabelProbs: { answer_one: 99, answer_two: 99 },
      residualMass: 99,
      ambiguousMass: 99,
    };
    const response = evidence("_one", 1, [["_one", 1]]);

    const fromClean = await resolveBothWays(SHARED_PREFIX_LABELS, clean, [response]);
    const fromCorrupted = await resolveBothWays(SHARED_PREFIX_LABELS, corrupted, [
      response,
    ]);

    expect(fromCorrupted.result).toEqual(fromClean.result);
    expect(fromCorrupted.requests).toEqual(fromClean.requests);
  });

  it("applies different labels during recomputation and short-circuits", () => {
    const initial = ambiguousExtraction();
    const fetcher = jest.fn();

    const result = resolveLabelProbsWithSuffixWalk(
      ["answer_one", "different_two"],
      initial,
      fetcher
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    expect(result.resolution).toBe("single_position");
    expect(result.termination).toBe("not_started");
    expect(result.fetchCount).toBe(0);
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.8);
    expect(result.absoluteLabelProbs.different_two).toBe(0);
  });

  it("applies a different ambiguity gap during recomputation", () => {
    const initial = ambiguousExtraction(
      SHARED_PREFIX_LABELS,
      evidence("answer_one", 0.9, [
        ["answer_one", 0.9],
        ["answer", 0.03],
        [" answer", 0.005],
        ["other", 0.065],
      ])
    );

    const fetcher = jest.fn();
    const result = resolveLabelProbsWithSuffixWalk(
      SHARED_PREFIX_LABELS,
      initial,
      fetcher,
      { ambiguityLogprobGap: 3 }
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    expect(result.resolution).toBe("single_position");
    expect(result.fetchCount).toBe(0);
    expect(result.ambiguousMass).toBeCloseTo(0.035);
  });
});

describe("suffix-walk accounting", () => {
  it("resolves one frontier and restates every mass field", async () => {
    const { result, requests } = await resolveBothWays(
      SHARED_PREFIX_LABELS,
      ambiguousExtraction(),
      [
        evidence("_one", 0.6, [
          ["_one", 0.6],
          ["_two", 0.3],
          ["junk", 0.05],
        ]),
      ]
    );

    expect(requests).toEqual([
      {
        prefix: " answer",
        suffixes: ["_one", "_two"],
        grammar: 'root ::= suffix\nsuffix ::= "_one" | "_two"\n',
      },
    ]);
    expect(result.status).toBe("ok");
    expect(result.resolution).toBe("suffix_walk");
    expect(result.termination).toBe("complete");
    expect(result.fetchCount).toBe(1);
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.6);
    expect(result.absoluteLabelProbs.answer_two).toBeCloseTo(0.15);
    expect(result.conditionalLabelProbs.answer_one).toBeCloseTo(0.8);
    expect(result.conditionalLabelProbs.answer_two).toBeCloseTo(0.2);
    expect(result.ambiguousMass).toBe(0);
    expect(result.residualMass).toBeCloseTo(0.25);
  });

  it("keeps the position-0 diagnostic snapshot rather than suffix evidence", async () => {
    const { result } = await resolveBothWays(
      SHARED_PREFIX_LABELS,
      ambiguousExtraction(),
      [evidence("_one", 1, [["_one", 1]])]
    );

    expect(result.rawTokenLogprob).toEqual(ambiguousPositionZero());
  });

  it("walks bare and space-prefixed paths separately and combines at the label", async () => {
    const initial = ambiguousExtraction(
      SHARED_PREFIX_LABELS,
      evidence("answer", 0.4, [
        ["answer", 0.4],
        [" answer", 0.4],
        ["other", 0.2],
      ])
    );

    // Both branches resolve to the SAME label, so the two decoded text paths must
    // combine at final attribution rather than staying separate.
    const { result, requests } = await resolveBothWays(SHARED_PREFIX_LABELS, initial, [
      evidence("_one", 1, [["_one", 1]]),
      evidence("_one", 1, [["_one", 1]]),
    ]);

    expect(requests.map((request) => request.prefix)).toEqual([
      "answer",
      " answer",
    ]);
    expect(requests[0].suffixes).toEqual(["_one", "_two"]);
    expect(requests[1].suffixes).toEqual(["_one", "_two"]);
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.8, 10);
    expect(result.absoluteLabelProbs.answer_two).toBe(0);
    expect(result.conditionalLabelProbs.answer_one).toBe(1);
    expect(result.residualMass).toBeCloseTo(0.2, 10);
    expect(result.termination).toBe("complete");
    expect(result.fetchCount).toBe(2);
  });

  it("accumulates the exact decoded prefix across several fetches", async () => {
    const initial = ambiguousExtraction(
      SHARED_PREFIX_LABELS,
      evidence(" ans", 1, [[" ans", 1]])
    );

    const { result, requests } = await resolveBothWays(SHARED_PREFIX_LABELS, initial, [
      evidence("wer", 1, [["wer", 1]]),
      evidence("_one", 0.75, [
        ["_one", 0.75],
        ["_two", 0.25],
      ]),
    ]);

    expect(requests).toEqual([
      {
        prefix: " ans",
        suffixes: ["wer_one", "wer_two"],
        grammar: 'root ::= suffix\nsuffix ::= "wer_one" | "wer_two"\n',
      },
      {
        prefix: " answer",
        suffixes: ["_one", "_two"],
        grammar: 'root ::= suffix\nsuffix ::= "_one" | "_two"\n',
      },
    ]);
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.75);
    expect(result.absoluteLabelProbs.answer_two).toBeCloseTo(0.25);
    expect(result.termination).toBe("complete");
  });

  it("walks an all-ambiguous position with no resolved label mass", async () => {
    const initial = ambiguousExtraction(
      SHARED_PREFIX_LABELS,
      evidence(" answer", 1, [[" answer", 1]])
    );
    expect(initial.absoluteLabelProbs.answer_one).toBe(0);

    const { result } = await resolveBothWays(SHARED_PREFIX_LABELS, initial, [
      evidence("_one", 0.5, [
        ["_one", 0.5],
        ["_two", 0.5],
      ]),
    ]);

    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.5);
    expect(result.absoluteLabelProbs.answer_two).toBeCloseTo(0.5);
    expect(result.ambiguousMass).toBe(0);
    expect(result.residualMass).toBeCloseTo(0);
  });

  it("offers both bare and space-prefixed forms for an empty root token", async () => {
    const initial = ambiguousExtraction(
      SHARED_PREFIX_LABELS,
      evidence("", 1, [["", 1]])
    );

    const { result, requests } = await resolveBothWays(SHARED_PREFIX_LABELS, initial, [
      evidence(" answer_one", 1, [[" answer_one", 1]]),
    ]);

    expect(requests[0].prefix).toBe("");
    expect(requests[0].suffixes).toEqual([
      "answer_one",
      "answer_two",
      " answer_one",
      " answer_two",
    ]);
    expect(requests[0].grammar).toBe(
      'root ::= suffix\nsuffix ::= "answer_one" | "answer_two" | " answer_one" | " answer_two"\n'
    );
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(1);
    expect(result.termination).toBe("complete");
  });

  it("reuses position-0 evidence semantics at a suffix position", async () => {
    const { result } = await resolveBothWays(
      SHARED_PREFIX_LABELS,
      ambiguousExtraction(),
      [
        {
          token: "_two",
          logprob: Math.log(0.4),
          topLogprobs: [
            { token: "_one", logprob: Math.log(0.2) },
            { token: "_one", logprob: Math.log(0.3) },
          ],
        },
      ]
    );

    // Duplicate `_one` combines to 0.5 and the absent sampled `_two` is restored once.
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.3 + 0.5 * 0.5);
    expect(result.absoluteLabelProbs.answer_two).toBeCloseTo(0.5 * 0.4);
    expect(result.residualMass).toBeCloseTo(0.2 + 0.5 * 0.1);
  });

  it("filters malformed suffix entries while keeping valid advancing evidence", async () => {
    const { result } = await resolveBothWays(
      SHARED_PREFIX_LABELS,
      ambiguousExtraction(),
      [
        {
          token: "_one",
          logprob: Math.log(0.7),
          topLogprobs: [
            { token: "_one", logprob: Math.log(0.7) },
            { token: 42 as unknown as string, logprob: Math.log(0.1) },
            { token: "_two", logprob: Number.NaN },
            { token: "_two", logprob: Math.log(0.2) },
          ],
        },
      ]
    );

    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.3 + 0.5 * 0.7);
    expect(result.absoluteLabelProbs.answer_two).toBeCloseTo(0.5 * 0.2);
    expect(result.termination).toBe("complete");
    expect(result.fetchCount).toBe(1);
  });

  it("treats a non-advancing empty continuation as residual beside advancing mass", async () => {
    const { result } = await resolveBothWays(
      SHARED_PREFIX_LABELS,
      ambiguousExtraction(),
      [
        evidence("_one", 0.6, [
          ["_one", 0.6],
          ["", 0.3],
        ]),
      ]
    );

    // The empty token cannot advance, so its share becomes residual rather than
    // re-queuing the same state; the advancing `_one` mass still commits.
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.6);
    expect(result.absoluteLabelProbs.answer_two).toBe(0);
    expect(result.ambiguousMass).toBe(0);
    expect(result.residualMass).toBeCloseTo(0.4);
    expect(result.termination).toBe("complete");
    expect(result.fetchCount).toBe(1);
  });

  it("materializes prototype-like labels safely after a walk", async () => {
    const labels = ["__proto__", "__prototype__"];
    const initial = ambiguousExtraction(
      labels,
      evidence("__proto", 1, [["__proto", 1]])
    );

    const { result, requests } = await resolveBothWays(labels, initial, [
      evidence("__", 0.6, [
        ["__", 0.6],
        ["type__", 0.4],
      ]),
    ]);

    expect(requests[0].suffixes).toEqual(["__", "type__"]);
    expect(
      Object.prototype.hasOwnProperty.call(result.absoluteLabelProbs, "__proto__")
    ).toBe(true);
    expect(result.absoluteLabelProbs.__proto__).toBeCloseTo(0.6);
    expect(result.absoluteLabelProbs.__prototype__).toBeCloseTo(0.4);
  });
});

describe("suffix-walk edge inputs", () => {
  it("keeps a required leading space inside a fragment through a whole walk", async () => {
    const labels = ["answer one", "answer two"];
    const initial = ambiguousExtraction(
      labels,
      evidence("answer", 1, [["answer", 1]])
    );

    const { result, requests } = await resolveBothWays(labels, initial, [
      evidence(" one", 0.7, [
        [" one", 0.7],
        [" two", 0.3],
      ]),
    ]);

    expect(requests[0].suffixes).toEqual([" one", " two"]);
    expect(requests[0].grammar).toBe(
      'root ::= suffix\nsuffix ::= " one" | " two"\n'
    );
    expect(result.absoluteLabelProbs["answer one"]).toBeCloseTo(0.7, 10);
    expect(result.absoluteLabelProbs["answer two"]).toBeCloseTo(0.3, 10);
    expect(result.termination).toBe("complete");
  });

  it("walks astral-plane labels by whole code points", async () => {
    const emoji = String.fromCodePoint(0x1f600);
    const labels = [`${emoji}_one`, `${emoji}_two`];
    const initial = ambiguousExtraction(labels, evidence(emoji, 1, [[emoji, 1]]));

    const { result, requests } = await resolveBothWays(labels, initial, [
      evidence("_one", 0.5, [
        ["_one", 0.5],
        ["_two", 0.5],
      ]),
    ]);

    expect(requests[0].prefix).toBe(emoji);
    expect(requests[0].suffixes).toEqual(["_one", "_two"]);
    expect(result.absoluteLabelProbs[`${emoji}_one`]).toBeCloseTo(0.5, 10);
    expect(result.absoluteLabelProbs[`${emoji}_two`]).toBeCloseTo(0.5, 10);
  });

  it("filters null alternatives instead of throwing", async () => {
    const { result } = await resolveBothWays(
      SHARED_PREFIX_LABELS,
      ambiguousExtraction(),
      [
        {
          token: "_one",
          logprob: Math.log(0.8),
          topLogprobs: [
            null as unknown as { token: string; logprob: number },
            { token: "_one", logprob: Math.log(0.8) },
          ],
        },
      ]
    );

    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.3 + 0.5 * 0.8, 10);
    expect(result.termination).toBe("complete");
    expect(result.fetchCount).toBe(1);
  });

  it("never resolves an ambiguous position for a single-label set", () => {
    const single = extractSingleTokenLabelProbs(
      ["answer"],
      evidence(" ans", 0.8, [[" ans", 0.8]])
    );

    expect(single.status).toBe("ok");
    const result = resolveLabelProbsWithSuffixWalk(["answer"], single, () => {
      throw new Error("a single-label set can never be ambiguous");
    });
    expect(result.resolution).toBe("single_position");
    expect(result.fetchCount).toBe(0);
  });

  it("does not alias the supplied raw evidence into a walked result", () => {
    const source = ambiguousPositionZero();
    const initial = extractSingleTokenLabelProbs(SHARED_PREFIX_LABELS, source);
    const result = resolveLabelProbsWithSuffixWalk(
      SHARED_PREFIX_LABELS,
      initial,
      () => evidence("_one", 1, [["_one", 1]])
    );

    expect(result.rawTokenLogprob).not.toBe(initial.rawTokenLogprob);
    expect(result.rawTokenLogprob?.topLogprobs).not.toBe(
      initial.rawTokenLogprob?.topLogprobs
    );

    initial.rawTokenLogprob!.token = "mutated";
    initial.rawTokenLogprob!.topLogprobs![0].token = "mutated";
    source.token = "mutated";

    expect(result.rawTokenLogprob?.token).toBe(" answer");
    expect(result.rawTokenLogprob?.topLogprobs?.[0].token).toBe(" answer");
  });

  it("rejects invalid input through the asynchronous resolver as a rejection", async () => {
    const fetcher = jest.fn();
    const initial = ambiguousExtraction();

    await expect(
      resolveLabelProbsWithSuffixWalkAsync(["a", "ab"], initial, fetcher)
    ).rejects.toThrow("Strict-prefix labels");
    await expect(
      resolveLabelProbsWithSuffixWalkAsync(SHARED_PREFIX_LABELS, initial, fetcher, {
        maxFetches: 0,
      })
    ).rejects.toThrow("maxFetches");

    const stripped = { ...initial };
    delete stripped.rawTokenLogprob;
    await expect(
      resolveLabelProbsWithSuffixWalkAsync(SHARED_PREFIX_LABELS, stripped, fetcher)
    ).rejects.toThrow(TypeError);

    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("frontier ordering and merging", () => {
  it("merges identical queued states before their first fetch", async () => {
    const labels = ["ab_one", "ab_two"];
    const initial = ambiguousExtraction(
      labels,
      evidence("a", 0.6, [
        ["a", 0.6],
        ["ab", 0.4],
      ])
    );

    const { result, requests } = await resolveBothWays(labels, initial, [
      evidence("b", 1, [["b", 1]]),
      evidence("_one", 1, [["_one", 1]]),
    ]);

    expect(requests.map((request) => request.prefix)).toEqual(["a", "ab"]);
    expect(result.fetchCount).toBe(2);
    expect(result.absoluteLabelProbs.ab_one).toBeCloseTo(1);
    expect(result.termination).toBe("complete");
  });

  it("fetches an identical state again when it converges after processing", async () => {
    const labels = ["ab_one", "ab_two"];
    const initial = ambiguousExtraction(
      labels,
      evidence("ab", 0.7, [
        ["ab", 0.7],
        ["a", 0.3],
      ])
    );

    const { result, requests } = await resolveBothWays(labels, initial, [
      evidence("_one", 1, [["_one", 1]]),
      evidence("b", 1, [["b", 1]]),
      evidence("_two", 1, [["_two", 1]]),
    ]);

    expect(requests.map((request) => request.prefix)).toEqual(["ab", "a", "ab"]);
    expect(result.fetchCount).toBe(3);
    expect(result.absoluteLabelProbs.ab_one).toBeCloseTo(0.7);
    expect(result.absoluteLabelProbs.ab_two).toBeCloseTo(0.3);
  });

  it("processes the highest-mass frontier first", async () => {
    const labels = ["ab_one", "ab_two", "cd_one", "cd_two"];
    const initial = ambiguousExtraction(
      labels,
      evidence("cd", 0.5, [
        ["ab", 0.2],
        ["cd", 0.5],
        [" ab", 0.3],
      ])
    );

    const { requests } = await resolveBothWays(labels, initial, [
      evidence("_one", 1, [["_one", 1]]),
      evidence("_one", 1, [["_one", 1]]),
      evidence("_one", 1, [["_one", 1]]),
    ]);

    expect(requests.map((request) => request.prefix)).toEqual(["cd", " ab", "ab"]);
  });

  it("breaks equal-mass ties by discovery order, not label spelling", async () => {
    const labels = ["ab_one", "ab_two", "cd_one", "cd_two"];
    // `cd` is discovered first despite sorting after `ab`, so a lexical tie-break
    // would invert this order.
    const initial = ambiguousExtraction(
      labels,
      evidence("cd", 0.5, [
        ["cd", 0.5],
        ["ab", 0.5],
      ])
    );

    const { requests } = await resolveBothWays(labels, initial, [
      evidence("_one", 1, [["_one", 1]]),
      evidence("_one", 1, [["_one", 1]]),
    ]);

    expect(requests.map((request) => request.prefix)).toEqual(["cd", "ab"]);
  });

  it("lets a newly discovered state preempt an older queued one", async () => {
    const labels = ["ab_one", "ab_two", "cd_one", "cd_two"];
    const initial = ambiguousExtraction(
      labels,
      evidence("a", 0.5, [
        ["a", 0.5],
        ["cd", 0.45],
      ])
    );

    const { requests, result } = await resolveBothWays(labels, initial, [
      // All of `a` (0.5) advances to `ab`, which now outranks the older `cd` (0.45).
      // Appending discoveries to the queue would instead yield ["a", "cd", "ab"].
      evidence("b", 1, [["b", 1]]),
      evidence("_one", 1, [["_one", 1]]),
      evidence("_one", 1, [["_one", 1]]),
    ]);

    expect(requests.map((request) => request.prefix)).toEqual(["a", "ab", "cd"]);
    // The two-level product 0.5 x 1 x 1 lands entirely on one label.
    expect(result.absoluteLabelProbs.ab_one).toBeCloseTo(0.5, 10);
    expect(result.absoluteLabelProbs.cd_one).toBeCloseTo(0.45, 10);
  });

  it("still deprioritizes a newly discovered state that carries less mass", async () => {
    const labels = ["ab_one", "ab_two", "cd_one", "cd_two"];
    const initial = ambiguousExtraction(
      labels,
      evidence("a", 0.5, [
        ["a", 0.5],
        ["cd", 0.45],
      ])
    );

    const { requests, result } = await resolveBothWays(labels, initial, [
      // `a` (0.5) resolves 80% and leaves only 0.1 on `ab`, so `cd` (0.45) runs next.
      evidence("b_one", 0.8, [
        ["b_one", 0.8],
        ["b", 0.2],
      ]),
      evidence("_one", 1, [["_one", 1]]),
      evidence("_one", 1, [["_one", 1]]),
    ]);

    expect(requests.map((request) => request.prefix)).toEqual(["a", "cd", "ab"]);
    // 0.5 resolved directly plus the 0.5 x 0.2 branch resolved one level deeper.
    expect(result.absoluteLabelProbs.ab_one).toBeCloseTo(0.5 * 0.8 + 0.5 * 0.2, 10);
    expect(result.absoluteLabelProbs.cd_one).toBeCloseTo(0.45, 10);
  });
});

describe("budget enforcement", () => {
  it("stops at a caller budget and keeps queued mass ambiguous", async () => {
    const labels = ["ab_one", "ab_two", "cd_one", "cd_two"];
    const initial = ambiguousExtraction(
      labels,
      evidence("ab", 0.6, [
        ["ab", 0.6],
        ["cd", 0.4],
      ])
    );

    const { result, requests } = await resolveBothWays(
      labels,
      initial,
      [evidence("_one", 1, [["_one", 1]]), evidence("_one", 1, [["_one", 1]])],
      { maxFetches: 1 }
    );

    expect(requests).toHaveLength(1);
    expect(result.fetchCount).toBe(1);
    expect(result.termination).toBe("budget_exhausted");
    expect(result.absoluteLabelProbs.ab_one).toBeCloseTo(0.6);
    expect(result.ambiguousMass).toBeCloseTo(0.4);
  });

  it("enforces the documented default of eight fetches", () => {
    const labels: string[] = [];
    for (const first of ["a", "b"]) {
      for (const second of ["a", "b"]) {
        for (const third of ["a", "b"]) {
          for (const fourth of ["a", "b"]) {
            labels.push(`p${first}${second}${third}${fourth}`);
          }
        }
      }
    }

    const initial = ambiguousExtraction(labels, evidence("p", 1, [["p", 1]]));
    const requests: SuffixWalkFetchRequest[] = [];
    const result = resolveLabelProbsWithSuffixWalk(
      labels,
      initial,
      splittingFetcher(requests)
    );

    expect(requests).toHaveLength(8);
    expect(result.fetchCount).toBe(8);
    expect(result.termination).toBe("budget_exhausted");
    expect(result.resolution).toBe("suffix_walk");
    expectConservedMass(result);
    // Eight fetches clear the root, both depth-2 and all four depth-3 states, then
    // one depth-4 state: 1/8 resolves and the seven queued siblings stay ambiguous.
    expect(requests.map((request) => request.prefix)).toEqual([
      "p",
      "pa",
      "pb",
      "paa",
      "pab",
      "pba",
      "pbb",
      "paaa",
    ]);
    expect(result.ambiguousMass).toBeCloseTo(0.875, 10);
    expect(sumValues(result.absoluteLabelProbs)).toBeCloseTo(0.125, 10);
  });

  it("reports an incomplete walk that is nevertheless usable", async () => {
    const initial = ambiguousExtraction(
      SHARED_PREFIX_LABELS,
      evidence("answer_one", 0.9, [
        ["answer_one", 0.9],
        ["answer", 0.03],
        [" answer", 0.005],
        ["other", 0.065],
      ])
    );

    const { result } = await resolveBothWays(
      SHARED_PREFIX_LABELS,
      initial,
      [evidence("_one", 1, [["_one", 1]])],
      { maxFetches: 1 }
    );

    expect(result.status).toBe("ok");
    expect(result.termination).toBe("budget_exhausted");
    expect(result.resolution).toBe("suffix_walk");
    expect(result.fetchCount).toBe(1);
    expect(result.ambiguousMass).toBeCloseTo(0.005);
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.93);
  });
});

describe("rejected suffix evidence", () => {
  const rejectedResponses: Array<[string, TokenLogprob | undefined]> = [
    ["undefined evidence", undefined],
    ["absent alternatives", { token: "_one", logprob: Math.log(0.9) }],
    ["empty alternatives", { token: "_one", logprob: Math.log(0.9), topLogprobs: [] }],
    [
      "all-invalid entries",
      {
        token: 7 as unknown as string,
        logprob: Number.NaN,
        topLogprobs: [{ token: "_one", logprob: Number.NaN }],
      },
    ],
    [
      "materially overfull evidence",
      evidence("_one", 0.7, [
        ["_one", 0.7],
        ["_two", 0.4],
      ]),
    ],
    ["no advancing candidate", evidence("junk", 1, [["junk", 1]])],
    ["empty continuation token", evidence("", 1, [["", 1]])],
  ];

  it.each(rejectedResponses)("stops on %s", async (_name, response) => {
    const { result, requests } = await resolveBothWays(
      SHARED_PREFIX_LABELS,
      ambiguousExtraction(),
      [response]
    );

    expect(requests).toHaveLength(1);
    expect(result.fetchCount).toBe(1);
    expect(result.termination).toBe("fetch_rejected");
    expect(result.resolution).toBe("suffix_walk");
    expect(result.status).toBe("ambiguous_prefix");
    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.3);
    expect(result.absoluteLabelProbs.answer_two).toBe(0);
    expect(result.ambiguousMass).toBeCloseTo(0.5);
    expect(result.residualMass).toBeCloseTo(0.2);
  });

  it("keeps committed mass when a later frontier is rejected", async () => {
    const labels = ["ab_one", "ab_two", "cd_one", "cd_two"];
    const initial = ambiguousExtraction(
      labels,
      evidence("ab", 0.6, [
        ["ab", 0.6],
        ["cd", 0.4],
      ])
    );

    const { result } = await resolveBothWays(labels, initial, [
      evidence("_one", 1, [["_one", 1]]),
      undefined,
    ]);

    expect(result.fetchCount).toBe(2);
    expect(result.termination).toBe("fetch_rejected");
    expect(result.absoluteLabelProbs.ab_one).toBeCloseTo(0.6);
    expect(result.absoluteLabelProbs.cd_one).toBe(0);
    expect(result.ambiguousMass).toBeCloseTo(0.4);
  });

  it("discards a rejected fetch transactionally", async () => {
    const { result } = await resolveBothWays(
      SHARED_PREFIX_LABELS,
      ambiguousExtraction(),
      [
        // Half of the visible mass would resolve, but the evidence is overfull.
        evidence("_one", 0.8, [
          ["_one", 0.8],
          ["_two", 0.8],
        ]),
      ]
    );

    expect(result.absoluteLabelProbs.answer_one).toBeCloseTo(0.3);
    expect(result.absoluteLabelProbs.answer_two).toBe(0);
    expect(result.ambiguousMass).toBeCloseTo(0.5);
  });
});

describe("operational fetcher failures", () => {
  it("propagates a synchronous throw unchanged", () => {
    const failure = new Error("transport down");
    expect(() =>
      resolveLabelProbsWithSuffixWalk(
        SHARED_PREFIX_LABELS,
        ambiguousExtraction(),
        () => {
          throw failure;
        }
      )
    ).toThrow(failure);

    try {
      resolveLabelProbsWithSuffixWalk(
        SHARED_PREFIX_LABELS,
        ambiguousExtraction(),
        () => {
          throw failure;
        }
      );
      throw new Error("expected a propagated failure");
    } catch (error) {
      expect(error).toBe(failure);
    }
  });

  it("propagates an asynchronous rejection unchanged", async () => {
    const failure = new Error("transport down");
    await expect(
      resolveLabelProbsWithSuffixWalkAsync(
        SHARED_PREFIX_LABELS,
        ambiguousExtraction(),
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);
  });
});
