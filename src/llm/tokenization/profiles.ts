import { createHash } from "node:crypto";
import { getEncoding, type Tiktoken } from "js-tiktoken";
import type { ApiProviderId, PreparedPromptTokenCount } from "../types";
import {
  TOKEN_PROFILE_MAPPING_REVISION,
  type TokenCountResult,
  type TokenProfile,
  type TokenProfileId,
  type TokenProfileResolution,
} from "./types";

interface RankData {
  pat_str: string;
  special_tokens: Record<string, number>;
  bpe_ranks: string;
}

interface ProfileDefinition {
  id: TokenProfileId;
  expectedHash: string;
  revision: string;
  loadRanks: () => RankData;
}

function loadRankData(moduleId: string): RankData {
  const loaded = require(moduleId) as RankData | { default: RankData };
  return "default" in loaded ? loaded.default : loaded;
}

const DEFINITIONS: Record<TokenProfileId, ProfileDefinition> = {
  cl100k_base: {
    id: "cl100k_base",
    expectedHash:
      "9b9ea7feb9945beda9196f3691a3cc2d0f339aec498bbae285ce6aded387455c",
    revision: "js-tiktoken-1.0.21:cl100k:9b9ea7feb994",
    loadRanks: () => loadRankData("js-tiktoken/ranks/cl100k_base"),
  },
  o200k_base: {
    id: "o200k_base",
    expectedHash:
      "de7eb511338b0e23589a3cae2dceb8dd66c2a9fd70dbf7ea778fd9df9f175d45",
    revision: "js-tiktoken-1.0.21:o200k:de7eb511338b",
    loadRanks: () => loadRankData("js-tiktoken/ranks/o200k_base"),
  },
};

const profileCache = new Map<TokenProfileId, TokenProfile | null>();
const tokenizerCache = new Map<TokenProfileId, Tiktoken>();

function hashRankData(ranks: RankData): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        pat_str: ranks.pat_str,
        special_tokens: ranks.special_tokens,
        bpe_ranks: ranks.bpe_ranks,
      })
    )
    .digest("hex");
}

function deriveRankProperties(
  ranks: RankData
): { byteComplete: boolean; maximumDecodedBytesPerToken: number } {
  const encodedTokens = ranks.bpe_ranks.split(" ").slice(2);
  const singleBytes = new Set<number>();
  let maximumDecodedBytesPerToken = 0;
  for (const encodedToken of encodedTokens) {
    const bytes = Buffer.from(encodedToken, "base64");
    maximumDecodedBytesPerToken = Math.max(
      maximumDecodedBytesPerToken,
      bytes.length
    );
    if (bytes.length === 1) {
      singleBytes.add(bytes[0]);
    }
  }
  return {
    byteComplete: singleBytes.size === 256,
    maximumDecodedBytesPerToken,
  };
}

export function getTokenProfileById(
  id: TokenProfileId
): TokenProfile | undefined {
  if (profileCache.has(id)) {
    return profileCache.get(id) ?? undefined;
  }
  const definition = DEFINITIONS[id];
  if (!definition) {
    return undefined;
  }
  const ranks = definition.loadRanks();
  const rankHash = hashRankData(ranks);
  const properties = deriveRankProperties(ranks);
  if (
    rankHash !== definition.expectedHash ||
    !properties.byteComplete ||
    properties.maximumDecodedBytesPerToken <= 0
  ) {
    profileCache.set(id, null);
    return undefined;
  }
  const profile: TokenProfile = Object.freeze({
    id,
    tokenizerId: `js-tiktoken:${id}`,
    revision: definition.revision,
    encoding: id,
    rankHash,
    ordinaryTextOnly: true,
    byteComplete: true,
    maximumDecodedBytesPerToken: properties.maximumDecodedBytesPerToken,
  });
  profileCache.set(id, profile);
  return profile;
}

function mappedProfileId(
  provider: ApiProviderId,
  model: string
): TokenProfileId | undefined {
  if (provider !== "openai") {
    return undefined;
  }
  const o200kModels = new Set([
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5-mini-2025-08-07",
    "gpt-5-nano-2025-08-07",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "chatgpt-4o-latest",
    "o1",
    "o3",
    "o3-mini",
    "o4-mini",
  ]);
  if (o200kModels.has(model)) {
    return "o200k_base";
  }
  const cl100kModels = new Set([
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
  ]);
  if (cl100kModels.has(model)) {
    return "cl100k_base";
  }
  return undefined;
}

export function resolveTokenProfile(
  provider: ApiProviderId,
  model: string
): TokenProfileResolution {
  const id = mappedProfileId(provider, model);
  const profile = id ? getTokenProfileById(id) : undefined;
  if (!profile) {
    return {
      status: "unavailable",
      provider,
      model,
      mappingRevision: TOKEN_PROFILE_MAPPING_REVISION,
      reason: id
        ? `Tokenizer rank data for '${id}' did not match its pinned revision.`
        : `No verified token profile is registered for ${provider}/${model}.`,
    };
  }
  return {
    status: "available",
    provider,
    model,
    mappingRevision: TOKEN_PROFILE_MAPPING_REVISION,
    profile,
  };
}

function getTokenizer(profile: TokenProfile): Tiktoken {
  let tokenizer = tokenizerCache.get(profile.id);
  if (!tokenizer) {
    tokenizer = getEncoding(profile.encoding);
    tokenizerCache.set(profile.id, tokenizer);
  }
  return tokenizer;
}

/** Counts ordinary text exactly for a pinned, hash-verified profile. */
export function countTextTokens(
  text: string,
  profile: TokenProfile
): TokenCountResult {
  const current = getTokenProfileById(profile.id);
  if (!current || current.revision !== profile.revision) {
    return {
      status: "unavailable",
      reason: `Token profile '${profile.id}' is not available at revision '${profile.revision}'.`,
    };
  }
  const count: PreparedPromptTokenCount = {
    tokens: getTokenizer(current).encode(text, [], []).length,
    method: "exact",
    tokenizerId: current.tokenizerId,
    tokenProfileRevision: current.revision,
  };
  return { status: "available", count };
}

/** Explicit generic estimate; never returned as an exact or certified bound. */
export function estimateTextTokens(text: string): PreparedPromptTokenCount {
  return {
    tokens: Math.ceil(text.length / 4),
    method: "heuristic",
    tokenizerId: "utf16-code-units-per-4",
    tokenProfileRevision: "generic-utf16-estimator-v1",
    uncertaintyTokens: Math.ceil(text.length / 8),
  };
}
