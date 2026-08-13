import { LLMService } from "../LLMService";
import { LlamaCppClientAdapter } from "./LlamaCppClientAdapter";

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

const mockCreate = jest.fn();

const props = {
  model_alias: "model.gguf",
  model_path: "C:/models/model.gguf",
  chat_template: "{{ messages }}",
  chat_template_caps: { supports_system_role: true },
  build_info: { build: 9860, commit: "prefill-test" },
};

const models = {
  object: "list",
  data: [{ id: "model.gguf", meta: { n_ctx: 4096 } }],
};

function streamFrom(chunks: any[]): AsyncIterable<any> {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

function createHarness(): {
  service: LLMService;
  server: {
    getProps: jest.Mock;
    getModels: jest.Mock;
    countChatCompletionInputTokens: jest.Mock;
  };
} {
  const adapter = new LlamaCppClientAdapter({
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  });
  const server = {
    getProps: jest.fn().mockResolvedValue(props),
    getModels: jest.fn().mockResolvedValue(models),
    countChatCompletionInputTokens: jest.fn().mockResolvedValue({
      input_tokens: 8,
    }),
  };
  (adapter as any).serverClient = server;

  const service = new LLMService(async () => "not-needed", {
    logLevel: "silent",
  });
  (service as any).adapterRegistry.registerAdapter("llamacpp", adapter);
  return { service, server };
}

const request = {
  providerId: "llamacpp" as const,
  modelId: "llamacpp",
  messages: [
    { role: "user" as const, content: "Choose yes or no." },
    { role: "assistant" as const, content: "1:" },
  ],
  settings: {
    maxTokens: 1,
    temperature: 0,
    reasoning: { enabled: false },
  },
};

describe("llama.cpp assistant prefill through public prepared flows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("captures and propagates the formatted prefill through complete dispatch", async () => {
    const { service } = createHarness();
    const prepared = await service.prepareMessage(request, {
      mode: "complete",
    });
    if ("object" in prepared) {
      throw new Error(prepared.error.message);
    }
    const inspection = await service.inspectPrepared(prepared);
    if ("object" in inspection) {
      throw new Error(inspection.error.message);
    }
    expect(inspection.request.messages).toEqual([
      { role: "user", content: "Choose yes or no." },
      { role: "assistant", content: "1:" },
    ]);

    mockCreate.mockResolvedValueOnce({
      id: "chatcmpl-prepared-prefill",
      object: "chat.completion",
      created: 1677652288,
      model: "model.gguf",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "1: no" },
        finish_reason: "length",
        logprobs: {
          content: [{
            token: " no",
            logprob: -0.8,
            top_logprobs: [
              { token: " unlikely", logprob: -0.4 },
              { token: " no", logprob: -0.8 },
            ],
          }],
        },
      }],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 1,
        total_tokens: 9,
      },
    });

    const response = await service.sendPrepared(prepared);

    expect(response.object).toBe("chat.completion");
    if (response.object === "chat.completion") {
      expect(response.choices[0]).toMatchObject({
        message: { content: " no" },
        rawContent: "1: no",
        logprobs: [{
          token: " no",
          topLogprobs: [
            { token: " unlikely", logprob: -0.4 },
            { token: " no", logprob: -0.8 },
          ],
        }],
        answerAccounting: {
          providerOutput: { tokens: 1 },
        },
      });
    }
  });

  it("captures and propagates the formatted prefill through streaming dispatch", async () => {
    const { service } = createHarness();
    const prepared = await service.prepareMessage(request, {
      mode: "stream",
    });
    if ("object" in prepared) {
      throw new Error(prepared.error.message);
    }

    mockCreate.mockResolvedValueOnce(streamFrom([
      {
        id: "chatcmpl-prepared-stream-prefill",
        object: "chat.completion.chunk",
        created: 1677652288,
        model: "model.gguf",
        choices: [{
          index: 0,
          delta: { content: "1" },
          finish_reason: null,
        }],
      },
      {
        id: "chatcmpl-prepared-stream-prefill",
        object: "chat.completion.chunk",
        created: 1677652288,
        model: "model.gguf",
        choices: [{
          index: 0,
          delta: { content: ": no" },
          finish_reason: "length",
        }],
      },
      {
        id: "chatcmpl-prepared-stream-prefill",
        object: "chat.completion.chunk",
        created: 1677652288,
        model: "model.gguf",
        choices: [],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 1,
          total_tokens: 9,
        },
      },
    ]));

    const events = [];
    for await (const event of service.streamPrepared(prepared)) {
      events.push(event);
    }
    const liveContent = events
      .filter((event) => event.type === "content_delta")
      .map((event) => event.delta)
      .join("");
    const complete = events[events.length - 1];

    expect(liveContent).toBe(" no");
    expect(events.some((event) => (event as any).type === "adapter_evidence")).toBe(false);
    expect(complete).toMatchObject({
      type: "complete",
      response: {
        choices: [{
          message: { content: " no" },
          rawContent: "1: no",
          rawContentParts: [{ type: "text", text: "1: no" }],
          answerAccounting: {
            providerOutput: { tokens: 1 },
          },
        }],
      },
    });
  });
});
