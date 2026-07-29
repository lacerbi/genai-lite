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
