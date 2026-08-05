import type { TokenProfile } from "./types";

const O200K_RANK_MODULE = "js-tiktoken/ranks/o200k_base";
const CL100K_RANK_MODULE = "js-tiktoken/ranks/cl100k_base";
const LITE_RUNTIME_MODULE = "js-tiktoken/lite";

interface MutableRankData {
  pat_str: string;
  special_tokens: Record<string, number>;
  bpe_ranks: string;
}

function asRankData(value: unknown): MutableRankData {
  const candidate =
    typeof value === "object" && value !== null && "default" in value
      ? (value as { default: unknown }).default
      : value;
  return candidate as MutableRankData;
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock(O200K_RANK_MODULE);
  jest.dontMock(CL100K_RANK_MODULE);
  jest.dontMock(LITE_RUNTIME_MODULE);
});

describe("built-in token profile failures", () => {
  it.each([
    {
      name: "rank evaluation",
      moduleFactory: (): never => {
        throw new Error("consumer bundler dynamic-require stub");
      },
    },
    {
      name: "rank module shape",
      moduleFactory: (): object => ({ default: { pat_str: "invalid" } }),
    },
    {
      name: "rank hash",
      moduleFactory: (): MutableRankData => ({
        pat_str: ".",
        special_tokens: {},
        bpe_ranks: "IQ== 0",
      }),
    },
  ])("fails closed for $name failure", ({ moduleFactory }) => {
    jest.doMock(O200K_RANK_MODULE, moduleFactory);

    jest.isolateModules(() => {
      const profiles = require("./profiles") as typeof import("./profiles");
      const contentProfiles = require("./contentProfiles") as
        typeof import("./contentProfiles");
      const bounds = require("./bounds") as typeof import("./bounds");

      expect(() =>
        profiles.resolveTokenProfile("openai", "gpt-5.1")
      ).not.toThrow();
      const resolution = profiles.resolveTokenProfile(
        "openai",
        "gpt-5.1"
      );
      expect(resolution).toMatchObject({
        status: "unavailable",
        reason: expect.stringContaining("could not be loaded and verified"),
      });
      if (resolution.status === "unavailable") {
        expect(resolution.reason).not.toContain("dynamic-require stub");
      }

      expect(
        contentProfiles.resolveContentTokenProfile("openai", "gpt-5.1")
      ).toMatchObject({ status: "unavailable" });

      const forgedProfile = {
        id: "o200k_base",
        tokenizerId: "js-tiktoken:o200k_base",
        revision: "js-tiktoken-1.0.21:o200k:de7eb511338b",
        encoding: "o200k_base",
        rankHash:
          "de7eb511338b0e23589a3cae2dceb8dd66c2a9fd70dbf7ea778fd9df9f175d45",
        ordinaryTextOnly: true,
        byteComplete: true,
        maximumDecodedBytesPerToken: 128,
      } satisfies TokenProfile;
      expect(
        bounds.codePointBoundToTokenUpperBound(10, forgedProfile)
      ).toMatchObject({ status: "unavailable" });

      const semantic = {
        tokenizerImplementation: "test-reserved-profile-v1",
        textPolicy: "ordinary-text-no-specials-v1" as const,
        artifacts: [{ role: "tokenizer", sha256: "a".repeat(64) }],
      };
      const registry = new contentProfiles.ContentTokenProfileRegistry();
      expect(() =>
        registry.register({
          backends: [{
            id: "o200k_base",
            tokenizerId: "test:reserved",
            revision:
              contentProfiles.computeContentTokenizerSemanticRevision(semantic),
            provenance: { semantic },
            countTextTokens: (text: string): number => text.length,
          }],
          aliases: [],
        })
      ).toThrow(/already registered/);
    });
  });

  it("caches a terminal rank failure without retrying module evaluation", () => {
    let evaluations = 0;
    jest.doMock(O200K_RANK_MODULE, () => {
      evaluations += 1;
      throw new Error("rank evaluation failed");
    });

    jest.isolateModules(() => {
      const profiles = require("./profiles") as typeof import("./profiles");
      expect(profiles.getTokenProfileById("o200k_base")).toBeUndefined();
      expect(profiles.getTokenProfileById("o200k_base")).toBeUndefined();
      expect(
        profiles.resolveTokenProfile("openai", "gpt-5.1")
      ).toMatchObject({ status: "unavailable" });
    });
    expect(evaluations).toBe(1);
  });

  it.each([
    ["cl100k_base", CL100K_RANK_MODULE],
    ["o200k_base", O200K_RANK_MODULE],
  ] as const)("reserves built-in id %s during rank failure", (
    profileId,
    rankModule
  ) => {
    jest.doMock(rankModule, () => {
      throw new Error("rank unavailable");
    });

    jest.isolateModules(() => {
      const contentProfiles = require("./contentProfiles") as
        typeof import("./contentProfiles");
      const semantic = {
        tokenizerImplementation: "test-reserved-profile-v1",
        textPolicy: "ordinary-text-no-specials-v1" as const,
        artifacts: [{ role: "tokenizer", sha256: "b".repeat(64) }],
      };
      const registry = new contentProfiles.ContentTokenProfileRegistry();
      expect(() =>
        registry.register({
          backends: [{
            id: profileId,
            tokenizerId: "test:reserved",
            revision:
              contentProfiles.computeContentTokenizerSemanticRevision(semantic),
            provenance: { semantic },
            countTextTokens: (text: string): number => text.length,
          }],
          aliases: [],
        })
      ).toThrow(/already registered/);
    });
  });

  it("counts from the verified defensive rank snapshot", () => {
    const fullRuntime = jest.requireActual<typeof import("js-tiktoken")>(
      "js-tiktoken"
    );
    const text = "snapshot mutation regression";
    const expected = fullRuntime.getEncoding("o200k_base")
      .encode(text, [], []).length;
    let mutableRanks: MutableRankData | undefined;
    jest.doMock(O200K_RANK_MODULE, () => {
      const actual = asRankData(jest.requireActual(O200K_RANK_MODULE));
      mutableRanks = {
        pat_str: actual.pat_str,
        special_tokens: { ...actual.special_tokens },
        bpe_ranks: actual.bpe_ranks,
      };
      return mutableRanks;
    });

    jest.isolateModules(() => {
      const profiles = require("./profiles") as typeof import("./profiles");
      const profile = profiles.getTokenProfileById("o200k_base");
      expect(profile).toBeDefined();
      if (!profile || !mutableRanks) {
        throw new Error("Expected the mocked o200k profile to resolve.");
      }
      mutableRanks.pat_str = "(";
      mutableRanks.bpe_ranks = "corrupted after verification";
      mutableRanks.special_tokens["<|endoftext|>"] = 1;

      expect(profiles.countTextTokens(text, profile)).toMatchObject({
        status: "available",
        count: { tokens: expected, method: "exact" },
      });
    });
  });

  it.each([
    {
      name: "module evaluation",
      moduleFactory: (): never => {
        throw new Error("lite evaluation detail must stay internal");
      },
    },
    {
      name: "module shape",
      moduleFactory: (): object => ({ default: {} }),
    },
    {
      name: "constructor",
      moduleFactory: (): object => ({
        Tiktoken: class {
          constructor() {
            throw new Error("constructor detail must stay internal");
          }
        },
      }),
    },
    {
      name: "encode",
      moduleFactory: (): object => ({
        Tiktoken: class {
          encode(): never {
            throw new Error("encode detail must stay internal");
          }
        },
      }),
    },
  ])("returns unavailable evidence for lite runtime $name failure", ({
    moduleFactory,
  }) => {
    jest.doMock(LITE_RUNTIME_MODULE, moduleFactory);

    jest.isolateModules(() => {
      const profiles = require("./profiles") as typeof import("./profiles");
      const profile = profiles.getTokenProfileById("o200k_base");
      expect(profile).toBeDefined();
      if (!profile) {
        throw new Error("Expected the real o200k rank data to resolve.");
      }
      const result = profiles.countTextTokens("ordinary text", profile);
      expect(result).toMatchObject({
        status: "unavailable",
        reason: expect.stringContaining("failed to count ordinary text"),
      });
      if (result.status === "unavailable") {
        expect(result.reason).not.toContain("must stay internal");
      }
    });
  });
});
