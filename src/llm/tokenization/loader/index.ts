import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { createRequire } from "node:module";
import {
  computeContentTokenizerSemanticRevision,
} from "../contentProfiles";
import type { RegisteredContentTokenizerBackend } from "../types";
import type {
  ContentTokenizerRecipe,
  ContentTokenizerRecipeArtifact,
  ContentTokenizerRecipeSelfTestName,
  LoadContentTokenizerProfileOptions,
} from "../recipes/types";

const OPTIONAL_PEER = "@huggingface/tokenizers";
const OPTIONAL_PEER_RANGE = "^0.1.3";
const LOADER_IMPLEMENTATION_REVISION =
  "huggingface-tokenizer-json-v1-sanitize-special-added-tokens-v1";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/+~-]{0,127}$/;
const REQUIRED_SELF_TESTS: readonly ContentTokenizerRecipeSelfTestName[] = [
  "ascii-whitespace",
  "multilingual-dense",
  "combining-marks",
  "emoji-zwj",
  "control-characters",
  "special-token-literals",
];

export type ContentTokenizerLoaderErrorCode =
  | "TOKENIZER_PEER_MISSING"
  | "TOKENIZER_PEER_VERSION_UNSUPPORTED"
  | "TOKENIZER_RECIPE_INVALID"
  | "TOKENIZER_ARTIFACT_UNAVAILABLE"
  | "TOKENIZER_ARTIFACT_INTEGRITY"
  | "TOKENIZER_LOAD_FAILED"
  | "TOKENIZER_SELF_TEST_FAILED"
  | "TOKENIZER_ABORTED";

export class ContentTokenizerLoaderError extends Error {
  readonly code: ContentTokenizerLoaderErrorCode;

  readonly cause?: unknown;

  constructor(
    code: ContentTokenizerLoaderErrorCode,
    message: string,
    options: { cause?: unknown } = {}
  ) {
    super(message);
    this.name = "ContentTokenizerLoaderError";
    this.code = code;
    this.cause = options.cause;
  }
}

interface TokenizerEncoding {
  ids: number[];
}

interface TokenizerInstance {
  encode(
    text: string,
    options?: { add_special_tokens?: boolean }
  ): TokenizerEncoding;
}

interface TokenizerConstructor {
  new(tokenizer: object, config: object): TokenizerInstance;
}

interface TokenizerModule {
  Tokenizer: TokenizerConstructor;
}

interface ResolvedPeer {
  module: TokenizerModule;
  version: string;
}

const inFlightArtifacts = new Map<string, Promise<Buffer>>();

function loaderError(
  code: ContentTokenizerLoaderErrorCode,
  message: string,
  cause?: unknown
): ContentTokenizerLoaderError {
  return new ContentTokenizerLoaderError(code, message, { cause });
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw loaderError(
      "TOKENIZER_ABORTED",
      "Content-tokenizer loading was aborted.",
      signal.reason
    );
  }
}

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

function assertIdentifier(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `${name} must be a canonical nonempty identifier.`
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
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `${name} must be a canonical nonempty string.`
    );
  }
}

function validateArtifact(
  artifact: unknown,
  index: number
): ContentTokenizerRecipeArtifact {
  if (
    !isRecord(artifact) ||
    !hasExactKeys(artifact, ["revision", "role", "sha256", "source"])
  ) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `loaderInput.artifacts[${index}] must contain exactly role, source, revision, and sha256.`
    );
  }
  assertIdentifier(artifact.role, `loaderInput.artifacts[${index}].role`);
  if (
    typeof artifact.revision !== "string" ||
    !REVISION_PATTERN.test(artifact.revision)
  ) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `loaderInput.artifacts[${index}].revision must be an immutable 40-character lowercase commit digest.`
    );
  }
  if (
    typeof artifact.sha256 !== "string" ||
    !SHA256_PATTERN.test(artifact.sha256)
  ) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `loaderInput.artifacts[${index}].sha256 must be a lowercase SHA-256 digest.`
    );
  }
  if (typeof artifact.source !== "string") {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `loaderInput.artifacts[${index}].source must be an immutable HTTPS URL.`
    );
  }
  let source: URL;
  try {
    source = new URL(artifact.source);
  } catch (error) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `loaderInput.artifacts[${index}].source must be an immutable HTTPS URL.`,
      error
    );
  }
  let pathSegments: string[];
  try {
    pathSegments = source.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment));
  } catch (error) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `loaderInput.artifacts[${index}].source contains an invalid URL path encoding.`,
      error
    );
  }
  if (
    source.protocol !== "https:" ||
    !pathSegments.includes(artifact.revision)
  ) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `loaderInput.artifacts[${index}].source must contain its immutable revision in an HTTPS path.`
    );
  }
  return Object.freeze({
    role: artifact.role,
    source: artifact.source,
    revision: artifact.revision,
    sha256: artifact.sha256,
  });
}

function validateRecipe(recipe: ContentTokenizerRecipe): {
  recipe: ContentTokenizerRecipe;
  artifacts: ContentTokenizerRecipeArtifact[];
} {
  if (
    !isRecord(recipe) ||
    !hasExactKeys(recipe, [
      "coverageEvidence",
      "coverageRequiredRoles",
      "id",
      "loaderInput",
      "loaderKind",
      "selfTest",
      "semanticRevision",
      "textPolicy",
      "tokenizerId",
    ])
  ) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      "A content-tokenizer recipe contains unknown or missing fields."
    );
  }
  assertIdentifier(recipe.id, "recipe.id");
  assertCanonicalString(recipe.tokenizerId, "recipe.tokenizerId");
  if (recipe.loaderKind !== "huggingface-tokenizer-json-v1") {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `Unsupported content-tokenizer loader kind '${String(recipe.loaderKind)}'.`
    );
  }
  if (recipe.textPolicy !== "ordinary-text-no-specials-v1") {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      "recipe.textPolicy must be 'ordinary-text-no-specials-v1'."
    );
  }
  if (
    !isRecord(recipe.loaderInput) ||
    !hasExactKeys(recipe.loaderInput, ["artifacts"]) ||
    !Array.isArray(recipe.loaderInput.artifacts) ||
    recipe.loaderInput.artifacts.length !== 1
  ) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      "huggingface-tokenizer-json-v1 requires exactly one loader-input artifact."
    );
  }
  const artifacts = recipe.loaderInput.artifacts.map(validateArtifact);
  if (artifacts[0].role !== "tokenizer-json") {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      "huggingface-tokenizer-json-v1 requires the unique 'tokenizer-json' artifact role."
    );
  }
  const expectedRevision = computeContentTokenizerSemanticRevision({
    tokenizerImplementation: recipe.loaderKind,
    textPolicy: recipe.textPolicy,
    artifacts: artifacts.map(({ role, sha256 }) => ({ role, sha256 })),
  });
  if (recipe.semanticRevision !== expectedRevision) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      `recipe.semanticRevision must equal the canonical semantic revision '${expectedRevision}'.`
    );
  }
  validateSelfTests(recipe);
  validateCoverage(recipe, artifacts);
  return { recipe, artifacts };
}

function validateSelfTests(recipe: ContentTokenizerRecipe): void {
  if (!Array.isArray(recipe.selfTest)) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      "recipe.selfTest must be an array."
    );
  }
  const names = new Set<string>();
  for (const [index, selfTest] of recipe.selfTest.entries()) {
    if (
      !isRecord(selfTest) ||
      !hasExactKeys(selfTest, ["expectedTokens", "name", "text"]) ||
      !REQUIRED_SELF_TESTS.includes(
        selfTest.name as ContentTokenizerRecipeSelfTestName
      ) ||
      typeof selfTest.text !== "string" ||
      !Number.isSafeInteger(selfTest.expectedTokens) ||
      (selfTest.expectedTokens as number) < 0
    ) {
      throw loaderError(
        "TOKENIZER_RECIPE_INVALID",
        `recipe.selfTest[${index}] is invalid.`
      );
    }
    if (names.has(selfTest.name as string)) {
      throw loaderError(
        "TOKENIZER_RECIPE_INVALID",
        `recipe self-test '${String(selfTest.name)}' is duplicated.`
      );
    }
    names.add(selfTest.name as string);
  }
  for (const required of REQUIRED_SELF_TESTS) {
    if (!names.has(required)) {
      throw loaderError(
        "TOKENIZER_RECIPE_INVALID",
        `recipe is missing required '${required}' self-test evidence.`
      );
    }
  }
}

function validateCoverage(
  recipe: ContentTokenizerRecipe,
  artifacts: readonly ContentTokenizerRecipeArtifact[]
): void {
  if (
    !Array.isArray(recipe.coverageRequiredRoles) ||
    recipe.coverageRequiredRoles.length === 0
  ) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      "recipe.coverageRequiredRoles must be a nonempty array."
    );
  }
  const requiredRoles = new Set<string>();
  for (const [index, role] of recipe.coverageRequiredRoles.entries()) {
    assertIdentifier(role, `recipe.coverageRequiredRoles[${index}]`);
    if (requiredRoles.has(role)) {
      throw loaderError(
        "TOKENIZER_RECIPE_INVALID",
        `recipe coverage role '${role}' is duplicated.`
      );
    }
    requiredRoles.add(role);
  }
  const artifactDigests = new Map(
    artifacts.map(({ role, sha256 }) => [role, sha256])
  );
  if (
    requiredRoles.size !== artifactDigests.size ||
    [...requiredRoles].some((role) => !artifactDigests.has(role))
  ) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      "recipe coverage roles must exactly match loader-input semantic artifact roles."
    );
  }
  if (
    !Array.isArray(recipe.coverageEvidence) ||
    recipe.coverageEvidence.length === 0
  ) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      "recipe.coverageEvidence must be a nonempty array."
    );
  }
  const models = new Set<string>();
  for (const [index, coverage] of recipe.coverageEvidence.entries()) {
    if (
      !isRecord(coverage) ||
      !hasExactKeys(coverage, [
        "behaviorArtifacts",
        "modelId",
        "repository",
        "revision",
      ])
    ) {
      throw loaderError(
        "TOKENIZER_RECIPE_INVALID",
        `recipe.coverageEvidence[${index}] contains unknown or missing fields.`
      );
    }
    assertCanonicalString(
      coverage.modelId,
      `recipe.coverageEvidence[${index}].modelId`
    );
    assertCanonicalString(
      coverage.repository,
      `recipe.coverageEvidence[${index}].repository`
    );
    if (
      typeof coverage.revision !== "string" ||
      !REVISION_PATTERN.test(coverage.revision) ||
      !Array.isArray(coverage.behaviorArtifacts)
    ) {
      throw loaderError(
        "TOKENIZER_RECIPE_INVALID",
        `recipe.coverageEvidence[${index}] has invalid revision or behaviorArtifacts.`
      );
    }
    if (models.has(coverage.modelId)) {
      throw loaderError(
        "TOKENIZER_RECIPE_INVALID",
        `recipe coverage model '${coverage.modelId}' is duplicated.`
      );
    }
    models.add(coverage.modelId);
    const roles = new Set<string>();
    for (const [artifactIndex, artifact] of
      coverage.behaviorArtifacts.entries()) {
      if (
        !isRecord(artifact) ||
        !hasExactKeys(artifact, ["path", "role", "sha256"])
      ) {
        throw loaderError(
          "TOKENIZER_RECIPE_INVALID",
          `recipe.coverageEvidence[${index}].behaviorArtifacts[${artifactIndex}] is invalid.`
        );
      }
      assertIdentifier(
        artifact.role,
        `recipe.coverageEvidence[${index}].behaviorArtifacts[${artifactIndex}].role`
      );
      assertCanonicalString(
        artifact.path,
        `recipe.coverageEvidence[${index}].behaviorArtifacts[${artifactIndex}].path`
      );
      if (
        typeof artifact.sha256 !== "string" ||
        !SHA256_PATTERN.test(artifact.sha256) ||
        artifact.sha256 !== artifactDigests.get(artifact.role)
      ) {
        throw loaderError(
          "TOKENIZER_RECIPE_INVALID",
          `recipe coverage artifact '${String(artifact.role)}' does not match loader-input semantics.`
        );
      }
      if (roles.has(artifact.role)) {
        throw loaderError(
          "TOKENIZER_RECIPE_INVALID",
          `recipe coverage role '${artifact.role}' is duplicated for '${coverage.modelId}'.`
        );
      }
      roles.add(artifact.role);
    }
    if (
      roles.size !== requiredRoles.size ||
      [...requiredRoles].some((role) => !roles.has(role))
    ) {
      throw loaderError(
        "TOKENIZER_RECIPE_INVALID",
        `recipe coverage for '${coverage.modelId}' does not contain exactly the required roles.`
      );
    }
  }
}

function hashBuffer(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function quarantineCorruptArtifact(
  artifactPath: string
): Promise<string | undefined> {
  const quarantinePath =
    `${artifactPath}.corrupt-${Date.now()}-${randomUUID()}`;
  try {
    await rename(artifactPath, quarantinePath);
    return quarantinePath;
  } catch (error) {
    if (
      isRecord(error) &&
      (error.code === "ENOENT" || error.code === "EACCES")
    ) {
      return undefined;
    }
    throw error;
  }
}

async function readVerifiedArtifact(
  artifactPath: string,
  expectedSha256: string
): Promise<Buffer | undefined> {
  let value: Buffer;
  try {
    value = await readFile(artifactPath);
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  if (hashBuffer(value) === expectedSha256) {
    return value;
  }
  const quarantinePath = await quarantineCorruptArtifact(artifactPath);
  throw loaderError(
    "TOKENIZER_ARTIFACT_INTEGRITY",
    `Cached tokenizer artifact failed SHA-256 verification; expected ${expectedSha256}.` +
      (quarantinePath
        ? ` The corrupt blob was quarantined at '${quarantinePath}'.`
        : " The corrupt blob could not be quarantined.")
  );
}

async function downloadArtifact(
  artifact: ContentTokenizerRecipeArtifact,
  artifactPath: string,
  signal?: AbortSignal
): Promise<Buffer> {
  assertNotAborted(signal);
  let response: Response;
  try {
    response = await fetch(artifact.source, { signal });
  } catch (error) {
    if (signal?.aborted) {
      throw loaderError(
        "TOKENIZER_ABORTED",
        "Content-tokenizer artifact download was aborted.",
        signal.reason ?? error
      );
    }
    throw loaderError(
      "TOKENIZER_ARTIFACT_UNAVAILABLE",
      `Failed to download tokenizer artifact '${artifact.role}'.`,
      error
    );
  }
  if (!response.ok) {
    throw loaderError(
      "TOKENIZER_ARTIFACT_UNAVAILABLE",
      `Tokenizer artifact '${artifact.role}' download failed with HTTP ${response.status}.`
    );
  }
  let value: Buffer;
  try {
    value = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (signal?.aborted) {
      throw loaderError(
        "TOKENIZER_ABORTED",
        "Content-tokenizer artifact download was aborted.",
        signal.reason ?? error
      );
    }
    throw loaderError(
      "TOKENIZER_ARTIFACT_UNAVAILABLE",
      `Failed to read tokenizer artifact '${artifact.role}' download.`,
      error
    );
  }
  assertNotAborted(signal);
  const actualSha256 = hashBuffer(value);
  if (actualSha256 !== artifact.sha256) {
    throw loaderError(
      "TOKENIZER_ARTIFACT_INTEGRITY",
      `Downloaded tokenizer artifact '${artifact.role}' has SHA-256 ${actualSha256}; expected ${artifact.sha256}.`
    );
  }

  await mkdir(dirname(artifactPath), { recursive: true });
  const temporaryPath = `${artifactPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, value, { flag: "wx" });
    try {
      await rename(temporaryPath, artifactPath);
    } catch (error) {
      const existing = await readVerifiedArtifact(
        artifactPath,
        artifact.sha256
      );
      if (!existing) {
        throw error;
      }
      return existing;
    }
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
  return value;
}

async function provisionArtifact(
  artifact: ContentTokenizerRecipeArtifact,
  options: LoadContentTokenizerProfileOptions
): Promise<Buffer> {
  const cacheRoot = resolve(options.cacheDir);
  const artifactPath = join(cacheRoot, "sha256", artifact.sha256);
  const key = `${artifactPath}\u0000${artifact.sha256}`;
  const existing = inFlightArtifacts.get(key);
  if (existing) {
    return existing;
  }
  const promise = (async (): Promise<Buffer> => {
    assertNotAborted(options.signal);
    try {
      const cached = await readVerifiedArtifact(
        artifactPath,
        artifact.sha256
      );
      if (cached) {
        return cached;
      }
    } catch (error) {
      if (
        !(error instanceof ContentTokenizerLoaderError) ||
        error.code !== "TOKENIZER_ARTIFACT_INTEGRITY" ||
        !options.allowDownload
      ) {
        throw error;
      }
    }
    if (!options.allowDownload) {
      throw loaderError(
        "TOKENIZER_ARTIFACT_UNAVAILABLE",
        `Tokenizer artifact '${artifact.role}' is absent from cache and downloads are disabled.`
      );
    }
    return downloadArtifact(artifact, artifactPath, options.signal);
  })();
  inFlightArtifacts.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inFlightArtifacts.get(key) === promise) {
      inFlightArtifacts.delete(key);
    }
  }
}

function parseVersion(value: string):
{ major: number; minor: number; patch: number } | undefined {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
      .exec(value);
  if (!match) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function isSupportedPeerVersion(value: string): boolean {
  const parsed = parseVersion(value);
  return Boolean(
    parsed &&
    parsed.major === 0 &&
    parsed.minor === 1 &&
    parsed.patch >= 3
  );
}

async function findPeerPackageVersion(entryPath: string): Promise<string> {
  let current = dirname(await realpath(entryPath));
  const root = parse(current).root;
  while (true) {
    const manifestPath = join(current, "package.json");
    try {
      const manifest = JSON.parse(
        await readFile(manifestPath, "utf8")
      ) as unknown;
      if (isRecord(manifest) && manifest.name === OPTIONAL_PEER) {
        if (
          typeof manifest.version !== "string" ||
          !isSupportedPeerVersion(manifest.version)
        ) {
          throw loaderError(
            "TOKENIZER_PEER_VERSION_UNSUPPORTED",
            `${OPTIONAL_PEER} runtime version '${String(manifest.version)}' is unsupported; install ${OPTIONAL_PEER}@${OPTIONAL_PEER_RANGE}.`
          );
        }
        return manifest.version;
      }
    } catch (error) {
      if (
        error instanceof ContentTokenizerLoaderError &&
        error.code === "TOKENIZER_PEER_VERSION_UNSUPPORTED"
      ) {
        throw error;
      }
      if (!isRecord(error) || error.code !== "ENOENT") {
        throw loaderError(
          "TOKENIZER_PEER_VERSION_UNSUPPORTED",
          `Could not validate the installed ${OPTIONAL_PEER} runtime version.`,
          error
        );
      }
    }
    if (current === root) {
      break;
    }
    current = dirname(current);
  }
  throw loaderError(
    "TOKENIZER_PEER_VERSION_UNSUPPORTED",
    `Could not locate a package manifest proving the installed ${OPTIONAL_PEER} runtime version.`
  );
}

async function resolvePeer(): Promise<ResolvedPeer> {
  const localRequire = createRequire(__filename);
  let entryPath: string;
  try {
    entryPath = localRequire.resolve(OPTIONAL_PEER);
  } catch (error) {
    if (
      isRecord(error) &&
      error.code === "MODULE_NOT_FOUND" &&
      typeof error.message === "string" &&
      error.message.includes(OPTIONAL_PEER)
    ) {
      throw loaderError(
        "TOKENIZER_PEER_MISSING",
        `${OPTIONAL_PEER}@${OPTIONAL_PEER_RANGE} is required only when loading a local content tokenizer. Install it with: npm install ${OPTIONAL_PEER}@${OPTIONAL_PEER_RANGE}`,
        error
      );
    }
    throw error;
  }
  const version = await findPeerPackageVersion(entryPath);
  let loaded: unknown;
  try {
    loaded = await import(OPTIONAL_PEER);
  } catch (error) {
    throw loaderError(
      "TOKENIZER_LOAD_FAILED",
      `The installed ${OPTIONAL_PEER} runtime failed during module evaluation.`,
      error
    );
  }
  if (
    !isRecord(loaded) ||
    typeof loaded.Tokenizer !== "function"
  ) {
    throw loaderError(
      "TOKENIZER_LOAD_FAILED",
      `The installed ${OPTIONAL_PEER} runtime does not export Tokenizer.`
    );
  }
  return {
    module: loaded as unknown as TokenizerModule,
    version,
  };
}

function sanitizeTokenizerJson(value: unknown): object {
  if (!isRecord(value) || !Array.isArray(value.added_tokens)) {
    throw loaderError(
      "TOKENIZER_LOAD_FAILED",
      "The tokenizer-json artifact is missing its added_tokens manifest."
    );
  }
  const sanitized = structuredClone(value);
  if (!isRecord(sanitized) || !Array.isArray(sanitized.added_tokens)) {
    throw loaderError(
      "TOKENIZER_LOAD_FAILED",
      "The tokenizer-json artifact could not be sanitized."
    );
  }
  sanitized.added_tokens = sanitized.added_tokens.filter(
    (token) => !isRecord(token) || token.special !== true
  );
  return sanitized;
}

function initializeTokenizer(
  Tokenizer: TokenizerConstructor,
  artifact: Buffer
): TokenizerInstance {
  let parsed: unknown;
  try {
    parsed = JSON.parse(artifact.toString("utf8")) as unknown;
  } catch (error) {
    throw loaderError(
      "TOKENIZER_LOAD_FAILED",
      "The verified tokenizer-json artifact is not valid JSON.",
      error
    );
  }
  try {
    return new Tokenizer(sanitizeTokenizerJson(parsed), {});
  } catch (error) {
    if (error instanceof ContentTokenizerLoaderError) {
      throw error;
    }
    throw loaderError(
      "TOKENIZER_LOAD_FAILED",
      "The tokenizer runtime could not initialize the verified recipe.",
      error
    );
  }
}

function countOrdinaryText(
  tokenizer: TokenizerInstance,
  text: string
): number {
  const encoding = tokenizer.encode(text, { add_special_tokens: false });
  const count = encoding.ids.length;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(
      "The tokenizer runtime returned a count that is not a nonnegative safe integer."
    );
  }
  return count;
}

function runSelfTests(
  tokenizer: TokenizerInstance,
  recipe: ContentTokenizerRecipe
): void {
  for (const selfTest of recipe.selfTest) {
    const actual = countOrdinaryText(tokenizer, selfTest.text);
    if (actual !== selfTest.expectedTokens) {
      throw loaderError(
        "TOKENIZER_SELF_TEST_FAILED",
        `Content-tokenizer self-test '${selfTest.name}' expected ${selfTest.expectedTokens} tokens but observed ${actual}.`
      );
    }
  }
}

/**
 * Provisions and verifies an explicit recipe, then returns a synchronous local
 * model-quality backend. Ordinary counting performs no I/O or dynamic import.
 */
export async function loadContentTokenizerProfile(
  recipe: ContentTokenizerRecipe,
  options: LoadContentTokenizerProfileOptions
): Promise<RegisteredContentTokenizerBackend> {
  const validated = validateRecipe(recipe);
  if (
    !isRecord(options) ||
    !hasExactKeys(
      options,
      options.signal === undefined
        ? ["allowDownload", "cacheDir"]
        : ["allowDownload", "cacheDir", "signal"]
    ) ||
    typeof options.cacheDir !== "string" ||
    options.cacheDir.length === 0 ||
    typeof options.allowDownload !== "boolean" ||
    (options.signal !== undefined && !(options.signal instanceof AbortSignal))
  ) {
    throw loaderError(
      "TOKENIZER_RECIPE_INVALID",
      "Loader options must contain cacheDir, allowDownload, and optional signal."
    );
  }
  assertNotAborted(options.signal);
  const { module, version } = await resolvePeer();
  const artifact = await provisionArtifact(validated.artifacts[0], options);
  assertNotAborted(options.signal);
  const tokenizer = initializeTokenizer(module.Tokenizer, artifact);
  runSelfTests(tokenizer, validated.recipe);
  const semanticArtifacts = validated.artifacts.map(({ role, sha256 }) =>
    Object.freeze({ role, sha256 })
  );
  Object.freeze(semanticArtifacts);
  const semantic = Object.freeze({
    tokenizerImplementation: validated.recipe.loaderKind,
    textPolicy: validated.recipe.textPolicy,
    artifacts: semanticArtifacts,
  });
  return Object.freeze({
    id: validated.recipe.id,
    tokenizerId: validated.recipe.tokenizerId,
    revision: validated.recipe.semanticRevision,
    provenance: Object.freeze({
      semantic,
      runtime: Object.freeze({
        packageName: OPTIONAL_PEER,
        packageVersion: version,
        loaderImplementationRevision: LOADER_IMPLEMENTATION_REVISION,
      }),
    }),
    countTextTokens: (text: string): number =>
      countOrdinaryText(tokenizer, text),
  });
}
