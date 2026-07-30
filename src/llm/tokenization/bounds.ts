import type { TokenBoundCertificateRef } from "../types";
import type {
  TokenBoundResult,
  TokenProfile,
} from "./types";
import { getTokenProfileById } from "./profiles";

function invalidBound(message: string): TokenBoundResult {
  return {
    status: "error",
    error: { code: "INVALID_TOKEN_BOUND", message },
  };
}

function checkedMultiply(left: number, right: number): number | undefined {
  if (left === 0 || right === 0) {
    return 0;
  }
  if (left > Math.floor(Number.MAX_SAFE_INTEGER / right)) {
    return undefined;
  }
  return left * right;
}

function validateNonnegativeSafeInteger(
  value: number,
  name: string
): TokenBoundResult | undefined {
  if (!Number.isSafeInteger(value) || value < 0) {
    return invalidBound(`${name} must be a nonnegative safe integer.`);
  }
  return undefined;
}

function validateProfile(
  profile: TokenProfile
): { profile: TokenProfile } | { reason: string } {
  const expectedKeys = [
    "byteComplete",
    "encoding",
    "id",
    "maximumDecodedBytesPerToken",
    "ordinaryTextOnly",
    "rankHash",
    "revision",
    "tokenizerId",
  ];
  if (
    typeof profile !== "object" ||
    profile === null ||
    Object.keys(profile).sort().join("\u0000") !== expectedKeys.join("\u0000")
  ) {
    return {
      reason: "The supplied token profile is not a canonical certified profile.",
    };
  }
  const current = getTokenProfileById(profile.id);
  if (
    !current ||
    current.revision !== profile.revision ||
    current.rankHash !== profile.rankHash
  ) {
    return {
      reason: `Token profile '${profile.id}' is unavailable or its pinned rank revision changed.`,
    };
  }
  if (!current.byteComplete) {
    return {
      reason: `Token profile '${profile.id}' has no byte-completeness proof.`,
    };
  }
  return { profile: current };
}

/**
 * Returns a structural retokenization bound for ordinary source-generation
 * tokens. No consumer/session margin is accepted or applied.
 */
export function retokenizationUpperBound(
  sourceTokenBound: number,
  sourceProfile: TokenProfile,
  targetProfile: TokenProfile
): TokenBoundResult {
  const invalid = validateNonnegativeSafeInteger(
    sourceTokenBound,
    "sourceTokenBound"
  );
  if (invalid) {
    return invalid;
  }
  const sourceValidation = validateProfile(sourceProfile);
  const targetValidation = validateProfile(targetProfile);
  if ("reason" in sourceValidation) {
    return {
      status: "unavailable",
      reason: sourceValidation.reason,
    };
  }
  if ("reason" in targetValidation) {
    return {
      status: "unavailable",
      reason: targetValidation.reason,
    };
  }
  const certifiedSource = sourceValidation.profile;
  const certifiedTarget = targetValidation.profile;

  // TextDecoder replacement can turn each invalid source byte into a three-byte
  // UTF-8 U+FFFD sequence. A byte-complete target needs at most one token per
  // resulting byte. This intentionally does not claim an n -> n identity bound.
  const decodedBytes = checkedMultiply(
    sourceTokenBound,
    certifiedSource.maximumDecodedBytesPerToken
  );
  const tokens = decodedBytes === undefined
    ? undefined
    : checkedMultiply(decodedBytes, 3);
  if (tokens === undefined) {
    return {
      status: "error",
      error: {
        code: "TOKEN_BOUND_OVERFLOW",
        message: "The retokenization upper bound exceeds Number.MAX_SAFE_INTEGER.",
      },
    };
  }

  const certificate: TokenBoundCertificateRef = {
    id: `ordinary-retokenization-v1:${certifiedSource.id}:${certifiedTarget.id}`,
    derivation:
      "sourceTokens * maxSourceDecodedBytesPerToken * 3 replacement expansion * 1 targetTokenPerByte",
    provenance:
      "Pinned js-tiktoken rank hashes; ordinary generation tokens only; special/control tokens excluded.",
    sourceProfileRevision: certifiedSource.revision,
    targetProfileRevision: certifiedTarget.revision,
  };
  return {
    status: "available",
    upperBound: { tokens, certificate },
  };
}

/**
 * Converts a Unicode code-point bound to a structural token bound for a
 * byte-complete target profile. No heuristic safety margin is involved.
 */
export function codePointBoundToTokenUpperBound(
  codePointBound: number,
  targetProfile: TokenProfile
): TokenBoundResult {
  const invalid = validateNonnegativeSafeInteger(
    codePointBound,
    "codePointBound"
  );
  if (invalid) {
    return invalid;
  }
  const profileValidation = validateProfile(targetProfile);
  if ("reason" in profileValidation) {
    return { status: "unavailable", reason: profileValidation.reason };
  }
  const certifiedTarget = profileValidation.profile;
  const tokens = checkedMultiply(codePointBound, 4);
  if (tokens === undefined) {
    return {
      status: "error",
      error: {
        code: "TOKEN_BOUND_OVERFLOW",
        message: "The code-point upper bound exceeds Number.MAX_SAFE_INTEGER.",
      },
    };
  }
  return {
    status: "available",
    upperBound: {
      tokens,
      certificate: {
        id: `unicode-code-points-to-${certifiedTarget.id}-v1`,
        derivation:
          "codePoints * 4 UTF-8 bytesPerCodePoint * 1 targetTokenPerByte",
        provenance:
          "Unicode scalar/replacement UTF-8 maximum and pinned byte-complete js-tiktoken ranks.",
        targetProfileRevision: certifiedTarget.revision,
      },
    },
  };
}
