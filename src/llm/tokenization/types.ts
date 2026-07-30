import type {
  ApiProviderId,
  PreparedPromptTokenCount,
  PreparedPromptTokenUpperBound,
} from "../types";

export type TokenProfileId = "cl100k_base" | "o200k_base";

export interface TokenProfile {
  id: TokenProfileId;
  tokenizerId: `js-tiktoken:${TokenProfileId}`;
  revision: string;
  encoding: TokenProfileId;
  rankHash: string;
  ordinaryTextOnly: true;
  byteComplete: true;
  maximumDecodedBytesPerToken: number;
}

export const TOKEN_PROFILE_MAPPING_REVISION = "model-token-profile-map-v1";

export type TokenProfileResolution =
  | {
      status: "available";
      provider: ApiProviderId;
      model: string;
      mappingRevision: typeof TOKEN_PROFILE_MAPPING_REVISION;
      profile: TokenProfile;
    }
  | {
      status: "unavailable";
      provider: ApiProviderId;
      model: string;
      mappingRevision: typeof TOKEN_PROFILE_MAPPING_REVISION;
      reason: string;
    };

export type TokenCountResult =
  | { status: "available"; count: PreparedPromptTokenCount }
  | { status: "unavailable"; reason: string };

export interface ContentTokenProfileIdentity {
  id: string;
  tokenizerId: string;
  revision: string;
}

export interface ContentTokenProfile extends ContentTokenProfileIdentity {
  quality: "exact" | "model";
  origin: "builtin" | "registered";
}

export type ContentTokenProfileResolution =
  | {
      status: "available";
      provider: ApiProviderId;
      model: string;
      mappingRevision: string;
      profile: ContentTokenProfile;
    }
  | {
      status: "unavailable";
      provider: ApiProviderId;
      model: string;
      mappingRevision: string;
      reason: string;
    };

export interface ContentTokenizerSemanticArtifact {
  role: string;
  sha256: string;
}

export interface ContentTokenizerSemanticProvenance {
  tokenizerImplementation: string;
  textPolicy: "ordinary-text-no-specials-v1";
  artifacts: ContentTokenizerSemanticArtifact[];
}

export interface ContentTokenizerRuntimeProvenance {
  packageName: string;
  packageVersion: string;
  loaderImplementationRevision: string;
}

export interface ContentTokenizerBackendProvenance {
  semantic: ContentTokenizerSemanticProvenance;
  runtime?: ContentTokenizerRuntimeProvenance;
}

export interface RegisteredContentTokenizerBackend
  extends ContentTokenProfileIdentity {
  /**
   * Canonical tokenizer semantics. Runtime and deployment details belong in
   * `runtime` and do not change the stable profile revision.
   */
  provenance: ContentTokenizerBackendProvenance;
  /**
   * Counts ordinary JavaScript string text synchronously without BOS/EOS,
   * postprocessor tokens, or special-token interpretation.
   */
  countTextTokens(text: string): number;
}

export interface ContentTokenProfileAlias {
  providerId: ApiProviderId;
  modelId: string;
  profileId: string;
}

export interface ContentTokenProfileConfiguration {
  backends: RegisteredContentTokenizerBackend[];
  aliases: ContentTokenProfileAlias[];
}

export type TokenBoundResult =
  | {
      status: "available";
      upperBound: PreparedPromptTokenUpperBound;
    }
  | {
      status: "unavailable";
      reason: string;
    }
  | {
      status: "error";
      error: {
        code: "INVALID_TOKEN_BOUND" | "TOKEN_BOUND_OVERFLOW";
        message: string;
      };
    };
