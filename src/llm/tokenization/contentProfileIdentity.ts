import { createHash } from "node:crypto";
import type {
  ContentTokenizerSemanticArtifact,
  ContentTokenizerSemanticProvenance,
} from "./types";

const SEMANTIC_REVISION_DOMAIN =
  "genai-lite-content-token-profile-semantic-v1\u0000";
const TEXT_POLICY = "ordinary-text-no-specials-v1" as const;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertIdentifier(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new TypeError(
      `${name} must be a nonempty canonical identifier of at most 128 characters.`
    );
  }
}

export function canonicalizeContentTokenizerSemanticProvenance(
  value: unknown
): ContentTokenizerSemanticProvenance {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "tokenizerImplementation",
      "textPolicy",
      "artifacts",
    ])
  ) {
    throw new TypeError(
      "provenance.semantic must contain exactly tokenizerImplementation, textPolicy, and artifacts."
    );
  }
  assertIdentifier(
    value.tokenizerImplementation,
    "provenance.semantic.tokenizerImplementation"
  );
  if (value.textPolicy !== TEXT_POLICY) {
    throw new TypeError(
      `provenance.semantic.textPolicy must be '${TEXT_POLICY}'.`
    );
  }
  if (!Array.isArray(value.artifacts)) {
    throw new TypeError("provenance.semantic.artifacts must be an array.");
  }

  const seenRoles = new Set<string>();
  const artifacts: ContentTokenizerSemanticArtifact[] = value.artifacts.map(
    (artifact, index) => {
      if (
        !isRecord(artifact) ||
        !hasExactKeys(artifact, ["role", "sha256"])
      ) {
        throw new TypeError(
          `provenance.semantic.artifacts[${index}] must contain exactly role and sha256.`
        );
      }
      assertIdentifier(
        artifact.role,
        `provenance.semantic.artifacts[${index}].role`
      );
      if (
        typeof artifact.sha256 !== "string" ||
        !SHA256_PATTERN.test(artifact.sha256)
      ) {
        throw new TypeError(
          `provenance.semantic.artifacts[${index}].sha256 must be a lowercase SHA-256 digest.`
        );
      }
      if (seenRoles.has(artifact.role)) {
        throw new TypeError(
          `provenance.semantic artifact role '${artifact.role}' is duplicated.`
        );
      }
      seenRoles.add(artifact.role);
      return Object.freeze({
        role: artifact.role,
        sha256: artifact.sha256,
      });
    }
  );
  artifacts.sort((left, right) =>
    compareCanonicalStrings(left.role, right.role)
  );
  return Object.freeze({
    tokenizerImplementation: value.tokenizerImplementation,
    textPolicy: TEXT_POLICY,
    artifacts: Object.freeze(artifacts) as unknown as ContentTokenizerSemanticArtifact[],
  });
}

function semanticRevisionInput(
  provenance: ContentTokenizerSemanticProvenance
): string {
  return JSON.stringify({
    tokenizerImplementation: provenance.tokenizerImplementation,
    textPolicy: provenance.textPolicy,
    artifacts: provenance.artifacts.map(({ role, sha256 }) => ({
      role,
      sha256,
    })),
  });
}

/**
 * Computes the stable semantic identity for a content-tokenizer backend.
 * Runtime package details, aliases, cache paths, and callbacks are excluded.
 */
export function computeContentTokenizerSemanticRevision(
  provenance: ContentTokenizerSemanticProvenance
): string {
  const canonical = canonicalizeContentTokenizerSemanticProvenance(provenance);
  return createHash("sha256")
    .update(SEMANTIC_REVISION_DOMAIN)
    .update(semanticRevisionInput(canonical))
    .digest("hex");
}
