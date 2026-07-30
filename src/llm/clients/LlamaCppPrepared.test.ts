import { DEFAULT_LLM_SETTINGS } from "../config";
import { LlamaCppClientAdapter } from "./LlamaCppClientAdapter";
import type { InternalLLMChatRequest } from "./types";

const baseProps = {
  model_alias: "model.gguf",
  chat_template: "{{ messages }}",
  chat_template_caps: { supports_system_role: true },
  build_info: { build: 1, commit: "abc" },
};
const baseModels = {
  object: "list",
  data: [{ id: "model.gguf", meta: { n_ctx: 4096 } }],
};

function request(enableThinking: boolean): InternalLLMChatRequest {
  return {
    providerId: "llamacpp",
    modelId: "llamacpp",
    messages: [{ role: "user", content: "Hello" }],
    settings: {
      ...DEFAULT_LLM_SETTINGS,
      reasoning: { ...DEFAULT_LLM_SETTINGS.reasoning, enabled: false },
      llamacpp: {
        chatTemplateKwargs: { enable_thinking: enableThinking },
      },
    },
  };
}

describe("LlamaCppClientAdapter prepared state", () => {
  function adapterWithServer() {
    const adapter = new LlamaCppClientAdapter({ logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } });
    jest
      .spyOn(adapter, "getModelCapabilities")
      .mockResolvedValue(null);
    const server = {
      getProps: jest.fn().mockResolvedValue(baseProps),
      getModels: jest.fn().mockResolvedValue(baseModels),
      countChatCompletionInputTokens: jest
        .fn()
        .mockImplementation(async (body: Record<string, any>) => ({
          input_tokens:
            body.chat_template_kwargs?.enable_thinking === true ? 23 : 21,
        })),
    };
    (adapter as any).serverClient = server;
    return { adapter, server };
  }

  it("counts the exact final mode-bound body including template kwargs", async () => {
    const { adapter, server } = adapterWithServer();
    const plain = await adapter.prepareRequest(request(false), {
      mode: "complete",
      modelInfo: {} as any,
    });
    const thinking = await adapter.prepareRequest(request(true), {
      mode: "stream",
      modelInfo: {} as any,
    });

    expect("prepared" in plain && plain.prepared.promptAccounting).toMatchObject({
      status: "available",
      count: { tokens: 21, method: "exact" },
    });
    expect(
      "prepared" in thinking && thinking.prepared.promptAccounting
    ).toMatchObject({
      status: "available",
      count: { tokens: 23, method: "exact" },
    });
    if ("prepared" in thinking) {
      expect(thinking.prepared.requestView.settings.stream).toBe(true);
      expect(
        thinking.prepared.requestView.extensions?.chat_template_kwargs
      ).toEqual({ enable_thinking: true });
    }
    expect(server.getProps).toHaveBeenCalledTimes(4);
    expect(server.getModels).toHaveBeenCalledTimes(4);
  });

  it("uses endpoint-revision authority instead of a post-count state reread", async () => {
    const { adapter, server } = adapterWithServer();
    const snapshot = await adapter.getPreparationSnapshot("llamacpp");
    server.getProps.mockClear();
    server.getModels.mockClear();
    server.countChatCompletionInputTokens.mockClear();

    const result = await adapter.prepareRequest(request(false), {
      mode: "complete",
      modelInfo: {} as any,
      providerState: snapshot,
      providerEndpointRevision: "generation-a",
      cachePreparationStateByEndpointRevision: true,
    });

    expect(
      "prepared" in result && result.prepared.promptAccounting
    ).toMatchObject({
      status: "available",
      count: { tokens: 21, method: "exact" },
    });
    expect(server.countChatCompletionInputTokens).toHaveBeenCalledTimes(1);
    expect(server.getProps).not.toHaveBeenCalled();
    expect(server.getModels).not.toHaveBeenCalled();
  });

  it("binds cacheable snapshots to the exact selected model", async () => {
    const { adapter } = adapterWithServer();
    const snapshot = await adapter.getPreparationSnapshot("llamacpp");

    expect(
      adapter.isPreparationSnapshotCacheable(snapshot, "llamacpp")
    ).toBe(true);
    expect(
      adapter.isPreparationSnapshotCacheable(snapshot, "other-model")
    ).toBe(false);
  });

  it("prepares and exactly counts empty system/user messages", async () => {
    const { adapter, server } = adapterWithServer();
    const empty = request(false);
    empty.messages = [
      { role: "system", content: "" },
      { role: "user", content: "" },
    ];

    const result = await adapter.prepareRequest(empty, {
      mode: "complete",
      modelInfo: {} as any,
    });

    expect(
      "prepared" in result && result.prepared.promptAccounting
    ).toMatchObject({
      status: "available",
      count: { tokens: 21, method: "exact" },
    });
    if ("prepared" in result) {
      expect(result.prepared.requestView.messages).toEqual([
        { role: "user", content: "" },
      ]);
    }
    expect(
      server.countChatCompletionInputTokens.mock.calls[0][0].messages
    ).toEqual([{ role: "user", content: "" }]);
    expect(empty.messages).toEqual([
      { role: "system", content: "" },
      { role: "user", content: "" },
    ]);
  });

  it("derives capability transformations from the same selected-model snapshot", async () => {
    const { adapter, server } = adapterWithServer();
    const capabilityProbe = jest.spyOn(adapter, "getModelCapabilities");
    server.getModels.mockResolvedValue({
      object: "list",
      data: [{ id: "gemma-4-e4b-it.gguf", meta: { n_ctx: 32768 } }],
    });
    server.getProps.mockResolvedValue({
      ...baseProps,
      model_alias: "gemma-4-e4b-it.gguf",
    });
    const enabled = request(false);
    enabled.settings.reasoning = {
      ...enabled.settings.reasoning,
      enabled: true,
    };
    enabled.settings.llamacpp = {};

    const result = await adapter.prepareRequest(enabled, {
      mode: "complete",
      modelInfo: {} as any,
    });

    expect(capabilityProbe).not.toHaveBeenCalled();
    if ("error" in result) {
      throw new Error(result.error.error.message);
    }
    expect(
      result.prepared.requestView.extensions?.chat_template_kwargs
    ).toEqual({ enable_thinking: true });
  });

  it("reuses the service resolution snapshot and rejects a later model change", async () => {
    const { adapter, server } = adapterWithServer();
    server.getModels.mockResolvedValue({
      object: "list",
      data: [{ id: "gemma-4-e4b-it.gguf", meta: { n_ctx: 32768 } }],
    });
    server.getProps.mockResolvedValue({
      ...baseProps,
      model_alias: "gemma-4-e4b-it.gguf",
    });
    const snapshot = await adapter.getPreparationSnapshot("llamacpp");

    server.getModels.mockResolvedValue({
      object: "list",
      data: [{ id: "different-model.gguf", meta: { n_ctx: 4096 } }],
    });
    server.getProps.mockResolvedValue({
      ...baseProps,
      model_alias: "different-model.gguf",
      chat_template: "{{ different }}",
    });
    const enabled = request(false);
    enabled.settings.reasoning = {
      ...enabled.settings.reasoning,
      enabled: true,
    };
    enabled.settings.llamacpp = {};

    const result = await adapter.prepareRequest(enabled, {
      mode: "complete",
      modelInfo: {
        ...snapshot.detectedCaps,
      } as any,
      providerState: snapshot,
    });

    if ("error" in result) {
      throw new Error(result.error.error.message);
    }
    expect(
      result.prepared.requestView.extensions?.chat_template_kwargs
    ).toEqual({ enable_thinking: true });
    expect(result.prepared.promptAccounting).toEqual({
      status: "unavailable",
    });
  });

  it("discards an exact count when observable state changes around counting", async () => {
    const { adapter, server } = adapterWithServer();
    server.getProps
      .mockResolvedValueOnce(baseProps)
      .mockResolvedValueOnce({
        ...baseProps,
        chat_template: "{{ changed during count }}",
      });

    const result = await adapter.prepareRequest(request(false), {
      mode: "complete",
      modelInfo: {} as any,
    });

    expect("prepared" in result && result.prepared.promptAccounting).toEqual({
      status: "unavailable",
    });
  });

  it("accepts unchanged state and rejects template/build/model changes", async () => {
    const { adapter, server } = adapterWithServer();
    const result = await adapter.prepareRequest(request(false), {
      mode: "complete",
      modelInfo: {} as any,
    });
    if ("error" in result) {
      throw new Error(result.error.error.message);
    }

    await expect(
      adapter.revalidatePreparedRequest(result.prepared)
    ).resolves.toEqual({ valid: true });

    server.getProps.mockResolvedValueOnce({
      ...baseProps,
      chat_template: "{{ changed }}",
    });
    const stale = await adapter.revalidatePreparedRequest(result.prepared);
    expect(stale).toMatchObject({
      valid: false,
      error: {
        error: { code: "PREPARED_CALL_STALE" },
      },
    });
  });

  it("degrades to unavailable when count/state endpoints are unavailable", async () => {
    const { adapter, server } = adapterWithServer();
    server.getProps.mockRejectedValueOnce(new Error("404"));
    const result = await adapter.prepareRequest(request(false), {
      mode: "complete",
      modelInfo: {} as any,
    });
    expect("prepared" in result && result.prepared.promptAccounting).toEqual({
      status: "unavailable",
    });
  });
});
