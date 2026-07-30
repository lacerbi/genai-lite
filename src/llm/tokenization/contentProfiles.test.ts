import { createHash } from "node:crypto";
import {
  ContentTokenProfileRegistry,
  computeContentTokenizerSemanticRevision,
} from "./contentProfiles";
import type {
  ContentTokenProfileConfiguration,
  ContentTokenizerSemanticProvenance,
  RegisteredContentTokenizerBackend,
} from "./types";

function createBackend(
  id: string,
  tokenOffset: number,
  options: {
    artifacts?: ContentTokenizerSemanticProvenance["artifacts"];
    runtimeVersion?: string;
    count?: (text: string) => number;
  } = {}
): RegisteredContentTokenizerBackend {
  const semantic: ContentTokenizerSemanticProvenance = {
    tokenizerImplementation: `test-tokenizer-${id}-v1`,
    textPolicy: "ordinary-text-no-specials-v1",
    artifacts: options.artifacts ?? [
      {
        role: "tokenizer-json",
        sha256: "a".repeat(64),
      },
    ],
  };
  return {
    id,
    tokenizerId: `test:${id}`,
    revision: computeContentTokenizerSemanticRevision(semantic),
    provenance: {
      semantic,
      ...(options.runtimeVersion
        ? {
            runtime: {
              packageName: "@example/tokenizer",
              packageVersion: options.runtimeVersion,
              loaderImplementationRevision: "test-loader-v1",
            },
          }
        : {}),
    },
    countTextTokens:
      options.count ?? ((text: string): number => text.length + tokenOffset),
  };
}

describe("content-token profile registry", () => {
  it("exposes built-in exact profiles without changing certified identity", () => {
    const registry = new ContentTokenProfileRegistry();
    const resolution = registry.resolve("openai", "gpt-4.1");

    expect(resolution).toMatchObject({
      status: "available",
      provider: "openai",
      model: "gpt-4.1",
      profile: {
        id: "o200k_base",
        tokenizerId: "js-tiktoken:o200k_base",
        quality: "exact",
        origin: "builtin",
      },
    });
    if (resolution.status === "available") {
      const count = registry.count("ordinary text", resolution.profile);
      expect(count).toMatchObject({
        status: "available",
        count: {
          method: "exact",
          tokenizerId: "js-tiktoken:o200k_base",
        },
      });
    }
  });

  it("registers unrelated backends and exact aliases transactionally", () => {
    const registry = new ContentTokenProfileRegistry();
    const backendA = createBackend("profile-a", 1);
    const backendB = createBackend("profile-b", 2, {
      artifacts: [
        { role: "vocab", sha256: "b".repeat(64) },
        { role: "merges", sha256: "c".repeat(64) },
      ],
    });
    registry.register({
      backends: [backendA, backendB],
      aliases: [
        {
          providerId: "llamacpp",
          modelId: "gemma-4-12b-it-q4_k_m.gguf",
          profileId: "profile-a",
        },
        {
          providerId: "custom",
          modelId: "unrelated-model",
          profileId: "profile-b",
        },
      ],
    });

    const first = registry.resolve(
      "llamacpp",
      "gemma-4-12b-it-q4_k_m.gguf"
    );
    const second = registry.resolve("custom", "unrelated-model");
    expect(first).toMatchObject({
      status: "available",
      profile: { id: "profile-a", quality: "model", origin: "registered" },
    });
    expect(second).toMatchObject({
      status: "available",
      profile: { id: "profile-b", quality: "model", origin: "registered" },
    });
    if (first.status === "available" && second.status === "available") {
      expect(registry.count("abc", first.profile)).toMatchObject({
        status: "available",
        count: {
          tokens: 4,
          method: "model",
          tokenizerId: "test:profile-a",
          tokenProfileRevision: backendA.revision,
        },
      });
      expect(registry.count("abc", second.profile)).toMatchObject({
        status: "available",
        count: { tokens: 5, method: "model" },
      });
    }

    expect(
      registry.resolve("llamacpp", "GEMMA-4-12B-IT-Q4_K_M.GGUF")
    ).toMatchObject({ status: "unavailable" });
    expect(
      registry.resolve("llamacpp", "gemma-4-12b-it")
    ).toMatchObject({ status: "unavailable" });
  });

  it("canonicalizes semantic artifact order without conflating provenance", () => {
    const first: ContentTokenizerSemanticProvenance = {
      tokenizerImplementation: "generic-loader-v1",
      textPolicy: "ordinary-text-no-specials-v1",
      artifacts: [
        { role: "vocab", sha256: "b".repeat(64) },
        { role: "config", sha256: "a".repeat(64) },
      ],
    };
    const reordered: ContentTokenizerSemanticProvenance = {
      ...first,
      artifacts: [...first.artifacts].reverse(),
    };
    const changed: ContentTokenizerSemanticProvenance = {
      ...first,
      artifacts: [
        { role: "vocab", sha256: "c".repeat(64) },
        { role: "config", sha256: "a".repeat(64) },
      ],
    };

    expect(computeContentTokenizerSemanticRevision(first)).toBe(
      computeContentTokenizerSemanticRevision(reordered)
    );
    expect(computeContentTokenizerSemanticRevision(changed)).not.toBe(
      computeContentTokenizerSemanticRevision(first)
    );
  });

  it("uses locale-independent code-unit ordering for semantic identity", () => {
    const provenance: ContentTokenizerSemanticProvenance = {
      tokenizerImplementation: "generic-loader-v1",
      textPolicy: "ordinary-text-no-specials-v1",
      artifacts: [
        { role: "a-role", sha256: "a".repeat(64) },
        { role: "Z-role", sha256: "b".repeat(64) },
      ],
    };
    const expected = createHash("sha256")
      .update("genai-lite-content-token-profile-semantic-v1\u0000")
      .update(JSON.stringify({
        tokenizerImplementation: "generic-loader-v1",
        textPolicy: "ordinary-text-no-specials-v1",
        artifacts: [
          { role: "Z-role", sha256: "b".repeat(64) },
          { role: "a-role", sha256: "a".repeat(64) },
        ],
      }))
      .digest("hex");

    expect(computeContentTokenizerSemanticRevision(provenance)).toBe(expected);
  });

  it("rejects a mismatched declared semantic revision", () => {
    const registry = new ContentTokenProfileRegistry();
    const backend = {
      ...createBackend("mismatch", 0),
      revision: "not-the-semantic-revision",
    };
    expect(() =>
      registry.register({ backends: [backend], aliases: [] })
    ).toThrow(/canonical semantic revision/);
  });

  it("commits no part of a failed batch", () => {
    const registry = new ContentTokenProfileRegistry();
    const configuration: ContentTokenProfileConfiguration = {
      backends: [createBackend("valid-before-failure", 0)],
      aliases: [
        {
          providerId: "custom",
          modelId: "model",
          profileId: "missing-profile",
        },
      ],
    };
    expect(() => registry.register(configuration)).toThrow(
      /targets unknown profile/
    );
    expect(registry.getById("valid-before-failure")).toBeUndefined();
  });

  it("does not freeze on construction or registration and freezes on first read", () => {
    const registry = new ContentTokenProfileRegistry();
    registry.register({
      backends: [createBackend("startup-a", 0)],
      aliases: [],
    });
    registry.register({
      backends: [createBackend("startup-b", 0)],
      aliases: [],
    });

    expect(registry.getMappingRevision()).toHaveLength(64);
    expect(() =>
      registry.register({
        backends: [createBackend("too-late", 0)],
        aliases: [],
      })
    ).toThrow(/registration is closed/);
  });

  it("keeps callback failures and invalid runtime counts unavailable", () => {
    const registry = new ContentTokenProfileRegistry();
    registry.register({
      backends: [
        createBackend("throws", 0, {
          count: (text: string): number => {
            if (text.length > 0) {
              throw new Error("fixture failure");
            }
            return 0;
          },
        }),
        createBackend("invalid-result", 0, {
          count: (text: string): number =>
            text.length > 0 ? Number.MAX_SAFE_INTEGER + 1 : 0,
        }),
      ],
      aliases: [],
    });
    const throwsProfile = registry.getById("throws")!;
    const invalidProfile = registry.getById("invalid-result")!;

    expect(registry.count("x", throwsProfile)).toMatchObject({
      status: "unavailable",
      reason: expect.stringContaining("fixture failure"),
    });
    expect(registry.count("x", invalidProfile)).toMatchObject({
      status: "unavailable",
      reason: expect.stringContaining("nonnegative safe integer"),
    });
  });

  it("rejects asynchronous callbacks during registration", () => {
    const backend = createBackend("async", 0);
    const invalid = {
      ...backend,
      countTextTokens: async (): Promise<number> => 0,
    } as unknown as RegisteredContentTokenizerBackend;

    expect(() =>
      new ContentTokenProfileRegistry().register({
        backends: [invalid],
        aliases: [],
      })
    ).toThrow(/synchronously return/);
  });

  it("rejects built-in and duplicate exact alias conflicts", () => {
    const registry = new ContentTokenProfileRegistry();
    const backend = createBackend("conflicts", 0);
    expect(() =>
      registry.register({
        backends: [backend],
        aliases: [
          {
            providerId: "openai",
            modelId: "gpt-4.1",
            profileId: backend.id,
          },
        ],
      })
    ).toThrow(/conflicts with an existing exact alias/);

    expect(() =>
      new ContentTokenProfileRegistry().register({
        backends: [createBackend("duplicate-alias", 0)],
        aliases: [
          {
            providerId: "custom",
            modelId: "same",
            profileId: "duplicate-alias",
          },
          {
            providerId: "custom",
            modelId: "same",
            profileId: "duplicate-alias",
          },
        ],
      })
    ).toThrow(/conflicts with an existing exact alias/);
  });

  it("makes mapping revisions deterministic and runtime-sensitive", () => {
    function revisionFor(
      order: readonly ["a", "b"] | readonly ["b", "a"],
      runtimeVersion: string
    ): string {
      const registry = new ContentTokenProfileRegistry();
      const backends = {
        a: createBackend("mapping-a", 0, { runtimeVersion }),
        b: createBackend("mapping-b", 0),
      };
      registry.register({
        backends: order.map((key) => backends[key]),
        aliases: order.map((key) => ({
          providerId: "custom",
          modelId: `model-${key}`,
          profileId: backends[key].id,
        })),
      });
      return registry.getMappingRevision();
    }

    expect(revisionFor(["a", "b"], "0.1.3")).toBe(
      revisionFor(["b", "a"], "0.1.3")
    );
    expect(revisionFor(["a", "b"], "0.1.4")).not.toBe(
      revisionFor(["a", "b"], "0.1.3")
    );
    const canonical = revisionFor(["a", "b"], "0.1.3");
    const localeCompare = jest.spyOn(String.prototype, "localeCompare")
      .mockReturnValue(-1);
    const withHostLocaleOverride = revisionFor(["a", "b"], "0.1.3");
    localeCompare.mockRestore();
    expect(withHostLocaleOverride).toBe(canonical);
  });

  it("allows exact aliases to share registered or built-in profiles", () => {
    const registry = new ContentTokenProfileRegistry();
    const shared = createBackend("shared-profile", 0);
    registry.register({
      backends: [shared],
      aliases: [
        {
          providerId: "custom",
          modelId: "alias-one",
          profileId: shared.id,
        },
        {
          providerId: "custom",
          modelId: "alias-two",
          profileId: shared.id,
        },
        {
          providerId: "openrouter",
          modelId: "caller-asserted-o200k",
          profileId: "o200k_base",
        },
      ],
    });

    expect(registry.resolve("custom", "alias-one")).toMatchObject({
      status: "available",
      profile: { id: shared.id, quality: "model" },
    });
    expect(registry.resolve("custom", "alias-two")).toMatchObject({
      status: "available",
      profile: { id: shared.id, quality: "model" },
    });
    expect(
      registry.resolve("openrouter", "caller-asserted-o200k")
    ).toMatchObject({
      status: "available",
      profile: { id: "o200k_base", quality: "exact" },
    });
  });

  it("separates stable profile identity from mapping identity", () => {
    function snapshot(
      modelId: string,
      implementation: string,
      count: (text: string) => number
    ): { profileRevision: string; mappingRevision: string } {
      const semantic: ContentTokenizerSemanticProvenance = {
        tokenizerImplementation: implementation,
        textPolicy: "ordinary-text-no-specials-v1",
        artifacts: [{ role: "tokenizer", sha256: "d".repeat(64) }],
      };
      const backend: RegisteredContentTokenizerBackend = {
        id: "stable-profile",
        tokenizerId: "test:stable",
        revision: computeContentTokenizerSemanticRevision(semantic),
        provenance: { semantic },
        countTextTokens: count,
      };
      const registry = new ContentTokenProfileRegistry();
      registry.register({
        backends: [backend],
        aliases: [
          { providerId: "custom", modelId, profileId: backend.id },
        ],
      });
      return {
        profileRevision: registry.getById(backend.id)!.revision,
        mappingRevision: registry.getMappingRevision(),
      };
    }

    const first = snapshot("model-a", "stable-implementation-v1", (text) =>
      text.length
    );
    const differentCallbackIdentity = snapshot(
      "model-a",
      "stable-implementation-v1",
      (text) => text.length
    );
    const differentAlias = snapshot(
      "model-b",
      "stable-implementation-v1",
      (text) => text.length
    );
    const differentSemantics = snapshot(
      "model-a",
      "stable-implementation-v2",
      (text) => text.length
    );

    expect(differentCallbackIdentity).toEqual(first);
    expect(differentAlias.profileRevision).toBe(first.profileRevision);
    expect(differentAlias.mappingRevision).not.toBe(first.mappingRevision);
    expect(differentSemantics.profileRevision).not.toBe(first.profileRevision);
    expect(differentSemantics.mappingRevision).not.toBe(first.mappingRevision);
  });
});
