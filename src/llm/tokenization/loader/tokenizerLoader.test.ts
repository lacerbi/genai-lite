import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeContentTokenizerSemanticRevision } from "../contentProfiles";
import type {
  ContentTokenizerRecipe,
  ContentTokenizerRecipeSelfTest,
} from "../recipes/types";
import {
  ContentTokenizerLoaderError,
  loadContentTokenizerProfile,
} from "./index";

const FIXTURE_TOKENIZER = {
  version: "1.0",
  truncation: null,
  padding: null,
  added_tokens: [
    {
      id: 6,
      content: "<special>",
      single_word: false,
      lstrip: false,
      rstrip: false,
      normalized: false,
      special: true,
    },
  ],
  normalizer: null,
  pre_tokenizer: { type: "Whitespace" },
  post_processor: null,
  decoder: { type: "WordPiece", prefix: "##", cleanup: true },
  model: {
    type: "WordPiece",
    unk_token: "[UNK]",
    continuing_subword_prefix: "##",
    max_input_chars_per_word: 100,
    vocab: {
      "[UNK]": 0,
      hello: 1,
      world: 2,
      "<": 3,
      ">": 4,
      special: 5,
      "<special>": 6,
    },
  },
};

const FIXTURE_BYTES = Buffer.from(JSON.stringify(FIXTURE_TOKENIZER));
const FIXTURE_SHA256 = createHash("sha256")
  .update(FIXTURE_BYTES)
  .digest("hex");
const FIXTURE_REVISION = "1".repeat(40);

const SELF_TESTS: ContentTokenizerRecipeSelfTest[] = [
  { name: "ascii-whitespace", text: "hello world", expectedTokens: 2 },
  { name: "multilingual-dense", text: "漢字 العربية", expectedTokens: 2 },
  { name: "combining-marks", text: "é e\u0301", expectedTokens: 3 },
  { name: "emoji-zwj", text: "👨‍👩", expectedTokens: 1 },
  {
    name: "control-characters",
    text: "\u0000\t\n\u001f",
    expectedTokens: 2,
  },
  {
    name: "special-token-literals",
    text: "<special>",
    expectedTokens: 3,
  },
];

function createRecipe(
  overrides: Partial<ContentTokenizerRecipe> = {}
): ContentTokenizerRecipe {
  const semanticRevision = computeContentTokenizerSemanticRevision({
    tokenizerImplementation: "huggingface-tokenizer-json-v1",
    textPolicy: "ordinary-text-no-specials-v1",
    artifacts: [{ role: "tokenizer-json", sha256: FIXTURE_SHA256 }],
  });
  return {
    id: "synthetic-tokenizer",
    tokenizerId: "test:synthetic-tokenizer",
    semanticRevision,
    loaderKind: "huggingface-tokenizer-json-v1",
    loaderInput: {
      artifacts: [
        {
          role: "tokenizer-json",
          source:
            `https://example.test/repository/resolve/${FIXTURE_REVISION}/tokenizer.json`,
          revision: FIXTURE_REVISION,
          sha256: FIXTURE_SHA256,
        },
      ],
    },
    textPolicy: "ordinary-text-no-specials-v1",
    selfTest: SELF_TESTS.map((item) => ({ ...item })),
    coverageRequiredRoles: ["tokenizer-json"],
    coverageEvidence: [
      {
        modelId: "synthetic-model",
        repository: "example/synthetic-model",
        revision: FIXTURE_REVISION,
        behaviorArtifacts: [
          {
            role: "tokenizer-json",
            path: "tokenizer.json",
            sha256: FIXTURE_SHA256,
          },
        ],
      },
    ],
    ...overrides,
  };
}

async function seedCache(cacheDir: string, value = FIXTURE_BYTES): Promise<void> {
  const artifactDir = join(cacheDir, "sha256");
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, FIXTURE_SHA256), value);
}

describe("optional content-tokenizer loader", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "genai-lite-tokenizer-loader-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it("loads a rehashed warm cache into a synchronous model backend", async () => {
    await seedCache(cacheDir);
    const backend = await loadContentTokenizerProfile(createRecipe(), {
      cacheDir,
      allowDownload: false,
    });

    expect(backend).toMatchObject({
      id: "synthetic-tokenizer",
      tokenizerId: "test:synthetic-tokenizer",
      provenance: {
        runtime: {
          packageName: "@huggingface/tokenizers",
          packageVersion: "0.1.3",
        },
      },
    });
    expect(backend.revision).toBe(createRecipe().semanticRevision);
    expect(Object.isFrozen(backend.provenance.semantic.artifacts)).toBe(true);
    expect(Object.isFrozen(backend.provenance.semantic.artifacts[0])).toBe(
      true
    );
    expect(backend.countTextTokens("hello world")).toBe(2);
    expect(backend.countTextTokens("<special>")).toBe(3);
    expect(backend.countTextTokens("hello")).toBe(1);
  });

  it("fails late and clearly when an offline artifact is absent", async () => {
    await expect(
      loadContentTokenizerProfile(createRecipe(), {
        cacheDir,
        allowDownload: false,
      })
    ).rejects.toMatchObject({
      code: "TOKENIZER_ARTIFACT_UNAVAILABLE",
      message: expect.stringContaining("downloads are disabled"),
    });
  });

  it("quarantines a corrupt warm-cache blob and fails closed offline", async () => {
    await seedCache(cacheDir, Buffer.from("corrupt"));

    await expect(
      loadContentTokenizerProfile(createRecipe(), {
        cacheDir,
        allowDownload: false,
      })
    ).rejects.toMatchObject({
      code: "TOKENIZER_ARTIFACT_INTEGRITY",
      message: expect.stringContaining("quarantined"),
    });
    const cacheFiles = await readdir(join(cacheDir, "sha256"));
    expect(cacheFiles).not.toContain(FIXTURE_SHA256);
    expect(
      cacheFiles.some((name) =>
        name.startsWith(`${FIXTURE_SHA256}.corrupt-`)
      )
    ).toBe(true);
  });

  it("replaces a quarantined corrupt blob only after verified download", async () => {
    await seedCache(cacheDir, Buffer.from("corrupt"));
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(FIXTURE_BYTES, { status: 200 })
    );

    const backend = await loadContentTokenizerProfile(createRecipe(), {
      cacheDir,
      allowDownload: true,
    });

    expect(backend.countTextTokens("<special>")).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const cached = await readFile(
      join(cacheDir, "sha256", FIXTURE_SHA256)
    );
    expect(cached).toEqual(FIXTURE_BYTES);
  });

  it("rejects a downloaded hash mismatch without publishing it", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.from("wrong"), { status: 200 })
    );

    await expect(
      loadContentTokenizerProfile(createRecipe(), {
        cacheDir,
        allowDownload: true,
      })
    ).rejects.toMatchObject({
      code: "TOKENIZER_ARTIFACT_INTEGRITY",
      message: expect.stringContaining(`expected ${FIXTURE_SHA256}`),
    });
    await expect(
      readFile(join(cacheDir, "sha256", FIXTURE_SHA256))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("coalesces concurrent downloads for one digest", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(
      async () => {
        await Promise.resolve();
        return new Response(FIXTURE_BYTES, { status: 200 });
      }
    );

    const [first, second] = await Promise.all([
      loadContentTokenizerProfile(createRecipe(), {
        cacheDir,
        allowDownload: true,
      }),
      loadContentTokenizerProfile(createRecipe(), {
        cacheDir,
        allowDownload: true,
      }),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first.countTextTokens("hello")).toBe(1);
    expect(second.countTextTokens("hello")).toBe(1);
  });

  it("loads two unrelated recipe identities through the generic loader", async () => {
    const secondFixture = JSON.parse(
      JSON.stringify(FIXTURE_TOKENIZER)
    ) as Record<string, unknown> & {
      model: { vocab: Record<string, number> };
    };
    secondFixture.model.vocab.unused = 7;
    const secondBytes = Buffer.from(JSON.stringify(secondFixture));
    const secondSha256 = createHash("sha256")
      .update(secondBytes)
      .digest("hex");
    const secondRevision = computeContentTokenizerSemanticRevision({
      tokenizerImplementation: "huggingface-tokenizer-json-v1",
      textPolicy: "ordinary-text-no-specials-v1",
      artifacts: [
        { role: "tokenizer-json", sha256: secondSha256 },
      ],
    });
    const secondRecipe = createRecipe({
      id: "synthetic-tokenizer-two",
      tokenizerId: "test:synthetic-tokenizer-two",
      semanticRevision: secondRevision,
      loaderInput: {
        artifacts: [
          {
            role: "tokenizer-json",
            source:
              `https://example.test/second/resolve/${FIXTURE_REVISION}/tokenizer.json`,
            revision: FIXTURE_REVISION,
            sha256: secondSha256,
          },
        ],
      },
      coverageEvidence: [
        {
          modelId: "synthetic-model-two",
          repository: "example/synthetic-model-two",
          revision: FIXTURE_REVISION,
          behaviorArtifacts: [
            {
              role: "tokenizer-json",
              path: "tokenizer.json",
              sha256: secondSha256,
            },
          ],
        },
      ],
    });
    await seedCache(cacheDir);
    await writeFile(
      join(cacheDir, "sha256", secondSha256),
      secondBytes
    );

    const [first, second] = await Promise.all([
      loadContentTokenizerProfile(createRecipe(), {
        cacheDir,
        allowDownload: false,
      }),
      loadContentTokenizerProfile(secondRecipe, {
        cacheDir,
        allowDownload: false,
      }),
    ]);

    expect(first.revision).not.toBe(second.revision);
    expect(first.id).toBe("synthetic-tokenizer");
    expect(second.id).toBe("synthetic-tokenizer-two");
    expect(second.countTextTokens("<special>")).toBe(3);
  });

  it("fails recipe validation before filesystem or network work", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const recipe = createRecipe({
      semanticRevision: "wrong",
    });

    await expect(
      loadContentTokenizerProfile(recipe, {
        cacheDir,
        allowDownload: true,
      })
    ).rejects.toMatchObject({ code: "TOKENIZER_RECIPE_INVALID" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("rejects malformed or merely substring-matched revision paths", async () => {
    for (const source of [
      `https://example.test/resolve/%ZZ/${FIXTURE_REVISION}/tokenizer.json`,
      `https://example.test/resolve/prefix-${FIXTURE_REVISION}/tokenizer.json`,
    ]) {
      const recipe = createRecipe();
      recipe.loaderInput.artifacts[0].source = source;
      await expect(
        loadContentTokenizerProfile(recipe, {
          cacheDir,
          allowDownload: false,
        })
      ).rejects.toMatchObject({ code: "TOKENIZER_RECIPE_INVALID" });
    }
  });

  it("requires all self-test categories and fails a mismatch closed", async () => {
    await seedCache(cacheDir);
    const missing = createRecipe({
      selfTest: SELF_TESTS.slice(1),
    });
    await expect(
      loadContentTokenizerProfile(missing, {
        cacheDir,
        allowDownload: false,
      })
    ).rejects.toMatchObject({
      code: "TOKENIZER_RECIPE_INVALID",
      message: expect.stringContaining("ascii-whitespace"),
    });

    const mismatch = createRecipe({
      selfTest: SELF_TESTS.map((item) =>
        item.name === "emoji-zwj"
          ? { ...item, expectedTokens: item.expectedTokens + 1 }
          : { ...item }
      ),
    });
    await expect(
      loadContentTokenizerProfile(mismatch, {
        cacheDir,
        allowDownload: false,
      })
    ).rejects.toMatchObject({
      code: "TOKENIZER_SELF_TEST_FAILED",
      message: expect.stringContaining("emoji-zwj"),
    });
  });

  it("rejects coverage that does not prove every semantic artifact role", async () => {
    const recipe = createRecipe({
      coverageEvidence: [
        {
          modelId: "synthetic-model",
          repository: "example/synthetic-model",
          revision: FIXTURE_REVISION,
          behaviorArtifacts: [],
        },
      ],
    });

    await expect(
      loadContentTokenizerProfile(recipe, {
        cacheDir,
        allowDownload: false,
      })
    ).rejects.toMatchObject({
      code: "TOKENIZER_RECIPE_INVALID",
      message: expect.stringContaining("required roles"),
    });
  });

  it("honors abort before peer, filesystem, or network work", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    const fetchSpy = jest.spyOn(globalThis, "fetch");

    await expect(
      loadContentTokenizerProfile(createRecipe(), {
        cacheDir,
        allowDownload: true,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: "TOKENIZER_ABORTED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps an abort during response-body download to TOKENIZER_ABORTED", async () => {
    const controller = new AbortController();
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        controller.abort(new Error("stop during body"));
        throw new DOMException("aborted", "AbortError");
      },
    } as Response);

    await expect(
      loadContentTokenizerProfile(createRecipe(), {
        cacheDir,
        allowDownload: true,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: "TOKENIZER_ABORTED" });
  });

  it("preserves typed loader errors", () => {
    const cause = new Error("cause");
    const error = new ContentTokenizerLoaderError(
      "TOKENIZER_LOAD_FAILED",
      "failed",
      { cause }
    );
    expect(error).toMatchObject({
      name: "ContentTokenizerLoaderError",
      code: "TOKENIZER_LOAD_FAILED",
      message: "failed",
      cause,
    });
  });
});
