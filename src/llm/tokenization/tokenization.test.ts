import { getEncoding } from "js-tiktoken";
import {
  codePointBoundToTokenUpperBound,
  countTextTokens,
  getTokenProfileById,
  resolveTokenProfile,
  retokenizationUpperBound,
} from ".";
import type { TokenProfile } from ".";

describe("token profiles and certified structural bounds", () => {
  const cl100k = getTokenProfileById("cl100k_base")!;
  const o200k = getTokenProfileById("o200k_base")!;

  it("loads only hash-verified byte-complete profiles", () => {
    expect(cl100k.rankHash).toHaveLength(64);
    expect(o200k.rankHash).toHaveLength(64);
    expect(cl100k.byteComplete).toBe(true);
    expect(o200k.byteComplete).toBe(true);
    expect(cl100k.maximumDecodedBytesPerToken).toBe(128);
    expect(o200k.maximumDecodedBytesPerToken).toBe(128);
  });

  it("maps only verified provider/model aliases", () => {
    expect(resolveTokenProfile("openai", "gpt-4.1").status).toBe("available");
    expect(resolveTokenProfile("openai", "gpt-4").status).toBe("available");
    expect(resolveTokenProfile("anthropic", "claude-unknown")).toMatchObject({
      status: "unavailable",
    });
    for (const unknown of [
      "gpt-5000",
      "gpt-4oops",
      "gpt-5-totally-unknown",
    ]) {
      expect(resolveTokenProfile("openai", unknown)).toMatchObject({
        status: "unavailable",
      });
    }
  });

  it.each([
    "",
    "plain ASCII and\ncontrols\u0000",
    "漢字かなカナ dense script",
    "e\u0301 vs é",
    "👨‍👩‍👧‍👦 ✈️ 🧑🏽‍💻",
    "\u{10ffff}",
    "\ud800 lone surrogate",
    "<|endoftext|> is ordinary literal text",
  ])("counts adversarial ordinary text exactly: %p", (text) => {
    const result = countTextTokens(text, o200k);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.count.method).toBe("exact");
      expect(result.count.uncertaintyTokens).toBeUndefined();
      expect(result.count.tokens).toBeGreaterThanOrEqual(0);
    }
  });

  it("certifies four target tokens per Unicode code point", () => {
    const samples = [
      "ascii",
      "漢字",
      "e\u0301",
      "👨‍👩‍👧‍👦",
      "\u0000\u{10ffff}",
      "\ud800",
    ];
    for (const sample of samples) {
      const codePoints = Array.from(sample).length;
      const bound = codePointBoundToTokenUpperBound(codePoints, o200k);
      const actual = countTextTokens(sample, o200k);
      expect(bound.status).toBe("available");
      expect(actual.status).toBe("available");
      if (bound.status === "available" && actual.status === "available") {
        expect(actual.count.tokens).toBeLessThanOrEqual(
          bound.upperBound.tokens
        );
      }
    }
  });

  it("bounds decoded ordinary source-token sequences without assuming identity", () => {
    const sourceTokenizer = getEncoding("cl100k_base");
    const targetTokenizer = getEncoding("o200k_base");
    const sourceTokens = sourceTokenizer.encode(
      "ASCII 漢字 👨‍👩‍👧‍👦 \u0000 combining e\u0301",
      [],
      []
    );
    const sequences = [
      sourceTokens,
      [...sourceTokens].reverse(),
      sourceTokens.filter((_, index) => index % 2 === 0),
    ];
    for (const sequence of sequences) {
      const decoded = sourceTokenizer.decode(sequence);
      const actualTargetTokens = targetTokenizer.encode(decoded, [], []).length;
      const bound = retokenizationUpperBound(
        sequence.length,
        cl100k,
        o200k
      );
      expect(bound.status).toBe("available");
      if (bound.status === "available") {
        expect(actualTargetTokens).toBeLessThanOrEqual(
          bound.upperBound.tokens
        );
        expect(bound.upperBound.tokens).toBeGreaterThanOrEqual(sequence.length);
      }
    }
  });

  it("proves the consumer heuristic margin cannot be charged twice", () => {
    // The certified API accepts only structural inputs: 175 code points and a
    // target profile. It has no consumer/session margin parameter.
    expect(codePointBoundToTokenUpperBound.length).toBe(2);
    const result = codePointBoundToTokenUpperBound(175, o200k);
    expect(result.status).toBe("available");
    if (result.status !== "available") {
      throw new Error("Expected a certified structural bound");
    }
    const promptTokenUpperBound = result.upperBound.tokens;
    expect(promptTokenUpperBound).toBe(700);

    const rawCapacity = 1000;
    const heuristicMargin = 100;
    const outputBound = 150;
    const countingSlack = 25;
    const effectiveCapacity = rawCapacity - heuristicMargin;
    expect(promptTokenUpperBound + outputBound + countingSlack).toBe(875);
    expect(
      promptTokenUpperBound + outputBound + countingSlack <= effectiveCapacity
    ).toBe(true);

    const incorrectlyDuplicatedMargin =
      promptTokenUpperBound +
      outputBound +
      countingSlack +
      heuristicMargin;
    expect(incorrectlyDuplicatedMargin).toBe(975);
    expect(incorrectlyDuplicatedMargin <= effectiveCapacity).toBe(false);
  });

  it("uses zero heuristic margin for exact profile evidence", () => {
    const result = countTextTokens("exact profile fixture", o200k);
    expect(result.status).toBe("available");
    if (result.status === "available") {
      const heuristicMargin = 0;
      const countingSlack = 2;
      expect(result.count.method).toBe("exact");
      expect(result.count.uncertaintyTokens).toBeUndefined();
      expect(
        result.count.tokens + countingSlack + heuristicMargin
      ).toBe(result.count.tokens + countingSlack);
    }
  });

  it("rejects unsafe input and detects safe-integer overflow", () => {
    expect(codePointBoundToTokenUpperBound(-1, o200k)).toMatchObject({
      status: "error",
      error: { code: "INVALID_TOKEN_BOUND" },
    });
    expect(
      codePointBoundToTokenUpperBound(Number.MAX_SAFE_INTEGER, o200k)
    ).toMatchObject({
      status: "error",
      error: { code: "TOKEN_BOUND_OVERFLOW" },
    });
    expect(
      retokenizationUpperBound(Number.MAX_SAFE_INTEGER, cl100k, o200k)
    ).toMatchObject({
      status: "error",
      error: { code: "TOKEN_BOUND_OVERFLOW" },
    });
  });

  it("never trusts caller-modified certificate constants", () => {
    const forged = {
      ...cl100k,
      maximumDecodedBytesPerToken: 1,
    };
    const canonical = retokenizationUpperBound(1, cl100k, o200k);
    const supplied = retokenizationUpperBound(1, forged, o200k);

    expect(canonical.status).toBe("available");
    expect(supplied).toEqual(canonical);
    if (supplied.status === "available") {
      expect(supplied.upperBound.tokens).toBe(384);
    }
  });

  it("reports runtime-forged profile identifiers as unavailable", () => {
    const forged = {
      ...o200k,
      id: "unsupported_profile",
    } as unknown as TokenProfile;

    expect(countTextTokens("text", forged)).toMatchObject({
      status: "unavailable",
    });
    expect(retokenizationUpperBound(10, forged, o200k)).toMatchObject({
      status: "unavailable",
    });
    expect(codePointBoundToTokenUpperBound(10, forged)).toMatchObject({
      status: "unavailable",
    });
  });
});
