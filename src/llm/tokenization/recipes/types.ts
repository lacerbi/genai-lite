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

/**
 * Minimal genai-lite-owned shape required from an injected tokenizer runtime.
 * This deliberately avoids optional-peer-owned public declaration types.
 */
export interface ContentTokenizerRuntimeModule {
  /** Runtime constructor; its callable shape is validated by the loader. */
  readonly Tokenizer: unknown;
}

/**
 * Caller-supplied optional peer for bundlers that statically import the module.
 * `packageVersion` is a caller assertion validated against the supported range.
 */
export interface ContentTokenizerPeer {
  /** Statically imported runtime namespace or compatible structural module. */
  readonly module: ContentTokenizerRuntimeModule;
  /** Caller-asserted runtime version, validated against the supported range. */
  readonly packageVersion: string;
}

/** Artifact/cache controls and optional runtime injection for recipe loading. */
export interface LoadContentTokenizerProfileOptions {
  /** Application-owned tokenizer artifact cache directory. */
  cacheDir: string;
  /** Whether a missing verified artifact may be downloaded. */
  allowDownload: boolean;
  /** Cancels peer resolution or artifact provisioning before publication. */
  signal?: AbortSignal;
  /** Statically supplied optional peer; omission retains installed discovery. */
  tokenizersPeer?: ContentTokenizerPeer;
}
