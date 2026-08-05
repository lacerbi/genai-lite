const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "genai-lite-packed-api-"));
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("Run this verification through npm run test:packed-api.");
}

function runNpm(args, options) {
  return execFileSync(process.execPath, [npmCli, ...args], options);
}

function runNode(script, cwd, env = {}, args = []) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

function collectDeclarationFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectDeclarationFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".d.ts") ? [entryPath] : [];
  });
}

try {
  const packed = JSON.parse(
    runNpm(
      ["pack", "--json", "--pack-destination", temp],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      }
    )
  );
  const tarball = path.join(temp, packed[0].filename);
  const consumer = path.join(temp, "consumer");
  fs.mkdirSync(consumer);
  fs.writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: { "genai-lite": `file:${tarball}` },
      devDependencies: { typescript: ">=5.3.3" },
    })
  );
  fs.writeFileSync(
    path.join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "Node16",
        moduleResolution: "Node16",
        target: "ES2020",
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ["consumer.ts"],
    })
  );
  fs.writeFileSync(
    path.join(consumer, "consumer.ts"),
    `
import {
  LLMService,
  codePointBoundToTokenUpperBound,
  getTokenProfileById,
  type AdapterLLMStreamEvent,
  type ILLMClientAdapter,
  type InternalLLMChatRequest,
  type LLMAnswerAccountingByScope,
  type LLMChoice,
  type LLMFailureResponse,
  type LLMResponse,
  type LLMServiceStreamEvent,
  type LLMStreamEvent,
  type ProviderEndpointRevisionProvider,
} from "genai-lite";
import {
  GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE,
  type ContentTokenizerRecipe,
} from "genai-lite/tokenizer-recipes";
import {
  ContentTokenizerLoaderError,
  loadContentTokenizerProfile,
  type ContentTokenizerPeer,
  type ContentTokenizerRuntimeModule,
  type LoadContentTokenizerProfileOptions,
} from "genai-lite/tokenizer-loader";
import type {
  ContentTokenProfile,
  RegisteredContentTokenizerBackend,
} from "genai-lite";

class LegacyAdapter implements ILLMClientAdapter {
  async sendMessage(
    request: InternalLLMChatRequest,
    apiKey: string
  ): Promise<LLMResponse | LLMFailureResponse> {
    void apiKey;
    return {
      id: "id",
      provider: request.providerId,
      model: request.modelId,
      created: 1,
      choices: [],
      object: "chat.completion",
    };
  }
  async *streamMessage(): AsyncIterable<LLMStreamEvent> {
    yield { type: "content_delta", delta: "legacy", index: 0 };
  }
}
void (null as unknown as LegacyAdapter);
void (null as unknown as AdapterLLMStreamEvent);

const providerEndpointRevisionProvider: ProviderEndpointRevisionProvider =
  async () => 7;
const service = new LLMService(async () => "not-needed", {
  providerEndpointRevisionProvider,
  cachePreparationStateByEndpointRevision: true,
});
const answerAccounting: LLMAnswerAccountingByScope = {
  providerOutput: {
    tokens: 3,
    method: "exact",
    source: "provider",
    reasoning: "included_native",
  },
};
const choice: LLMChoice = {
  message: { role: "assistant", content: "ok" },
  finish_reason: "stop",
  answerAccounting,
};
void choice;
async function verify(): Promise<void> {
  const complete = await service.prepareMessage({
    providerId: "mock",
    modelId: "mock",
    messages: [{ role: "user", content: "x" }],
  }, { mode: "complete" });
  if ("object" in complete) return;
  const inspection = await service.inspectPrepared(complete);
  if ("object" in inspection) return;
  const provenance: string | undefined = inspection.outputTokenLimit?.source;
  const endpointRevision: string | number | undefined =
    inspection.bindings.providerEndpointRevision;
  void provenance;
  void endpointRevision;
  await service.sendPrepared(complete);
  // @ts-expect-error complete handles cannot be streamed
  service.streamPrepared(complete);

  const stream = await service.prepareMessage({
    providerId: "mock",
    modelId: "mock",
    messages: [{ role: "user", content: "x" }],
  }, { mode: "stream" });
  if ("object" in stream) return;
  // @ts-expect-error stream handles cannot be sent as complete calls
  await service.sendPrepared(stream);
  for await (const event of service.streamPrepared(stream)) {
    const id: string = event.attemptId;
    void id;
  }
}
void verify;

const event = null as unknown as LLMServiceStreamEvent;
const requiredAttemptId: string = event.attemptId;
void requiredAttemptId;
const profile = getTokenProfileById("o200k_base");
if (profile) codePointBoundToTokenUpperBound(175, profile);
const recipe: ContentTokenizerRecipe =
  GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE;
void recipe;
void (null as unknown as ContentTokenProfile);
void (null as unknown as RegisteredContentTokenizerBackend);
void ContentTokenizerLoaderError;
void loadContentTokenizerProfile;
void (null as unknown as ContentTokenizerPeer);
void (null as unknown as ContentTokenizerRuntimeModule);
void (null as unknown as LoadContentTokenizerProfileOptions);
`
  );

  runNpm(
    [
      "install",
      "--ignore-scripts",
      "--package-lock=false",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: consumer, stdio: "inherit" }
  );
  const packedDeclarationRoot = path.join(
    consumer,
    "node_modules",
    "genai-lite",
    "dist"
  );
  const peerDeclarationLeaks = collectDeclarationFiles(packedDeclarationRoot)
    .filter((file) =>
      fs.readFileSync(file, "utf8").includes("@huggingface/tokenizers")
    );
  if (peerDeclarationLeaks.length > 0) {
    throw new Error(
      "Packed genai-lite declarations leaked optional-peer imports:\n" +
        peerDeclarationLeaks.join("\n")
    );
  }
  execFileSync(
    process.execPath,
    [
      path.join(consumer, "node_modules", "typescript", "bin", "tsc"),
      "--noEmit",
      "-p",
      "tsconfig.json",
    ],
    {
      cwd: consumer,
      stdio: "inherit",
    }
  );

  const importCacheCheck = path.join(consumer, "import-cache-check.cjs");
  fs.writeFileSync(
    importCacheCheck,
    `
const path = require("node:path");
const requested = process.argv[2];
require(requested);
const loaded = Object.keys(require.cache).map((id) =>
  id.split(path.sep).join("/")
);
const eager = loaded.filter((id) => {
  if (id.includes("/node_modules/js-tiktoken/")) return true;
  return requested !== "genai-lite" &&
    id.includes("/node_modules/base64-js/");
});
if (eager.length > 0) {
  throw new Error(
    requested + " eagerly evaluated tokenizer dependencies:\\n" +
      eager.join("\\n")
  );
}
`
  );
  for (const entry of [
    "genai-lite",
    "genai-lite/prompting",
    "genai-lite/tokenizer-recipes",
    "genai-lite/tokenizer-loader",
  ]) {
    runNode(importCacheCheck, consumer, {}, [entry]);
  }

  const builtinCacheCheck = path.join(consumer, "builtin-cache-check.cjs");
  fs.writeFileSync(
    builtinCacheCheck,
    `
const { countTextTokens, resolveTokenProfile } = require("genai-lite");
const model = process.argv[2];
const expectedRank = process.argv[3];
const unexpectedRank = process.argv[4];
const resolution = resolveTokenProfile("openai", model);
if (resolution.status !== "available") {
  throw new Error("Built-in profile did not resolve for " + model);
}
const counted = countTextTokens("packed cache assertion", resolution.profile);
if (counted.status !== "available") {
  throw new Error("Built-in profile did not count for " + model);
}
for (const required of [expectedRank, "js-tiktoken/lite", "base64-js"]) {
  if (!require.cache[require.resolve(required)]) {
    throw new Error("Expected module was not evaluated: " + required);
  }
}
for (const forbidden of [unexpectedRank, "js-tiktoken"]) {
  if (require.cache[require.resolve(forbidden)]) {
    throw new Error("Unrelated tokenizer module was evaluated: " + forbidden);
  }
}
`
  );
  runNode(builtinCacheCheck, consumer, {}, [
    "gpt-4",
    "js-tiktoken/ranks/cl100k_base",
    "js-tiktoken/ranks/o200k_base",
  ]);
  runNode(builtinCacheCheck, consumer, {}, [
    "gpt-5.1",
    "js-tiktoken/ranks/o200k_base",
    "js-tiktoken/ranks/cl100k_base",
  ]);

  const missingCjs = path.join(consumer, "missing-peer.cjs");
  fs.writeFileSync(
    missingCjs,
    `
const recipes = require("genai-lite/tokenizer-recipes");
const loader = require("genai-lite/tokenizer-loader");
if (!recipes.GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE) {
  throw new Error("CJS recipe subpath did not load.");
}
if (typeof loader.loadContentTokenizerProfile !== "function") {
  throw new Error("CJS loader subpath did not load.");
}
loader.loadContentTokenizerProfile(
  recipes.GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE,
  { cacheDir: __dirname, allowDownload: false }
).then(
  () => { throw new Error("Missing optional peer unexpectedly loaded."); },
  (error) => {
    if (
      error.code !== "TOKENIZER_PEER_MISSING" ||
      !error.message.includes("@huggingface/tokenizers@^0.1.3") ||
      !error.message.includes(
        "npm install @huggingface/tokenizers@^0.1.3"
      )
    ) {
      throw error;
    }
  }
);
`
  );
  const missingEsm = path.join(consumer, "missing-peer.mjs");
  fs.writeFileSync(
    missingEsm,
    `
import {
  GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE,
} from "genai-lite/tokenizer-recipes";
import {
  loadContentTokenizerProfile,
} from "genai-lite/tokenizer-loader";
try {
  await loadContentTokenizerProfile(
    GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE,
    { cacheDir: new URL(".", import.meta.url).pathname, allowDownload: false }
  );
  throw new Error("Missing optional peer unexpectedly loaded.");
} catch (error) {
  if (
    error.code !== "TOKENIZER_PEER_MISSING" ||
    !error.message.includes("@huggingface/tokenizers@^0.1.3") ||
    !error.message.includes(
      "npm install @huggingface/tokenizers@^0.1.3"
    )
  ) {
    throw error;
  }
}
`
  );

  let peerWasMissing = false;
  try {
    require.resolve("@huggingface/tokenizers", { paths: [consumer] });
  } catch (error) {
    peerWasMissing =
      error &&
      error.code === "MODULE_NOT_FOUND";
  }
  if (!peerWasMissing) {
    throw new Error(
      "The isolated missing-peer consumer unexpectedly installed @huggingface/tokenizers."
    );
  }
  runNode(missingCjs, consumer);
  runNode(missingEsm, consumer);

  const fixture = path.join(consumer, "tokenizer-fixture.cjs");
  fs.writeFileSync(
    fixture,
    `
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  computeContentTokenizerSemanticRevision,
} = require("genai-lite");
const tokenizer = {
  version: "1.0",
  truncation: null,
  padding: null,
  added_tokens: [{
    id: 6,
    content: "<special>",
    single_word: false,
    lstrip: false,
    rstrip: false,
    normalized: false,
    special: true,
  }],
  normalizer: null,
  pre_tokenizer: { type: "Whitespace" },
  post_processor: null,
  decoder: { type: "WordPiece", prefix: "##", cleanup: true },
  model: {
    type: "WordPiece",
    unk_token: "[UNK]",
    continuing_subword_prefix: "##",
    max_input_chars_per_word: 100,
    vocab: {
      "[UNK]": 0,
      hello: 1,
      world: 2,
      "<": 3,
      ">": 4,
      special: 5,
      "<special>": 6,
    },
  },
};
const bytes = Buffer.from(JSON.stringify(tokenizer));
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const revision = "1".repeat(40);
const semanticRevision = computeContentTokenizerSemanticRevision({
  tokenizerImplementation: "huggingface-tokenizer-json-v1",
  textPolicy: "ordinary-text-no-specials-v1",
  artifacts: [{ role: "tokenizer-json", sha256 }],
});
const selfTest = [
  { name: "ascii-whitespace", text: "hello world", expectedTokens: 2 },
  { name: "multilingual-dense", text: "漢字 العربية", expectedTokens: 2 },
  { name: "combining-marks", text: "é e\\u0301", expectedTokens: 3 },
  { name: "emoji-zwj", text: "👨‍👩", expectedTokens: 1 },
  { name: "control-characters", text: "\\u0000\\t\\n\\u001f", expectedTokens: 2 },
  { name: "special-token-literals", text: "<special>", expectedTokens: 3 },
];
const recipe = {
  id: "packed-synthetic-tokenizer",
  tokenizerId: "test:packed-synthetic-tokenizer",
  semanticRevision,
  loaderKind: "huggingface-tokenizer-json-v1",
  loaderInput: {
    artifacts: [{
      role: "tokenizer-json",
      source:
        "https://example.test/repository/resolve/" +
        revision +
        "/tokenizer.json",
      revision,
      sha256,
    }],
  },
  textPolicy: "ordinary-text-no-specials-v1",
  selfTest,
  coverageRequiredRoles: ["tokenizer-json"],
  coverageEvidence: [{
    modelId: "packed-model",
    repository: "example/packed-model",
    revision,
    behaviorArtifacts: [{
      role: "tokenizer-json",
      path: "tokenizer.json",
      sha256,
    }],
  }],
};
const cacheDir = path.join(__dirname, "warm-cache");
const blobDir = path.join(cacheDir, "sha256");
fs.mkdirSync(blobDir, { recursive: true });
fs.writeFileSync(path.join(blobDir, sha256), bytes);
module.exports = { cacheDir, recipe };
`
  );

  const injectedCjs = path.join(consumer, "injected-peer.cjs");
  fs.writeFileSync(
    injectedCjs,
    `
const { cacheDir, recipe } = require("./tokenizer-fixture.cjs");
const {
  loadContentTokenizerProfile,
} = require("genai-lite/tokenizer-loader");
class Tokenizer {
  encode(text) {
    const fixture = recipe.selfTest.find((item) => item.text === text);
    const count = fixture ? fixture.expectedTokens : 0;
    return { ids: Array.from({ length: count }, (_, index) => index) };
  }
}
(async () => {
  const backend = await loadContentTokenizerProfile(recipe, {
    cacheDir,
    allowDownload: false,
    tokenizersPeer: {
      module: { Tokenizer },
      packageVersion: "0.1.3",
    },
  });
  if (
    backend.provenance.runtime.packageVersion !== "0.1.3" ||
    backend.countTextTokens("<special>") !== 3
  ) {
    throw new Error("CJS injected-peer verification failed.");
  }
})();
`
  );
  const injectedEsm = path.join(consumer, "injected-peer.mjs");
  fs.writeFileSync(
    injectedEsm,
    `
import fixture from "./tokenizer-fixture.cjs";
import {
  loadContentTokenizerProfile,
} from "genai-lite/tokenizer-loader";
class Tokenizer {
  encode(text) {
    const selfTest = fixture.recipe.selfTest.find((item) => item.text === text);
    const count = selfTest ? selfTest.expectedTokens : 0;
    return { ids: Array.from({ length: count }, (_, index) => index) };
  }
}
const backend = await loadContentTokenizerProfile(fixture.recipe, {
  cacheDir: fixture.cacheDir,
  allowDownload: false,
  tokenizersPeer: {
    module: { Tokenizer },
    packageVersion: "0.1.3",
  },
});
if (
  backend.provenance.runtime.packageVersion !== "0.1.3" ||
  backend.countTextTokens("<special>") !== 3
) {
  throw new Error("ESM injected-peer verification failed.");
}
`
  );
  runNode(injectedCjs, consumer);
  runNode(injectedEsm, consumer);

  runNpm(
    [
      "install",
      "--ignore-scripts",
      "--package-lock=false",
      "--no-audit",
      "--no-fund",
      "--no-save",
      "@huggingface/tokenizers@0.1.3",
      "rollup@4.62.4",
      "@rollup/plugin-node-resolve@16.0.3",
      "@rollup/plugin-commonjs@29.0.3",
      "@rollup/plugin-json@6.1.0",
    ],
    { cwd: consumer, stdio: "inherit" }
  );

  fs.writeFileSync(
    path.join(consumer, "tsconfig.injected.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "Node16",
        moduleResolution: "Node16",
        target: "ES2020",
        skipLibCheck: true,
      },
      include: ["injected-consumer.mts"],
    })
  );
  fs.writeFileSync(
    path.join(consumer, "injected-consumer.mts"),
    `
import * as tokenizersModule from "@huggingface/tokenizers";
import {
  GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE,
} from "genai-lite/tokenizer-recipes";
import {
  loadContentTokenizerProfile,
  type ContentTokenizerPeer,
} from "genai-lite/tokenizer-loader";

const tokenizersPeer: ContentTokenizerPeer = {
  module: tokenizersModule,
  packageVersion: "0.1.3",
};
void loadContentTokenizerProfile(GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE, {
  cacheDir: ".cache",
  allowDownload: false,
  tokenizersPeer,
});
`
  );
  execFileSync(
    process.execPath,
    [
      path.join(consumer, "node_modules", "typescript", "bin", "tsc"),
      "--noEmit",
      "-p",
      "tsconfig.injected.json",
    ],
    { cwd: consumer, stdio: "inherit" }
  );

  const withPeerCjs = path.join(consumer, "with-peer.cjs");
  fs.writeFileSync(
    withPeerCjs,
    `
const { cacheDir, recipe } = require("./tokenizer-fixture.cjs");
const {
  loadContentTokenizerProfile,
} = require("genai-lite/tokenizer-loader");
(async () => {
  const backend = await loadContentTokenizerProfile(recipe, {
    cacheDir,
    allowDownload: false,
  });
  if (
    backend.provenance.runtime.packageVersion !== "0.1.3" ||
    backend.countTextTokens("<special>") !== 3
  ) {
    throw new Error("CJS packed warm-cache loader verification failed.");
  }
})();
`
  );
  const withPeerEsm = path.join(consumer, "with-peer.mjs");
  fs.writeFileSync(
    withPeerEsm,
    `
import fixture from "./tokenizer-fixture.cjs";
import {
  loadContentTokenizerProfile,
} from "genai-lite/tokenizer-loader";
const backend = await loadContentTokenizerProfile(fixture.recipe, {
  cacheDir: fixture.cacheDir,
  allowDownload: false,
});
if (
  backend.provenance.runtime.packageVersion !== "0.1.3" ||
  backend.countTextTokens("<special>") !== 3
) {
  throw new Error("ESM packed warm-cache loader verification failed.");
}
`
  );
  runNode(withPeerCjs, consumer);
  runNode(withPeerEsm, consumer);

  const rollupEntry = path.join(consumer, "rollup-entry.mjs");
  fs.writeFileSync(
    rollupEntry,
    `
import * as tokenizersModule from "@huggingface/tokenizers";
import {
  countTextTokens,
  resolveTokenProfile,
} from "genai-lite";
import fixture from "./tokenizer-fixture.cjs";
import {
  loadContentTokenizerProfile,
} from "genai-lite/tokenizer-loader";

for (const model of ["gpt-4", "gpt-5.1"]) {
  const resolution = resolveTokenProfile("openai", model);
  if (resolution.status !== "available") {
    throw new Error("Bundled profile did not resolve for " + model);
  }
  const counted = countTextTokens("bundled rank execution", resolution.profile);
  if (counted.status !== "available" || counted.count.tokens <= 0) {
    throw new Error("Bundled profile did not count for " + model);
  }
}

const backend = await loadContentTokenizerProfile(fixture.recipe, {
  cacheDir: fixture.cacheDir,
  allowDownload: false,
  tokenizersPeer: {
    module: tokenizersModule,
    packageVersion: "0.1.3",
  },
});
if (
  backend.provenance.runtime.packageVersion !== "0.1.3" ||
  backend.countTextTokens("<special>") !== 3
) {
  throw new Error("Bundled injected-peer loader verification failed.");
}
`
  );
  fs.writeFileSync(
    path.join(consumer, "graph-loader.mjs"),
    `
import { loadContentTokenizerProfile } from "genai-lite/tokenizer-loader";
console.log(typeof loadContentTokenizerProfile);
`
  );
  fs.writeFileSync(
    path.join(consumer, "graph-recipes.mjs"),
    `
import { GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE } from "genai-lite/tokenizer-recipes";
console.log(GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE.id);
`
  );
  const rollupConfig = path.join(consumer, "rollup.config.mjs");
  fs.writeFileSync(
    rollupConfig,
    `
import path from "node:path";
import { fileURLToPath } from "node:url";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";

const directory = path.dirname(fileURLToPath(import.meta.url));
const plugins = () => [
  nodeResolve({ preferBuiltins: true }),
  json(),
  commonjs(),
];
const assertRankFreeGraph = {
  name: "assert-rank-free-loader-graph",
  generateBundle() {
    const forbidden = [...this.getModuleIds()].filter((id) => {
      const normalized = id.split(path.sep).join("/");
      return normalized.includes("/node_modules/js-tiktoken/") ||
        normalized.includes("/node_modules/base64-js/");
    });
    if (forbidden.length > 0) {
      this.error(
        "Loader/recipes graph reached tokenizer dependencies: " +
          forbidden.join(", ")
      );
    }
  },
};

export default [
  {
    input: path.join(directory, "rollup-entry.mjs"),
    external: (id) => id.endsWith("tokenizer-fixture.cjs"),
    output: {
      file: path.join(directory, "rollup-bundle.mjs"),
      format: "esm",
    },
    plugins: plugins(),
  },
  {
    input: {
      loader: path.join(directory, "graph-loader.mjs"),
      recipes: path.join(directory, "graph-recipes.mjs"),
    },
    output: {
      dir: path.join(directory, "rollup-graphs"),
      format: "esm",
    },
    plugins: [...plugins(), assertRankFreeGraph],
  },
];
`
  );
  execFileSync(
    process.execPath,
    [
      path.join(consumer, "node_modules", "rollup", "dist", "bin", "rollup"),
      "--config",
      rollupConfig,
    ],
    { cwd: consumer, stdio: "inherit" }
  );
  runNode(path.join(consumer, "rollup-bundle.mjs"), consumer);

  const peerValidation = path.join(consumer, "peer-validation.cjs");
  fs.writeFileSync(
    peerValidation,
    `
const { cacheDir, recipe } = require("./tokenizer-fixture.cjs");
const {
  loadContentTokenizerProfile,
} = require("genai-lite/tokenizer-loader");
loadContentTokenizerProfile(recipe, {
  cacheDir,
  allowDownload: false,
}).then(
  () => { throw new Error("Invalid peer fixture unexpectedly loaded."); },
  (error) => {
    if (
      error.code !== process.env.EXPECTED_LOADER_CODE ||
      error.code === "TOKENIZER_PEER_MISSING"
    ) {
      throw error;
    }
  }
);
`
  );
  const peerEntry = require.resolve("@huggingface/tokenizers", {
    paths: [consumer],
  });
  let peerPackageDir = path.dirname(peerEntry);
  let peerManifestPath;
  while (peerPackageDir !== path.parse(peerPackageDir).root) {
    const candidate = path.join(peerPackageDir, "package.json");
    if (fs.existsSync(candidate)) {
      const candidateManifest = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (candidateManifest.name === "@huggingface/tokenizers") {
        peerManifestPath = candidate;
        break;
      }
    }
    peerPackageDir = path.dirname(peerPackageDir);
  }
  if (!peerManifestPath) {
    throw new Error("Packed test could not locate the optional peer manifest.");
  }
  const originalPeerManifest = fs.readFileSync(peerManifestPath, "utf8");
  const parsedPeerManifest = JSON.parse(originalPeerManifest);
  try {
    fs.writeFileSync(
      peerManifestPath,
      JSON.stringify({ ...parsedPeerManifest, version: "0.2.0" })
    );
    runNode(peerValidation, consumer, {
      EXPECTED_LOADER_CODE: "TOKENIZER_PEER_VERSION_UNSUPPORTED",
    });
    fs.writeFileSync(
      peerManifestPath,
      JSON.stringify({ ...parsedPeerManifest, version: "indeterminate" })
    );
    runNode(peerValidation, consumer, {
      EXPECTED_LOADER_CODE: "TOKENIZER_PEER_VERSION_UNSUPPORTED",
    });
  } finally {
    fs.writeFileSync(peerManifestPath, originalPeerManifest);
  }

  const originalPeerEntry = fs.readFileSync(peerEntry, "utf8");
  try {
    fs.writeFileSync(
      peerEntry,
      'throw new Error("packed module evaluation fixture");'
    );
    runNode(peerValidation, consumer, {
      EXPECTED_LOADER_CODE: "TOKENIZER_LOAD_FAILED",
    });
  } finally {
    fs.writeFileSync(peerEntry, originalPeerEntry);
  }

  console.log(
    "Packed prepared-call and optional-tokenizer consumer checks passed."
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
