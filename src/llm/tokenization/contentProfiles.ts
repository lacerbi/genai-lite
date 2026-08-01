import { createHash } from "node:crypto";
import type { ApiProviderId, PreparedPromptTokenCount } from "../types";
import {
  countTextTokens,
  getMappedTokenProfileId,
  getTokenProfileById,
} from "./profiles";
import {
  TOKEN_PROFILE_MAPPING_REVISION,
  type ContentTokenProfile,
  type ContentTokenProfileAlias,
  type ContentTokenProfileConfiguration,
  type ContentTokenProfileResolution,
  type ContentTokenizerBackendProvenance,
  type ContentTokenizerRuntimeProvenance,
  type ContentTokenizerSemanticArtifact,
  type ContentTokenizerSemanticProvenance,
  type RegisteredContentTokenizerBackend,
  type TokenCountResult,
} from "./types";

const SEMANTIC_REVISION_DOMAIN =
  "genai-lite-content-token-profile-semantic-v1\u0000";
const MAPPING_REVISION_DOMAIN =
  "genai-lite-content-token-mapping-v1\u0000";
const TEXT_POLICY = "ordinary-text-no-specials-v1" as const;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PACKAGE_NAME_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

interface CanonicalRegisteredBackend {
  backend: RegisteredContentTokenizerBackend;
  profile: ContentTokenProfile;
  provenance: ContentTokenizerBackendProvenance;
}

interface RegistryState {
  backends: Map<string, CanonicalRegisteredBackend>;
  aliases: Map<string, ContentTokenProfileAlias>;
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

function assertCanonicalString(
  value: unknown,
  name: string
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError(`${name} must be a nonempty canonical string.`);
  }
}

function canonicalizeSemanticProvenance(
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

function canonicalizeRuntimeProvenance(
  value: unknown
): ContentTokenizerRuntimeProvenance {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "packageName",
      "packageVersion",
      "loaderImplementationRevision",
    ])
  ) {
    throw new TypeError(
      "provenance.runtime must contain exactly packageName, packageVersion, and loaderImplementationRevision."
    );
  }
  if (
    typeof value.packageName !== "string" ||
    !PACKAGE_NAME_PATTERN.test(value.packageName)
  ) {
    throw new TypeError(
      "provenance.runtime.packageName must be a canonical npm package name."
    );
  }
  if (
    typeof value.packageVersion !== "string" ||
    !SEMVER_PATTERN.test(value.packageVersion)
  ) {
    throw new TypeError(
      "provenance.runtime.packageVersion must be a canonical semantic version."
    );
  }
  assertIdentifier(
    value.loaderImplementationRevision,
    "provenance.runtime.loaderImplementationRevision"
  );
  return Object.freeze({
    packageName: value.packageName,
    packageVersion: value.packageVersion,
    loaderImplementationRevision: value.loaderImplementationRevision,
  });
}

function canonicalizeProvenance(
  value: unknown
): ContentTokenizerBackendProvenance {
  if (!isRecord(value)) {
    throw new TypeError("provenance must be an object.");
  }
  const expected = value.runtime === undefined
    ? ["semantic"]
    : ["runtime", "semantic"];
  if (!hasExactKeys(value, expected)) {
    throw new TypeError(
      "provenance must contain exactly semantic and optional runtime."
    );
  }
  const semantic = canonicalizeSemanticProvenance(value.semantic);
  const runtime = value.runtime === undefined
    ? undefined
    : canonicalizeRuntimeProvenance(value.runtime);
  return Object.freeze(runtime ? { semantic, runtime } : { semantic });
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
  const canonical = canonicalizeSemanticProvenance(provenance);
  return createHash("sha256")
    .update(SEMANTIC_REVISION_DOMAIN)
    .update(semanticRevisionInput(canonical))
    .digest("hex");
}

function aliasKey(providerId: ApiProviderId, modelId: string): string {
  return JSON.stringify([providerId, modelId]);
}

function toBuiltinContentProfile(
  id: "cl100k_base" | "o200k_base"
): ContentTokenProfile | undefined {
  const certified = getTokenProfileById(id);
  if (!certified) {
    return undefined;
  }
  return Object.freeze({
    id: certified.id,
    tokenizerId: certified.tokenizerId,
    revision: certified.revision,
    quality: "exact",
    origin: "builtin",
  });
}

export class ContentTokenProfileRegistry {
  private _state: RegistryState = {
    backends: new Map(),
    aliases: new Map(),
  };

  private _registrationInProgress = false;

  private _mappingRevision?: string;

  register(configuration: ContentTokenProfileConfiguration): void {
    if (this._registrationInProgress) {
      throw new Error(
        "Content-token profile registration is already in progress."
      );
    }
    this._registrationInProgress = true;
    try {
      if (
        !isRecord(configuration) ||
        !hasExactKeys(configuration, ["backends", "aliases"]) ||
        !Array.isArray(configuration.backends) ||
        !Array.isArray(configuration.aliases)
      ) {
        throw new TypeError(
          "Content-token profile configuration must contain exactly backends and aliases arrays."
        );
      }

      const nextBackends = new Map(this._state.backends);
      const nextAliases = new Map(this._state.aliases);
      for (const backend of configuration.backends) {
        const canonical = this.validateBackend(backend);
        if (
          nextBackends.has(canonical.profile.id) ||
          getTokenProfileById(canonical.profile.id as "cl100k_base" | "o200k_base")
        ) {
          throw new Error(
            `Content-token profile id '${canonical.profile.id}' is already registered.`
          );
        }
        nextBackends.set(canonical.profile.id, canonical);
      }

      for (const alias of configuration.aliases) {
        const canonical = this.validateAlias(alias, nextBackends);
        const key = aliasKey(canonical.providerId, canonical.modelId);
        if (
          nextAliases.has(key) ||
          getMappedTokenProfileId(canonical.providerId, canonical.modelId)
        ) {
          throw new Error(
            `Content-token alias '${canonical.providerId}/${canonical.modelId}' conflicts with an existing exact alias.`
          );
        }
        nextAliases.set(key, canonical);
      }

      this._state = { backends: nextBackends, aliases: nextAliases };
      this._mappingRevision = undefined;
    } finally {
      this._registrationInProgress = false;
    }
  }

  resolve(
    providerId: ApiProviderId,
    modelId: string
  ): ContentTokenProfileResolution {
    const mappingRevision = this.mappingRevision();
    const builtinId = getMappedTokenProfileId(providerId, modelId);
    if (builtinId) {
      const profile = toBuiltinContentProfile(builtinId);
      if (profile) {
        return {
          status: "available",
          provider: providerId,
          model: modelId,
          mappingRevision,
          profile,
        };
      }
      return {
        status: "unavailable",
        provider: providerId,
        model: modelId,
        mappingRevision,
        reason: `Tokenizer rank data for '${builtinId}' did not match its pinned revision.`,
      };
    }

    const alias = this._state.aliases.get(aliasKey(providerId, modelId));
    const builtinAliasProfile = alias &&
      (alias.profileId === "cl100k_base" || alias.profileId === "o200k_base")
      ? toBuiltinContentProfile(alias.profileId)
      : undefined;
    const profile = alias
      ? builtinAliasProfile ?? this._state.backends.get(alias.profileId)?.profile
      : undefined;
    if (!profile) {
      return {
        status: "unavailable",
        provider: providerId,
        model: modelId,
        mappingRevision,
        reason: `No content-token profile is registered for ${providerId}/${modelId}.`,
      };
    }
    return {
      status: "available",
      provider: providerId,
      model: modelId,
      mappingRevision,
      profile,
    };
  }

  getById(profileId: string): ContentTokenProfile | undefined {
    if (profileId === "cl100k_base" || profileId === "o200k_base") {
      return toBuiltinContentProfile(profileId);
    }
    return this._state.backends.get(profileId)?.profile;
  }

  count(text: string, profile: ContentTokenProfile): TokenCountResult {
    if (typeof text !== "string") {
      return {
        status: "unavailable",
        reason: "Content-token counting requires ordinary JavaScript string text.",
      };
    }
    if (
      !isRecord(profile) ||
      !hasExactKeys(profile, [
        "id",
        "origin",
        "quality",
        "revision",
        "tokenizerId",
      ])
    ) {
      return {
        status: "unavailable",
        reason: "The supplied content-token profile is not canonical.",
      };
    }

    if (profile.origin === "builtin" && profile.quality === "exact") {
      if (profile.id !== "cl100k_base" && profile.id !== "o200k_base") {
        return {
          status: "unavailable",
          reason: `Built-in content-token profile '${profile.id}' is unavailable.`,
        };
      }
      const current = toBuiltinContentProfile(profile.id);
      const certified = getTokenProfileById(profile.id);
      if (
        !current ||
        !certified ||
        current.tokenizerId !== profile.tokenizerId ||
        current.revision !== profile.revision
      ) {
        return {
          status: "unavailable",
          reason: `Content-token profile '${profile.id}' is unavailable at revision '${profile.revision}'.`,
        };
      }
      return countTextTokens(text, certified);
    }

    if (profile.origin !== "registered" || profile.quality !== "model") {
      return {
        status: "unavailable",
        reason: "The supplied content-token profile has an invalid trust classification.",
      };
    }
    const registered = this._state.backends.get(profile.id);
    if (
      !registered ||
      registered.profile.tokenizerId !== profile.tokenizerId ||
      registered.profile.revision !== profile.revision
    ) {
      return {
        status: "unavailable",
        reason: `Content-token profile '${profile.id}' is unavailable at revision '${profile.revision}'.`,
      };
    }
    try {
      const tokens = registered.backend.countTextTokens(text);
      if (!Number.isSafeInteger(tokens) || tokens < 0) {
        return {
          status: "unavailable",
          reason: `Content-token profile '${profile.id}' returned a count that is not a nonnegative safe integer.`,
        };
      }
      const count: PreparedPromptTokenCount = {
        tokens,
        method: "model",
        tokenizerId: registered.profile.tokenizerId,
        tokenProfileRevision: registered.profile.revision,
      };
      return { status: "available", count };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        status: "unavailable",
        reason: `Content-token profile '${profile.id}' failed to count text: ${detail}`,
      };
    }
  }

  getMappingRevision(): string {
    return this.mappingRevision();
  }

  private validateBackend(
    backend: RegisteredContentTokenizerBackend
  ): CanonicalRegisteredBackend {
    if (
      !isRecord(backend) ||
      !hasExactKeys(backend, [
        "countTextTokens",
        "id",
        "provenance",
        "revision",
        "tokenizerId",
      ])
    ) {
      throw new TypeError(
        "A registered content-token backend must contain exactly id, tokenizerId, revision, provenance, and countTextTokens."
      );
    }
    assertIdentifier(backend.id, "backend.id");
    assertCanonicalString(backend.tokenizerId, "backend.tokenizerId");
    if (typeof backend.countTextTokens !== "function") {
      throw new TypeError("backend.countTextTokens must be a function.");
    }
    const provenance = canonicalizeProvenance(backend.provenance);
    const expectedRevision = computeContentTokenizerSemanticRevision(
      provenance.semantic
    );
    if (backend.revision !== expectedRevision) {
      throw new TypeError(
        `backend.revision must equal the canonical semantic revision '${expectedRevision}'.`
      );
    }

    let probe: unknown;
    try {
      probe = backend.countTextTokens("");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new TypeError(
        `backend.countTextTokens failed its synchronous empty-string probe: ${detail}`
      );
    }
    if (
      typeof (probe as { then?: unknown })?.then === "function" ||
      !Number.isSafeInteger(probe) ||
      (probe as number) < 0
    ) {
      throw new TypeError(
        "backend.countTextTokens must synchronously return a nonnegative safe integer."
      );
    }

    const canonicalBackend: RegisteredContentTokenizerBackend = Object.freeze({
      id: backend.id,
      tokenizerId: backend.tokenizerId,
      revision: expectedRevision,
      provenance,
      countTextTokens: backend.countTextTokens,
    });
    return {
      backend: canonicalBackend,
      profile: Object.freeze({
        id: backend.id,
        tokenizerId: backend.tokenizerId,
        revision: expectedRevision,
        quality: "model",
        origin: "registered",
      }),
      provenance,
    };
  }

  private validateAlias(
    alias: ContentTokenProfileAlias,
    backends: ReadonlyMap<string, CanonicalRegisteredBackend>
  ): ContentTokenProfileAlias {
    if (
      !isRecord(alias) ||
      !hasExactKeys(alias, ["modelId", "profileId", "providerId"])
    ) {
      throw new TypeError(
        "A content-token alias must contain exactly providerId, modelId, and profileId."
      );
    }
    assertIdentifier(alias.providerId, "alias.providerId");
    assertCanonicalString(alias.modelId, "alias.modelId");
    assertIdentifier(alias.profileId, "alias.profileId");
    const targetIsBuiltin =
      alias.profileId === "cl100k_base" || alias.profileId === "o200k_base"
        ? Boolean(getTokenProfileById(alias.profileId))
        : false;
    if (!backends.has(alias.profileId) && !targetIsBuiltin) {
      throw new Error(
        `Content-token alias '${alias.providerId}/${alias.modelId}' targets unknown profile '${alias.profileId}'.`
      );
    }
    return Object.freeze({
      providerId: alias.providerId,
      modelId: alias.modelId,
      profileId: alias.profileId,
    });
  }

  private mappingRevision(): string {
    if (!this._mappingRevision) {
      const backends = [...this._state.backends.values()]
        .map(({ profile, provenance }) => ({
          id: profile.id,
          tokenizerId: profile.tokenizerId,
          revision: profile.revision,
          quality: profile.quality,
          semantic: provenance.semantic,
          ...(provenance.runtime ? { runtime: provenance.runtime } : {}),
        }))
        .sort((left, right) =>
          compareCanonicalStrings(left.id, right.id)
        );
      const aliases = [...this._state.aliases.values()]
        .map(({ providerId, modelId, profileId }) => ({
          providerId,
          modelId,
          profileId,
        }))
        .sort((left, right) =>
          compareCanonicalStrings(
            aliasKey(left.providerId, left.modelId),
            aliasKey(right.providerId, right.modelId)
          )
        );
      this._mappingRevision = createHash("sha256")
        .update(MAPPING_REVISION_DOMAIN)
        .update(JSON.stringify({
          builtinMappingRevision: TOKEN_PROFILE_MAPPING_REVISION,
          backends,
          aliases,
        }))
        .digest("hex");
    }
    return this._mappingRevision;
  }
}

const productionRegistry = new ContentTokenProfileRegistry();

/**
 * Atomically appends synchronous content-tokenizer backends and exact
 * provider/model aliases. Existing backend IDs and aliases cannot be replaced.
 */
export function registerContentTokenProfileConfiguration(
  configuration: ContentTokenProfileConfiguration
): void {
  productionRegistry.register(configuration);
}

/** Resolves an exact built-in or registered content-token profile. */
export function resolveContentTokenProfile(
  providerId: ApiProviderId,
  modelId: string
): ContentTokenProfileResolution {
  return productionRegistry.resolve(providerId, modelId);
}

/** Looks up a content-token profile by its stable profile ID. */
export function getContentTokenProfileById(
  profileId: string
): ContentTokenProfile | undefined {
  return productionRegistry.getById(profileId);
}

/** Counts ordinary string text with a canonical exact or model profile. */
export function countContentTextTokens(
  text: string,
  profile: ContentTokenProfile
): TokenCountResult {
  return productionRegistry.count(text, profile);
}

/** Returns the current production-registry snapshot's deterministic mapping ID. */
export function getContentTokenProfileMappingRevision(): string {
  return productionRegistry.getMappingRevision();
}
