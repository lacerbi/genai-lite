export type ContentTokenizerLoaderKind =
  "huggingface-tokenizer-json-v1";

export interface ContentTokenizerRecipeArtifact {
  role: string;
  source: string;
  revision: string;
  sha256: string;
}

export interface ContentTokenizerRecipeLoaderInput {
  artifacts: ContentTokenizerRecipeArtifact[];
}

export type ContentTokenizerRecipeSelfTestName =
  | "ascii-whitespace"
  | "multilingual-dense"
  | "combining-marks"
  | "emoji-zwj"
  | "control-characters"
  | "special-token-literals";

export interface ContentTokenizerRecipeSelfTest {
  name: ContentTokenizerRecipeSelfTestName;
  text: string;
  expectedTokens: number;
}

export interface ContentTokenizerCoverageEvidence {
  modelId: string;
  repository: string;
  revision: string;
  behaviorArtifacts: Array<{
    role: string;
    path: string;
    sha256: string;
  }>;
}

export interface ContentTokenizerRecipe {
  id: string;
  tokenizerId: string;
  semanticRevision: string;
  loaderKind: ContentTokenizerLoaderKind;
  loaderInput: ContentTokenizerRecipeLoaderInput;
  textPolicy: "ordinary-text-no-specials-v1";
  selfTest: ContentTokenizerRecipeSelfTest[];
  coverageRequiredRoles: string[];
  coverageEvidence: ContentTokenizerCoverageEvidence[];
}

export interface LoadContentTokenizerProfileOptions {
  cacheDir: string;
  allowDownload: boolean;
  signal?: AbortSignal;
}
