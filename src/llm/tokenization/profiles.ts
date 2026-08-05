import { createHash } from "node:crypto";
import type { Tiktoken, TiktokenBPE } from "js-tiktoken/lite";
import type { ApiProviderId, PreparedPromptTokenCount } from "../types";
import {
  TOKEN_PROFILE_MAPPING_REVISION,
  type TokenCountResult,
  type TokenProfile,
  type TokenProfileId,
  type TokenProfileResolution,
} from "./types";

type RankData = TiktokenBPE;

interface TiktokenConstructor {
  new(
    ranks: TiktokenBPE,
    extendedSpecialTokens?: Record<string, number>
  ): Tiktoken;
}

interface LiteRuntimeModule {
  Tiktoken: TiktokenConstructor;
}

interface ProfileDefinition {
  id: TokenProfileId;
  expectedHash: string;
  revision: string;
  loadRanks: () => unknown;
}

function loadCl100kRanks(): unknown {
  return require("js-tiktoken/ranks/cl100k_base") as unknown;
}

function loadO200kRanks(): unknown {
  return require("js-tiktoken/ranks/o200k_base") as unknown;
}

const DEFINITIONS: Record<TokenProfileId, ProfileDefinition> = {
  cl100k_base: {
    id: "cl100k_base",
    expectedHash:
      "9b9ea7feb9945beda9196f3691a3cc2d0f339aec498bbae285ce6aded387455c",
    revision: "js-tiktoken-1.0.21:cl100k:9b9ea7feb994",
    loadRanks: loadCl100kRanks,
  },
  o200k_base: {
    id: "o200k_base",
    expectedHash:
      "de7eb511338b0e23589a3cae2dceb8dd66c2a9fd70dbf7ea778fd9df9f175d45",
    revision: "js-tiktoken-1.0.21:o200k:de7eb511338b",
    loadRanks: loadO200kRanks,
  },
};

const BUILTIN_TOKEN_PROFILE_IDS: ReadonlySet<string> = new Set([
  "cl100k_base",
  "o200k_base",
]);

const profileCache = new Map<TokenProfileId, TokenProfile>();
const profileFailureCache = new Set<TokenProfileId>();
const rankCache = new Map<TokenProfileId, RankData>();
const tokenizerCache = new Map<TokenProfileId, Tiktoken>();
let liteRuntimeCache: LiteRuntimeModule | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
}

function unwrapDefaultExport(value: unknown): unknown {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, "default")
    ? value.default
    : value;
}

function snapshotRankData(value: unknown): RankData {
  const ranks = unwrapDefaultExport(value);
  if (
    !isRecord(ranks) ||
    !hasExactKeys(ranks, ["bpe_ranks", "pat_str", "special_tokens"]) ||
    typeof ranks.pat_str !== "string" ||
    ranks.pat_str.length === 0 ||
    typeof ranks.bpe_ranks !== "string" ||
    ranks.bpe_ranks.length === 0 ||
    !isRecord(ranks.special_tokens)
  ) {
    throw new TypeError("Tokenizer rank module has an invalid shape.");
  }
  const specialTokenEntries = Object.entries(ranks.special_tokens);
  for (const [token, id] of specialTokenEntries) {
    if (
      token.length === 0 ||
      typeof id !== "number" ||
      !Number.isSafeInteger(id) ||
      id < 0
    ) {
      throw new TypeError("Tokenizer rank module has invalid special tokens.");
    }
  }
  const specialTokens = Object.freeze(
    Object.fromEntries(specialTokenEntries) as Record<string, number>
  );
  return Object.freeze({
    pat_str: ranks.pat_str,
    special_tokens: specialTokens,
    bpe_ranks: ranks.bpe_ranks,
  });
}

function loadLiteRuntime(): LiteRuntimeModule {
  if (liteRuntimeCache) {
    return liteRuntimeCache;
  }
  const loaded = require("js-tiktoken/lite") as unknown;
  const runtime = unwrapDefaultExport(loaded);
  if (!isRecord(runtime) || typeof runtime.Tiktoken !== "function") {
    throw new TypeError("js-tiktoken/lite does not export Tiktoken.");
  }
  liteRuntimeCache = Object.freeze({
    Tiktoken: runtime.Tiktoken as unknown as TiktokenConstructor,
  });
  return liteRuntimeCache;
}

/** Returns whether an ID belongs to the permanently reserved built-in set. */
export function isBuiltinTokenProfileId(
  value: string
): value is TokenProfileId {
  return BUILTIN_TOKEN_PROFILE_IDS.has(value);
}

/** Returns the stable public reason for an unavailable built-in profile. */
export function getBuiltinTokenProfileUnavailableReason(
  id: TokenProfileId
): string {
  return `Tokenizer profile '${id}' is unavailable because its pinned rank data could not be loaded and verified.`;
}

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
  const cached = profileCache.get(id);
  if (cached) {
    return cached;
  }
  if (profileFailureCache.has(id)) {
    return undefined;
  }
  const definition = DEFINITIONS[id];
  if (!definition) {
    return undefined;
  }
  try {
    const ranks = snapshotRankData(definition.loadRanks());
    const rankHash = hashRankData(ranks);
    const properties = deriveRankProperties(ranks);
    if (
      rankHash !== definition.expectedHash ||
      !properties.byteComplete ||
      properties.maximumDecodedBytesPerToken <= 0
    ) {
      profileFailureCache.add(id);
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
    rankCache.set(id, ranks);
    profileCache.set(id, profile);
    return profile;
  } catch {
    profileFailureCache.add(id);
    return undefined;
  }
}

export function getMappedTokenProfileId(
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
  const id = getMappedTokenProfileId(provider, model);
  const profile = id ? getTokenProfileById(id) : undefined;
  if (!profile) {
    return {
      status: "unavailable",
      provider,
      model,
      mappingRevision: TOKEN_PROFILE_MAPPING_REVISION,
      reason: id
        ? getBuiltinTokenProfileUnavailableReason(id)
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
    const ranks = rankCache.get(profile.id);
    if (!ranks) {
      throw new Error("Verified tokenizer ranks are unavailable.");
    }
    const { Tiktoken: TiktokenRuntime } = loadLiteRuntime();
    tokenizer = new TiktokenRuntime(ranks);
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
  try {
    const tokens = getTokenizer(current).encode(text, [], []).length;
    if (!Number.isSafeInteger(tokens) || tokens < 0) {
      throw new Error("Tokenizer returned an invalid count.");
    }
    const count: PreparedPromptTokenCount = {
      tokens,
      method: "exact",
      tokenizerId: current.tokenizerId,
      tokenProfileRevision: current.revision,
    };
    return { status: "available", count };
  } catch {
    return {
      status: "unavailable",
      reason: `Token profile '${profile.id}' failed to count ordinary text.`,
    };
  }
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
