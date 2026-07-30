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

function runNode(script, cwd, env = {}) {
  return execFileSync(process.execPath, [script], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
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
  execFileSync(
    process.execPath,
    [path.join(consumer, "node_modules", "typescript", "bin", "tsc"), "--noEmit"],
    {
      cwd: consumer,
      stdio: "inherit",
    }
  );

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

  runNpm(
    [
      "install",
      "--ignore-scripts",
      "--package-lock=false",
      "--no-audit",
      "--no-fund",
      "--no-save",
      "@huggingface/tokenizers@0.1.3",
    ],
    { cwd: consumer, stdio: "inherit" }
  );

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
