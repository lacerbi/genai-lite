import { computeContentTokenizerSemanticRevision } from "../contentProfiles";
import type { ContentTokenizerRecipe } from "./types";

const TOKENIZER_SHA256 =
  "cc8d3a0ce36466ccc1278bf987df5f71db1719b9ca6b4118264f45cb627bfe0f";
const CANONICAL_REVISION = "ee0ef6023621cff504d758262d4e04895a5af4a2";
const LOADER_KIND = "huggingface-tokenizer-json-v1" as const;

const semanticRevision = computeContentTokenizerSemanticRevision({
  tokenizerImplementation: LOADER_KIND,
  textPolicy: "ordinary-text-no-specials-v1",
  artifacts: [{ role: "tokenizer-json", sha256: TOKENIZER_SHA256 }],
});

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Gemma 4 instruction-tuned ordinary-text tokenization.
 *
 * Coverage records evidence for the four official repositories. Exact aliases
 * remain caller assertions and are not restricted to these model IDs.
 */
const gemma4ItRecipe = {
  id: "gemma-4-it",
  tokenizerId: "google:gemma-4-it",
  semanticRevision,
  loaderKind: LOADER_KIND,
  loaderInput: {
    artifacts: [
      {
        role: "tokenizer-json",
        source:
          `https://huggingface.co/google/gemma-4-E4B-it/resolve/${CANONICAL_REVISION}/tokenizer.json`,
        revision: CANONICAL_REVISION,
        sha256: TOKENIZER_SHA256,
      },
    ],
  },
  textPolicy: "ordinary-text-no-specials-v1",
  selfTest: [
    {
      name: "ascii-whitespace",
      text: "Hello, world!\nTwo  spaces.\t",
      expectedTokens: 10,
    },
    {
      name: "multilingual-dense",
      text: "漢字かなカナ العربية हिन्दी ไทย 한국어",
      expectedTokens: 8,
    },
    {
      name: "combining-marks",
      text: "é e\u0301 Å A\u030A",
      expectedTokens: 6,
    },
    {
      name: "emoji-zwj",
      text: "👨‍👩‍👧‍👦 ✈️ 🧑🏽‍💻",
      expectedTokens: 15,
    },
    {
      name: "control-characters",
      text: "\u0000\t\n\u001f",
      expectedTokens: 4,
    },
    {
      name: "special-token-literals",
      text: "<bos> <|think|> <turn|>",
      expectedTokens: 10,
    },
  ],
  coverageRequiredRoles: ["tokenizer-json"],
  coverageEvidence: [
    {
      modelId: "gemma-4-E4B-it",
      repository: "google/gemma-4-E4B-it",
      revision: CANONICAL_REVISION,
      behaviorArtifacts: [
        {
          role: "tokenizer-json",
          path: "tokenizer.json",
          sha256: TOKENIZER_SHA256,
        },
      ],
    },
    {
      modelId: "gemma-4-12B-it",
      repository: "google/gemma-4-12B-it",
      revision: "707f0a3b8a3c7ad586ed01e27eafbad8a27dd0f7",
      behaviorArtifacts: [
        {
          role: "tokenizer-json",
          path: "tokenizer.json",
          sha256: TOKENIZER_SHA256,
        },
      ],
    },
    {
      modelId: "gemma-4-26B-A4B-it",
      repository: "google/gemma-4-26B-A4B-it",
      revision: "4d7ae4984b7db7de8f8457170b3f1a419ee76d52",
      behaviorArtifacts: [
        {
          role: "tokenizer-json",
          path: "tokenizer.json",
          sha256: TOKENIZER_SHA256,
        },
      ],
    },
    {
      modelId: "gemma-4-31B-it",
      repository: "google/gemma-4-31B-it",
      revision: "842da3794eaa0b77d5f08bae87a17459d91ff475",
      behaviorArtifacts: [
        {
          role: "tokenizer-json",
          path: "tokenizer.json",
          sha256: TOKENIZER_SHA256,
        },
      ],
    },
  ],
} satisfies ContentTokenizerRecipe;

export const GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE:
Readonly<ContentTokenizerRecipe> = deepFreeze(gemma4ItRecipe);
