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
  type LLMFailureResponse,
  type LLMResponse,
  type LLMServiceStreamEvent,
  type LLMStreamEvent,
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

const service = new LLMService(async () => "not-needed");
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
  void provenance;
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
  console.log("Packed prepared-call consumer typecheck passed.");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
