import { computeContentTokenizerSemanticRevision } from "../contentProfileIdentity";
import { GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE } from "./gemma4";

describe("content-tokenizer recipes", () => {
  it("binds Gemma 4 semantics to the one immutable loader input", () => {
    const recipe = GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE;
    expect(recipe.semanticRevision).toBe(
      computeContentTokenizerSemanticRevision({
        tokenizerImplementation: recipe.loaderKind,
        textPolicy: recipe.textPolicy,
        artifacts: recipe.loaderInput.artifacts.map(({ role, sha256 }) => ({
          role,
          sha256,
        })),
      })
    );
    expect(recipe.loaderInput.artifacts).toEqual([
      expect.objectContaining({
        role: "tokenizer-json",
        revision: "ee0ef6023621cff504d758262d4e04895a5af4a2",
        sha256:
          "cc8d3a0ce36466ccc1278bf987df5f71db1719b9ca6b4118264f45cb627bfe0f",
      }),
    ]);
  });

  it("records complete identical tokenizer evidence for all four Gemma 4 IT variants", () => {
    const recipe = GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE;
    expect(recipe.coverageRequiredRoles).toEqual(["tokenizer-json"]);
    expect(recipe.coverageEvidence.map(({ modelId, revision }) => ({
      modelId,
      revision,
    }))).toEqual([
      {
        modelId: "gemma-4-E4B-it",
        revision: "ee0ef6023621cff504d758262d4e04895a5af4a2",
      },
      {
        modelId: "gemma-4-12B-it",
        revision: "707f0a3b8a3c7ad586ed01e27eafbad8a27dd0f7",
      },
      {
        modelId: "gemma-4-26B-A4B-it",
        revision: "4d7ae4984b7db7de8f8457170b3f1a419ee76d52",
      },
      {
        modelId: "gemma-4-31B-it",
        revision: "842da3794eaa0b77d5f08bae87a17459d91ff475",
      },
    ]);
    for (const coverage of recipe.coverageEvidence) {
      expect(coverage.behaviorArtifacts).toEqual([
        {
          role: "tokenizer-json",
          path: "tokenizer.json",
          sha256:
            "cc8d3a0ce36466ccc1278bf987df5f71db1719b9ca6b4118264f45cb627bfe0f",
        },
      ]);
    }
  });

  it("carries every required regression category without minting certificate fields", () => {
    const recipe = GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE;
    expect(recipe.selfTest.map(({ name }) => name).sort()).toEqual([
      "ascii-whitespace",
      "combining-marks",
      "control-characters",
      "emoji-zwj",
      "multilingual-dense",
      "special-token-literals",
    ]);
    expect(recipe).not.toHaveProperty("quality");
    expect(recipe).not.toHaveProperty("rankHash");
    expect(recipe).not.toHaveProperty("byteComplete");
  });

  it("keeps self-tests and coverage evidence out of semantic identity", () => {
    const recipe = GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE;
    const semanticIdentity = (): string =>
      computeContentTokenizerSemanticRevision({
        tokenizerImplementation: recipe.loaderKind,
        textPolicy: recipe.textPolicy,
        artifacts: recipe.loaderInput.artifacts.map(({ role, sha256 }) => ({
          role,
          sha256,
        })),
      });

    const before = semanticIdentity();
    const changedRegressionEvidence = {
      ...recipe,
      selfTest: recipe.selfTest.map((selfTest) => ({
        ...selfTest,
        expectedTokens: selfTest.expectedTokens + 1,
      })),
      coverageRequiredRoles: [...recipe.coverageRequiredRoles, "documentation"],
      coverageEvidence: [],
    };
    void changedRegressionEvidence;
    expect(semanticIdentity()).toBe(before);
    expect(before).toBe(recipe.semanticRevision);
  });

  it("is deeply immutable peer-free recipe data", () => {
    const recipe = GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE;
    expect(Object.isFrozen(recipe)).toBe(true);
    expect(Object.isFrozen(recipe.loaderInput.artifacts)).toBe(true);
    expect(Object.isFrozen(recipe.selfTest)).toBe(true);
    expect(Object.isFrozen(recipe.coverageEvidence[0].behaviorArtifacts)).toBe(
      true
    );
  });
});
