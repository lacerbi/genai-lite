import { LLMService } from "./LLMService";
import type {
  LLMFailureResponse,
  LLMResponse,
  PreparedCompleteCall,
  PreparedRequestBindings,
  PreparedStreamCall,
  StructuredOutputSchema,
} from "./types";
import type {
  AdapterLLMStreamEvent,
  AdapterPreparationContext,
  AdapterPreparationResult,
  AdapterPreparedRequest,
  AdapterRequestOptions,
  ILLMClientAdapter,
  InternalLLMChatRequest,
} from "./clients/types";
import { freezeProviderRequest } from "./clients/preparedAdapterUtils";
import { createFallbackModelInfo } from "./config";

function success(
  request: InternalLLMChatRequest,
  id = "fake-response"
): LLMResponse {
  return {
    id,
    provider: request.providerId,
    model: request.modelId,
    created: 1,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "OK" },
        rawContent: "OK",
        finish_reason: "stop",
      },
    ],
    object: "chat.completion",
  };
}

class PreparedFakeAdapter implements ILLMClientAdapter {
  preparedRequests: AdapterPreparedRequest[] = [];
  preparationContexts: AdapterPreparationContext[] = [];
  dispatchRequests: AdapterPreparedRequest[] = [];
  revalidations = 0;
  sendResults: Array<LLMResponse | LLMFailureResponse> = [];
  bindingOverrides: Partial<PreparedRequestBindings> = {};
  promptAccounting: AdapterPreparedRequest["promptAccounting"] = {
    status: "unavailable",
  };
  onPrepare?: () => void;
  streamFactory?: (
    request: InternalLLMChatRequest
  ) => AsyncIterable<AdapterLLMStreamEvent>;

  async prepareRequest(
    request: InternalLLMChatRequest,
    context: AdapterPreparationContext
  ): Promise<AdapterPreparationResult> {
    this.onPrepare?.();
    this.preparationContexts.push(context);
    const providerRequest = freezeProviderRequest({ request });
    const prepared: AdapterPreparedRequest = {
      mode: context.mode,
      providerRequest,
      requestView: Object.freeze({
        operation: "fake.chat",
        mode: context.mode,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        settings: {
          model: request.modelId,
          maxTokens: request.settings.maxTokens,
          ...(context.mode === "stream" && { stream: true }),
        },
      }),
      promptAccounting: this.promptAccounting,
      outputTokenLimit: context.outputTokenLimit,
      bindings: {
        adapterRevision: "fake-adapter-v1",
        requestShapeRevision: "fake-request-v1",
        ...this.bindingOverrides,
      },
    };
    this.preparedRequests.push(prepared);
    return { prepared };
  }

  async revalidatePreparedRequest(): Promise<{ valid: true }> {
    this.revalidations += 1;
    return { valid: true };
  }

  async sendPrepared(
    prepared: AdapterPreparedRequest
  ): Promise<LLMResponse | LLMFailureResponse> {
    this.dispatchRequests.push(prepared);
    const providerRequest = prepared.providerRequest as {
      request: InternalLLMChatRequest;
    };
    return this.sendResults.shift() ?? success(providerRequest.request);
  }

  streamPrepared(
    prepared: AdapterPreparedRequest
  ): AsyncIterable<AdapterLLMStreamEvent> {
    this.dispatchRequests.push(prepared);
    const providerRequest = prepared.providerRequest as {
      request: InternalLLMChatRequest;
    };
    return (
      this.streamFactory?.(providerRequest.request) ??
      this.defaultStream(providerRequest.request)
    );
  }

  async sendMessage(
    request: InternalLLMChatRequest
  ): Promise<LLMResponse | LLMFailureResponse> {
    return success(request);
  }

  private async *defaultStream(
    request: InternalLLMChatRequest
  ): AsyncIterable<AdapterLLMStreamEvent> {
    yield {
      type: "start",
      provider: request.providerId,
      model: request.modelId,
      id: "fake-stream",
      created: 1,
    };
    yield { type: "content_delta", delta: "OK", index: 0 };
    yield { type: "complete", response: success(request, "fake-stream") };
  }
}

class CachePreparedFakeAdapter extends PreparedFakeAdapter {
  snapshotCalls = 0;
  snapshotFactory: (modelId: string) => Promise<unknown> = async (
    modelId
  ) => ({
    kind: "llamacpp-preparation-v1",
    selectedModel: modelId,
    detectedCaps: null,
    stateBinding: {
      serverStateFingerprint: `state:${modelId}`,
      chatTemplateFingerprint: `template:${modelId}`,
      metadata: {
        model: `${modelId}.gguf`,
        buildInfo: "{}",
      },
    },
  });

  async getPreparationSnapshot(modelId: string): Promise<unknown> {
    this.snapshotCalls += 1;
    return this.snapshotFactory(modelId);
  }

  isPreparationSnapshotCacheable(snapshot: unknown): boolean {
    return Boolean((snapshot as any)?.stateBinding);
  }
}

function registerFake(
  service: LLMService,
  fake: PreparedFakeAdapter,
  providerId: "mock" | "llamacpp" = "mock"
): void {
  (service as any).adapterRegistry.registerAdapter(providerId, fake);
}

const request = {
  providerId: "mock" as const,
  modelId: "mock-model",
  messages: [{ role: "user" as const, content: "Hello" }],
  settings: { maxTokens: 123 },
};

function llamaRequest(modelId = "llamacpp") {
  return {
    ...request,
    providerId: "llamacpp" as const,
    modelId,
  };
}

async function collect(
  events: AsyncIterable<unknown>
): Promise<any[]> {
  const result: any[] = [];
  for await (const event of events) {
    result.push(event);
  }
  return result;
}

describe("LLMService prepared calls", () => {
  it("rejects revision caching without an authoritative revision provider", () => {
    expect(
      () =>
        new LLMService(async () => "not-needed", {
          logLevel: "silent",
          cachePreparationStateByEndpointRevision: true,
        })
    ).toThrow(
      "cachePreparationStateByEndpointRevision requires " +
        "providerEndpointRevisionProvider"
    );
  });

  it("prepares and inspects exact accounting for empty system/user content", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    fake.promptAccounting = {
      status: "available",
      count: {
        tokens: 7,
        method: "exact",
        tokenizerId: "fixture-tokenizer",
        tokenProfileRevision: "fixture-v1",
      },
    };
    registerFake(service, fake, "llamacpp");

    const handle = await service.prepareMessage(
      {
        ...llamaRequest(),
        messages: [
          { role: "system", content: "" },
          { role: "user", content: "" },
        ],
      },
      { mode: "complete" }
    );
    expect((handle as LLMFailureResponse).object).not.toBe("error");
    const inspection = await service.inspectPrepared(
      handle as PreparedCompleteCall
    );

    expect(inspection).toMatchObject({
      promptAccounting: {
        status: "available",
        count: {
          tokens: 7,
          method: "exact",
          tokenizerId: "fixture-tokenizer",
          tokenProfileRevision: "fixture-v1",
        },
      },
    });
  });

  it("is credential-free, opaque, immutable, nonserializable, and dispatchable", async () => {
    const keys = jest.fn(async () => "not-needed");
    const service = new LLMService(keys, { logLevel: "silent" });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);

    const handle = await service.prepareMessage(request, { mode: "complete" });
    expect((handle as LLMFailureResponse).object).not.toBe("error");
    expect(keys).not.toHaveBeenCalled();
    expect(Object.isFrozen(handle)).toBe(true);
    expect(() => JSON.stringify(handle)).toThrow("cannot be serialized");

    const inspection = await service.inspectPrepared(
      handle as PreparedCompleteCall
    );
    expect((inspection as any).request.messages[0].content).toBe("Hello");
    expect(Object.isFrozen(inspection)).toBe(true);
    expect((inspection as any).outputTokenLimit).toMatchObject({
      tokens: 123,
      source: "request",
    });
    expect(() => {
      (inspection as any).request.messages[0].content = "mutated";
    }).toThrow();

    const response = await service.sendPrepared(
      handle as PreparedCompleteCall
    );
    expect(response.object).toBe("chat.completion");
    expect(keys).toHaveBeenCalledTimes(1);
    expect(fake.dispatchRequests[0]).toBe(fake.preparedRequests[0]);
  });

  it("rejects forged, cross-service, and mode-mismatched handles", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    registerFake(service, new PreparedFakeAdapter());
    const other = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const stream = await service.prepareMessage(request, { mode: "stream" });

    const forged = await service.inspectPrepared({
      mode: "complete",
      toJSON: () => {
        throw new Error();
      },
    } as PreparedCompleteCall);
    expect((forged as LLMFailureResponse).error.code).toBe(
      "INVALID_PREPARED_CALL"
    );

    const crossService = await other.inspectPrepared(
      stream as PreparedStreamCall
    );
    expect((crossService as LLMFailureResponse).error.code).toBe(
      "INVALID_PREPARED_CALL"
    );

    const mismatch = await service.sendPrepared(
      stream as unknown as PreparedCompleteCall
    );
    expect((mismatch as LLMFailureResponse).error.code).toBe(
      "PREPARED_CALL_MODE_MISMATCH"
    );
  });

  it("rejects a generation restarted during preparation when observable state is identical", async () => {
    let generation = 41;
    const providerEndpointRevisionProvider = jest.fn(async () => generation);
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
    });
    const fake = new PreparedFakeAdapter();
    fake.bindingOverrides = {
      serverStateFingerprint: "unchanged-observable-state",
      chatTemplateFingerprint: "unchanged-chat-template",
    };
    fake.onPrepare = () => {
      generation = 42;
    };
    registerFake(service, fake, "llamacpp");
    const llamaCppRequest = {
      ...request,
      providerId: "llamacpp" as const,
      modelId: "llamacpp",
    };

    const handle = await service.prepareMessage(llamaCppRequest, {
      mode: "complete",
    });
    const inspection = await service.inspectPrepared(
      handle as PreparedCompleteCall
    );
    expect(inspection).toMatchObject({
      bindings: {
        providerEndpointRevision: 41,
        serverStateFingerprint: "unchanged-observable-state",
        chatTemplateFingerprint: "unchanged-chat-template",
      },
    });

    const response = await service.sendPrepared(
      handle as PreparedCompleteCall
    );

    expect(response).toMatchObject({
      object: "error",
      error: { code: "PREPARED_CALL_STALE" },
    });
    expect(fake.revalidations).toBe(1);
    expect(fake.dispatchRequests).toHaveLength(0);
    expect(providerEndpointRevisionProvider).toHaveBeenCalledTimes(2);
    expect(providerEndpointRevisionProvider).toHaveBeenNthCalledWith(1, {
      providerId: "llamacpp",
      modelId: "llamacpp",
    });
  });

  it("fails closed when the configured revision is missing during preparation", async () => {
    const providerEndpointRevisionProvider = jest.fn(
      async () => undefined
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);

    const result = await service.prepareMessage(request, { mode: "complete" });

    expect(result).toMatchObject({
      object: "error",
      error: { code: "PREPARED_CALL_STALE" },
    });
    expect(fake.dispatchRequests).toHaveLength(0);
    expect(providerEndpointRevisionProvider).toHaveBeenCalledTimes(1);
  });

  it("reuses one frozen command across retries and revalidates each attempt", async () => {
    const providerEndpointRevisionProvider = jest.fn(
      async () => "generation-a"
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      retry: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 1 },
      providerEndpointRevisionProvider,
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    fake.sendResults.push(
      {
        provider: "mock",
        model: "mock-model",
        error: {
          message: "retry",
          code: "NETWORK_ERROR",
          type: "connection_error",
        },
        object: "error",
      },
      success({
        ...request,
        settings: {} as any,
      } as InternalLLMChatRequest)
    );
    const handle = await service.prepareMessage(request, { mode: "complete" });
    const response = await service.sendPrepared(
      handle as PreparedCompleteCall
    );

    expect(response.object).toBe("chat.completion");
    expect(fake.dispatchRequests).toHaveLength(2);
    expect(fake.dispatchRequests[0]).toBe(fake.dispatchRequests[1]);
    expect(fake.revalidations).toBe(2);
    expect(providerEndpointRevisionProvider).toHaveBeenCalledTimes(3);
  });

  it("rejects a changed endpoint generation before a complete-call retry", async () => {
    const providerEndpointRevisionProvider = jest
      .fn()
      .mockResolvedValueOnce("generation-a")
      .mockResolvedValueOnce("generation-a")
      .mockResolvedValueOnce("generation-b");
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      retry: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 1 },
      providerEndpointRevisionProvider,
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    fake.sendResults.push({
      provider: "mock",
      model: "mock-model",
      error: {
        message: "retry",
        code: "NETWORK_ERROR",
        type: "connection_error",
      },
      object: "error",
    });

    const handle = await service.prepareMessage(request, { mode: "complete" });
    const response = await service.sendPrepared(
      handle as PreparedCompleteCall
    );

    expect(response).toMatchObject({
      object: "error",
      error: { code: "PREPARED_CALL_STALE" },
    });
    expect(fake.revalidations).toBe(2);
    expect(fake.dispatchRequests).toHaveLength(1);
    expect(providerEndpointRevisionProvider).toHaveBeenCalledTimes(3);
  });

  it("keeps convenience and explicit preparation equivalent and permits concurrent redispatch", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);

    const explicitHandle = await service.prepareMessage(request, {
      mode: "complete",
    });
    const explicitResponse = await service.sendPrepared(
      explicitHandle as PreparedCompleteCall
    );
    const convenienceResponse = await service.sendMessage(request);

    expect(convenienceResponse).toEqual(explicitResponse);
    expect(fake.preparedRequests).toHaveLength(2);
    expect(fake.preparedRequests[1].requestView).toEqual(
      fake.preparedRequests[0].requestView
    );
    expect(fake.preparedRequests[1].providerRequest).toEqual(
      fake.preparedRequests[0].providerRequest
    );

    const reusableHandle = await service.prepareMessage(request, {
      mode: "complete",
    });
    const [first, second] = await Promise.all([
      service.sendPrepared(reusableHandle as PreparedCompleteCall),
      service.sendPrepared(reusableHandle as PreparedCompleteCall),
    ]);

    expect(first).toEqual(second);
    expect(fake.dispatchRequests.slice(-2)).toHaveLength(2);
    expect(fake.dispatchRequests[fake.dispatchRequests.length - 2]).toBe(
      fake.dispatchRequests[fake.dispatchRequests.length - 1]
    );
    expect(fake.revalidations).toBe(4);
  });

  it("makes prompt-delivered schemas visible once and suppresses native fields", async () => {
    const keys = jest.fn(async () => "unused");
    const service = new LLMService(keys, { logLevel: "silent" });
    const schema: StructuredOutputSchema = {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
    };
    const promptHandle = await service.prepareMessage(
      {
        providerId: "openai",
        modelId: "gpt-4.1",
        messages: [{ role: "user", content: "Answer" }],
        settings: {
          structuredOutput: {
            name: "result",
            schema,
            delivery: "prompt",
          },
        },
      },
      { mode: "complete" }
    );
    const nativeHandle = await service.prepareMessage(
      {
        providerId: "openai",
        modelId: "gpt-4.1",
        messages: [{ role: "user", content: "Answer" }],
        settings: {
          structuredOutput: {
            name: "result",
            schema,
            delivery: "native",
          },
        },
      },
      { mode: "complete" }
    );
    const prompt = (await service.inspectPrepared(
      promptHandle as PreparedCompleteCall
    )) as any;
    const native = (await service.inspectPrepared(
      nativeHandle as PreparedCompleteCall
    )) as any;
    const promptContent = String(prompt.request.messages[0].content);

    expect(keys).not.toHaveBeenCalled();
    expect(
      promptContent.match(/<GENAI_LITE_STRUCTURED_OUTPUT revision=/g)
    ).toHaveLength(1);
    expect(prompt.request.structuredOutput).toMatchObject({
      delivery: "prompt",
      enforcement: "instruction_only",
      promptRevision: "prompt-schema-v1",
    });
    expect(prompt.request.settings.response_format).toBeUndefined();
    expect(native.request.structuredOutput).toMatchObject({
      delivery: "native",
      enforcement: "provider",
      schema: {
        type: "object",
        additionalProperties: false,
      },
    });
    expect(native.request.settings.response_format).toBeDefined();
  });

  it("gives every event one attempt ID, suppresses late terminals, and changes IDs on redispatch", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    fake.streamFactory = (internal) => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "start",
          provider: internal.providerId,
          model: internal.modelId,
          id: "id",
          created: 1,
        };
        yield { type: "content_delta", delta: "A", index: 0 };
        yield { type: "complete", response: success(internal) };
        yield { type: "content_delta", delta: "late", index: 0 };
        yield {
          type: "error",
          error: {
            provider: internal.providerId,
            model: internal.modelId,
            error: { message: "late", code: "X", type: "server_error" },
            object: "error",
          },
        };
      },
    });
    const handle = await service.prepareMessage(request, { mode: "stream" });
    const first = await collect(
      service.streamPrepared(handle as PreparedStreamCall)
    );
    const second = await collect(
      service.streamPrepared(handle as PreparedStreamCall)
    );

    expect(first.map((event) => event.type)).toEqual([
      "start",
      "content_delta",
      "complete",
    ]);
    expect(new Set(first.map((event) => event.attemptId)).size).toBe(1);
    expect(first[0].attemptId).not.toBe(second[0].attemptId);
    expect(fake.dispatchRequests).toHaveLength(2);
  });

  it("revalidates every streaming dispatch and rejects a missing current revision", async () => {
    let generation: number | undefined = 7;
    const providerEndpointRevisionProvider = jest.fn(async () => generation);
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    const handle = await service.prepareMessage(request, { mode: "stream" });

    const first = await collect(
      service.streamPrepared(handle as PreparedStreamCall)
    );
    generation = undefined;
    const second = await collect(
      service.streamPrepared(handle as PreparedStreamCall)
    );

    expect(first[first.length - 1]).toMatchObject({ type: "complete" });
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      type: "error",
      error: { error: { code: "PREPARED_CALL_STALE" } },
    });
    expect(fake.revalidations).toBe(2);
    expect(fake.dispatchRequests).toHaveLength(1);
    expect(providerEndpointRevisionProvider).toHaveBeenCalledTimes(3);
  });

  it("turns an end-without-terminal stream into one error", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    fake.streamFactory = () => ({
      async *[Symbol.asyncIterator]() {
        yield { type: "content_delta", delta: "partial", index: 0 };
      },
    });
    const handle = await service.prepareMessage(request, { mode: "stream" });
    const events = await collect(
      service.streamPrepared(handle as PreparedStreamCall)
    );
    expect(events.map((event) => event.type)).toEqual([
      "content_delta",
      "error",
    ]);
    expect(events[1].error.error.message).toContain(
      "without a terminal event"
    );
  });

  it("cancels promptly when next() and return() never settle", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    const returnMock = jest.fn(
      () => new Promise<IteratorResult<AdapterLLMStreamEvent>>(() => undefined)
    );
    fake.streamFactory = (internal) => ({
      [Symbol.asyncIterator]() {
        let first = true;
        return {
          next: () => {
            if (first) {
              first = false;
              return Promise.resolve({
                done: false as const,
                value: {
                  type: "start" as const,
                  provider: internal.providerId,
                  model: internal.modelId,
                  id: "hung",
                  created: 1,
                },
              });
            }
            if (!state.sentContent) {
              state.sentContent = true;
              return Promise.resolve({
                done: false as const,
                value: {
                  type: "content_delta" as const,
                  delta: "partial",
                  index: 0,
                  observedEvidence: {
                    choice: {
                      index: 0,
                      rawContentDelta: "<think>raw</think>partial",
                      rawContentParts: [{
                        type: "text",
                        text: "<think>raw</think>partial",
                      }],
                      rawAnswerAccounting: {
                        tokens: 6,
                        method: "heuristic" as const,
                        source: "library" as const,
                        reasoning: "unknown" as const,
                      },
                    },
                  },
                },
              });
            }
            if (!state.sentUsage) {
              state.sentUsage = true;
              return Promise.resolve({
                done: false as const,
                value: {
                  type: "usage" as const,
                  usage: { prompt_tokens: 7 },
                  observedEvidence: {
                    choice: {
                      index: 0,
                      answerAccounting: {
                        providerOutput: {
                          tokens: 11,
                          method: "exact" as const,
                          source: "provider" as const,
                          reasoning: "included_native" as const,
                        },
                      },
                      finishReason: "length",
                      termination: {
                        rawReason: "length",
                        kind: "limit" as const,
                        limit: "unknown" as const,
                      },
                    },
                    usageEvidence: {
                      prompt_tokens: {
                        source: "provider" as const,
                        providerField: "input_tokens",
                      },
                    },
                  },
                },
              });
            }
            return new Promise(() => undefined);
          },
          return: returnMock,
        };
      },
    });
    const state = { sentContent: false, sentUsage: false };
    const handle = await service.prepareMessage(request, { mode: "stream" });
    const controller = new AbortController();
    const iterator = service
      .streamPrepared(handle as PreparedStreamCall, {
        signal: controller.signal,
      })
      [Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.value?.type).toBe("start");
    expect((await iterator.next()).value?.type).toBe("content_delta");
    expect((await iterator.next()).value?.type).toBe("usage");
    const startedAt = Date.now();
    const terminalPromise = iterator.next();
    setTimeout(() => controller.abort(), 10);
    const terminal = await terminalPromise;
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(terminal.value).toMatchObject({
      type: "error",
      error: {
        error: { code: "REQUEST_ABORTED" },
        partialResponse: {
          choices: [{
            message: { content: "partial" },
            rawContent: "<think>raw</think>partial",
            rawContentParts: [{
              type: "text",
              text: "<think>raw</think>partial",
            }],
            rawAnswerAccounting: {
              tokens: 6,
              method: "heuristic",
            },
            answerAccounting: {
              rawContent: {
                tokens: 6,
                method: "heuristic",
              },
              providerOutput: {
                tokens: 11,
                method: "exact",
                source: "provider",
              },
            },
            finish_reason: "length",
            termination: {
              rawReason: "length",
              kind: "limit",
              limit: "unknown",
            },
          }],
          usage: { prompt_tokens: 7 },
          usageEvidence: {
            prompt_tokens: {
              source: "provider",
              providerField: "input_tokens",
            },
          },
        },
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
    expect(returnMock).toHaveBeenCalledTimes(1);
  });

  it("keeps usage received in adapter evidence when cancellation wins before the public usage event", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    fake.streamFactory = (internal) => ({
      [Symbol.asyncIterator]() {
        let step = 0;
        return {
          next: () => {
            step += 1;
            if (step === 1) {
              return Promise.resolve({
                done: false as const,
                value: {
                  type: "adapter_evidence" as const,
                  observedEvidence: {
                    usage: {
                      prompt_tokens: 9,
                      completion_tokens: 3,
                      total_tokens: 12,
                    },
                    usageEvidence: {
                      prompt_tokens: {
                        source: "provider" as const,
                        providerField: "prompt_tokens",
                      },
                      completion_tokens: {
                        source: "provider" as const,
                        providerField: "completion_tokens",
                      },
                      total_tokens: {
                        source: "provider" as const,
                        providerField: "total_tokens",
                      },
                    },
                  },
                },
              });
            }
            if (step === 2) {
              return Promise.resolve({
                done: false as const,
                value: {
                  type: "start" as const,
                  provider: internal.providerId,
                  model: internal.modelId,
                  id: "usage-before-abort",
                  created: 1,
                },
              });
            }
            return new Promise<IteratorResult<AdapterLLMStreamEvent>>(
              () => undefined
            );
          },
          return: () =>
            Promise.resolve({
              done: true as const,
              value: undefined,
            }),
        };
      },
    });

    const handle = await service.prepareMessage(request, { mode: "stream" });
    const controller = new AbortController();
    const iterator = service
      .streamPrepared(handle as PreparedStreamCall, {
        signal: controller.signal,
      })
      [Symbol.asyncIterator]();

    expect((await iterator.next()).value?.type).toBe("start");
    const terminalPromise = iterator.next();
    controller.abort();
    const terminal = await terminalPromise;

    expect(terminal.value).toMatchObject({
      type: "error",
      error: {
        error: { code: "REQUEST_ABORTED" },
        partialResponse: {
          usage: {
            prompt_tokens: 9,
            completion_tokens: 3,
            total_tokens: 12,
          },
          usageEvidence: {
            prompt_tokens: {
              source: "provider",
              providerField: "prompt_tokens",
            },
          },
        },
      },
    });
  });

  it("merges observed usage evidence into an adapter partial failure", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    fake.streamFactory = (internal) => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "usage",
          usage: { prompt_tokens: 11 },
          observedEvidence: {
            usageEvidence: {
              prompt_tokens: {
                source: "provider",
                providerField: "input_tokens",
              },
            },
          },
        } as const;
        yield {
          type: "error",
          error: {
            provider: internal.providerId,
            model: internal.modelId,
            error: {
              message: "provider failed",
              code: "PROVIDER_ERROR",
              type: "server_error",
            },
            object: "error",
            partialResponse: {
              id: "partial",
              provider: internal.providerId,
              model: internal.modelId,
              created: 1,
              choices: [{
                index: 0,
                message: { role: "assistant", content: "adapter partial" },
                finish_reason: null,
              }],
            },
          },
        } as const;
      },
    });
    const handle = await service.prepareMessage(request, { mode: "stream" });
    const events = await collect(
      service.streamPrepared(handle as PreparedStreamCall)
    );

    expect(events[events.length - 1]).toMatchObject({
      type: "error",
      error: {
        partialResponse: {
          choices: [{
            message: { content: "adapter partial" },
          }],
          usage: { prompt_tokens: 11 },
          usageEvidence: {
            prompt_tokens: {
              source: "provider",
              providerField: "input_tokens",
            },
          },
        },
      },
    });
  });

  it("assigns attempt IDs to validation and credential failures before provider iteration", async () => {
    const validationService = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const validationEvents = await collect(
      validationService.streamMessage({
        providerId: "unsupported" as any,
        modelId: "none",
        messages: [{ role: "user", content: "x" }],
      })
    );
    expect(validationEvents[0]).toMatchObject({
      type: "error",
      attemptId: expect.any(String),
    });

    const keyService = new LLMService(async () => null, {
      logLevel: "silent",
    });
    registerFake(keyService, new PreparedFakeAdapter());
    const keyEvents = await collect(keyService.streamMessage(request));
    expect(keyEvents[0]).toMatchObject({
      type: "error",
      attemptId: expect.any(String),
      error: { error: { code: "API_KEY_ERROR" } },
    });

    const preparationService = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const preparationAdapter = new PreparedFakeAdapter();
    preparationAdapter.prepareRequest = jest
      .fn()
      .mockRejectedValue(new Error("preparation failed"));
    registerFake(preparationService, preparationAdapter);
    const preparationEvents = await collect(
      preparationService.streamMessage(request)
    );
    expect(preparationEvents[0]).toMatchObject({
      type: "error",
      attemptId: expect.any(String),
      error: { error: { message: "preparation failed" } },
    });

    const handleEvents = await collect(
      preparationService.streamPrepared({} as PreparedStreamCall)
    );
    expect(handleEvents[0]).toMatchObject({
      type: "error",
      attemptId: expect.any(String),
      error: { error: { code: "INVALID_PREPARED_CALL" } },
    });
  });

  it("rejects invalid runtime modes and adapter mode drift", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);

    const invalid = await service.prepareMessage(
      request,
      { mode: "invalid" } as any
    );
    expect(invalid).toMatchObject({
      object: "error",
      error: { code: "INVALID_PREPARED_CALL" },
    });
    expect(fake.preparedRequests).toHaveLength(0);

    fake.prepareRequest = jest.fn(
      async (
        internal: InternalLLMChatRequest,
        context: AdapterPreparationContext
      ): Promise<AdapterPreparationResult> => {
        const result = await new PreparedFakeAdapter().prepareRequest(
          internal,
          context
        );
        if ("prepared" in result) {
          result.prepared.mode =
            context.mode === "complete" ? "stream" : "complete";
        }
        return result;
      }
    );
    const drift = await service.prepareMessage(request, {
      mode: "complete",
    });
    expect(drift).toMatchObject({
      object: "error",
      error: { code: "INVALID_PREPARED_CALL" },
    });
  });

  it("turns synchronous iterator construction failures into one terminal error", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    fake.streamPrepared = () => {
      throw new Error("iterator construction failed");
    };
    const handle = await service.prepareMessage(request, { mode: "stream" });
    const events = await collect(
      service.streamPrepared(handle as PreparedStreamCall)
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      attemptId: expect.any(String),
      error: { error: { message: "iterator construction failed" } },
    });
  });

  it("turns malformed terminal postprocessing into one error envelope", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    fake.streamFactory = (internal) => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "error",
          error: {
            provider: internal.providerId,
            model: internal.modelId,
            error: {
              message: "provider failed",
              code: "PROVIDER_ERROR",
              type: "server_error",
            },
            object: "error",
            partialResponse: {
              id: "malformed",
              provider: internal.providerId,
              model: internal.modelId,
              created: 1,
              choices: undefined,
            } as any,
          },
        };
      },
    });
    const handle = await service.prepareMessage(
      {
        ...request,
        settings: {
          maxTokens: 123,
          structuredOutput: {
            name: "answer",
            schema: { type: "object" },
          },
        },
      },
      { mode: "stream" }
    );
    const events = await collect(
      service.streamPrepared(handle as PreparedStreamCall)
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      error: { error: { code: "PROVIDER_ERROR" } },
    });
  });

  it("reports library defaults and verified hard-limit clamps separately", () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const libraryModel = {
      ...createFallbackModelInfo("model", "openai"),
      maxTokens: undefined,
      defaultSettings: undefined,
    };
    const libraryDefault = (
      service as any
    ).createEffectiveOutputTokenLimit(
      {
        providerId: "openai",
        modelId: "model",
        messages: [],
      },
      "openai",
      libraryModel,
      4096
    );
    const clamped = (
      service as any
    ).createEffectiveOutputTokenLimit(
      {
        providerId: "openai",
        modelId: "model",
        messages: [],
        settings: { maxTokens: 1000 },
      },
      "openai",
      {
        ...libraryModel,
        hardOutputTokenLimit: {
          tokens: 512,
          source: "model_hard_limit",
          counts: "visible_and_reasoning",
        },
      },
      1000
    );

    expect(libraryDefault).toMatchObject({
      tokens: 4096,
      source: "library_default",
      counts: "visible_and_reasoning",
    });
    expect(clamped).toEqual({
      tokens: 512,
      source: "request",
      requestedTokens: 1000,
      clamp: {
        tokens: 512,
        source: "model_hard_limit",
      },
      counts: "visible_and_reasoning",
    });
    expect(
      (service as any).createEffectiveOutputTokenLimit(
        request,
        "mock",
        libraryModel,
        undefined
      )
    ).toBeUndefined();
  });

  it("labels raw counts that include extracted thinking-tag content", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    fake.sendResults.push({
      ...success({
        ...request,
        settings: {} as any,
      } as InternalLLMChatRequest),
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "<thinking>why</thinking>answer",
        },
        rawContent: "<thinking>why</thinking>answer",
        rawAnswerAccounting: {
          tokens: 9,
          method: "heuristic",
          source: "library",
          reasoning: "unknown",
        },
        finish_reason: "stop",
      }],
    });
    const handle = await service.prepareMessage(
      {
        ...request,
        settings: {
          maxTokens: 123,
          thinkingTagFallback: {
            enabled: true,
            tagName: "thinking",
          },
        },
      },
      { mode: "complete" }
    );
    const response = await service.sendPrepared(
      handle as PreparedCompleteCall
    );

    expect(response.object).toBe("chat.completion");
    if (response.object === "chat.completion") {
      expect(response.choices[0]).toMatchObject({
        message: { content: "answer" },
        rawContent: "<thinking>why</thinking>answer",
        reasoning: "why",
        answerAccounting: {
          rawContent: {
            reasoning: "included_extracted",
          },
        },
        rawAnswerAccounting: {
          reasoning: "included_extracted",
        },
      });
    }
  });

  it("reuses one authoritative snapshot while keeping ending and dispatch reads live", async () => {
    const providerEndpointRevisionProvider = jest.fn(
      async () => "generation-a"
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
      cachePreparationStateByEndpointRevision: true,
    });
    const fake = new CachePreparedFakeAdapter();
    registerFake(service, fake, "llamacpp");

    const first = await service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });
    const second = await service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });
    expect((first as LLMFailureResponse).object).not.toBe("error");
    expect((second as LLMFailureResponse).object).not.toBe("error");
    expect(fake.snapshotCalls).toBe(1);
    expect(fake.preparationContexts).toHaveLength(2);
    expect(fake.preparationContexts[0].providerState).toBe(
      fake.preparationContexts[1].providerState
    );
    expect(fake.preparationContexts[0]).toMatchObject({
      providerEndpointRevision: "generation-a",
      cachePreparationStateByEndpointRevision: true,
    });
    expect(providerEndpointRevisionProvider).toHaveBeenCalledTimes(4);

    await service.sendPrepared(first as PreparedCompleteCall);
    await service.sendPrepared(second as PreparedCompleteCall);
    expect(fake.revalidations).toBe(2);
    expect(providerEndpointRevisionProvider).toHaveBeenCalledTimes(6);
  });

  it("rejects a mid-prepare revision change and refetches under the new revision", async () => {
    let generation = 1;
    const providerEndpointRevisionProvider = jest.fn(
      async () => generation
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
      cachePreparationStateByEndpointRevision: true,
    });
    const fake = new CachePreparedFakeAdapter();
    fake.onPrepare = () => {
      generation = 2;
    };
    registerFake(service, fake, "llamacpp");

    const stale = await service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });
    expect(stale).toMatchObject({
      object: "error",
      error: { code: "PREPARED_CALL_STALE" },
    });
    fake.onPrepare = undefined;
    const stable = await service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });
    expect((stable as LLMFailureResponse).object).not.toBe("error");
    expect(fake.snapshotCalls).toBe(2);
  });

  it("preserves Object.is revision semantics and rejects negative-zero to zero", async () => {
    let generation = -0;
    const providerEndpointRevisionProvider = jest.fn(
      async () => generation
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
      cachePreparationStateByEndpointRevision: true,
    });
    const fake = new CachePreparedFakeAdapter();
    fake.onPrepare = () => {
      generation = 0;
    };
    registerFake(service, fake, "llamacpp");

    const result = await service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });

    expect(result).toMatchObject({
      object: "error",
      error: { code: "PREPARED_CALL_STALE" },
    });
  });

  it("coalesces concurrent snapshot reads but keeps each ending read independent", async () => {
    let resolveSnapshot!: (value: unknown) => void;
    const snapshotPromise = new Promise<unknown>((resolve) => {
      resolveSnapshot = resolve;
    });
    const providerEndpointRevisionProvider = jest.fn(
      async () => "generation-a"
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
      cachePreparationStateByEndpointRevision: true,
    });
    const fake = new CachePreparedFakeAdapter();
    fake.snapshotFactory = async () => snapshotPromise;
    registerFake(service, fake, "llamacpp");

    const first = service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });
    const second = service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.snapshotCalls).toBe(1);
    resolveSnapshot({
      kind: "llamacpp-preparation-v1",
      selectedModel: "llamacpp",
      detectedCaps: null,
      stateBinding: { serverStateFingerprint: "state-a" },
    });
    const results = await Promise.all([first, second]);

    expect(
      results.every(
        (result) => (result as LLMFailureResponse).object !== "error"
      )
    ).toBe(true);
    expect(fake.snapshotCalls).toBe(1);
    expect(providerEndpointRevisionProvider).toHaveBeenCalledTimes(4);
  });

  it("does not retain failed or binding-less preparation snapshots", async () => {
    const providerEndpointRevisionProvider = jest.fn(
      async () => "generation-a"
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
      cachePreparationStateByEndpointRevision: true,
    });
    const fake = new CachePreparedFakeAdapter();
    let attempt = 0;
    fake.snapshotFactory = async (modelId) => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error("snapshot failed");
      }
      return {
        kind: "llamacpp-preparation-v1",
        selectedModel: modelId,
        detectedCaps: null,
      };
    };
    registerFake(service, fake, "llamacpp");

    const failed = await service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });
    expect(failed).toMatchObject({
      object: "error",
      error: { code: "PROVIDER_ERROR" },
    });
    const firstBindingless = await service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });
    const secondBindingless = await service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });

    expect((firstBindingless as LLMFailureResponse).object).not.toBe("error");
    expect((secondBindingless as LLMFailureResponse).object).not.toBe("error");
    expect(fake.snapshotCalls).toBe(3);
  });

  it("bounds the authoritative snapshot cache and evicts least-recently-used models", async () => {
    const providerEndpointRevisionProvider = jest.fn(
      async () => "generation-a"
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
      cachePreparationStateByEndpointRevision: true,
    });
    const fake = new CachePreparedFakeAdapter();
    registerFake(service, fake, "llamacpp");

    for (let index = 0; index < 33; index += 1) {
      const prepared = await service.prepareMessage(
        llamaRequest(`local-${index}`),
        { mode: "complete" }
      );
      expect((prepared as LLMFailureResponse).object).not.toBe("error");
    }
    expect((service as any).preparationStateCache.size).toBe(32);
    await service.prepareMessage(llamaRequest("local-0"), {
      mode: "complete",
    });
    expect(fake.snapshotCalls).toBe(34);
    expect((service as any).preparationStateCache.size).toBe(32);
  });

  it("drops snapshots owned by a replaced adapter identity", async () => {
    const providerEndpointRevisionProvider = jest.fn(
      async () => "generation-a"
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
      cachePreparationStateByEndpointRevision: true,
    });
    const first = new CachePreparedFakeAdapter();
    registerFake(service, first, "llamacpp");
    await service.prepareMessage(llamaRequest(), { mode: "complete" });
    await service.prepareMessage(llamaRequest("other-local-model"), {
      mode: "complete",
    });

    const replacement = new CachePreparedFakeAdapter();
    registerFake(service, replacement, "llamacpp");
    await service.prepareMessage(llamaRequest(), { mode: "complete" });

    expect(first.snapshotCalls).toBe(2);
    expect(replacement.snapshotCalls).toBe(1);
    expect((service as any).preparationStateCache.size).toBe(1);
    expect(
      (Array.from(
        (service as any).preparationStateCache.values()
      )[0] as any).adapter
    ).toBe(replacement);
  });

  it("evicts a published snapshot when the adapter changes during preparation", async () => {
    const providerEndpointRevisionProvider = jest.fn(
      async () => "generation-a"
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
      cachePreparationStateByEndpointRevision: true,
    });
    const first = new CachePreparedFakeAdapter();
    const replacement = new CachePreparedFakeAdapter();
    registerFake(service, first, "llamacpp");
    await service.prepareMessage(llamaRequest(), { mode: "complete" });
    first.onPrepare = () => registerFake(service, replacement, "llamacpp");

    const stale = await service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });

    expect(stale).toMatchObject({
      object: "error",
      error: { code: "PREPARED_CALL_STALE" },
    });
    expect((service as any).preparationStateCache.size).toBe(0);
    await service.prepareMessage(llamaRequest(), { mode: "complete" });
    expect(replacement.snapshotCalls).toBe(1);
  });

  it("invalidates a cached snapshot when live endpoint revalidation rejects dispatch", async () => {
    let generation: string | undefined = "generation-a";
    const providerEndpointRevisionProvider = jest.fn(
      async () => generation
    );
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
      providerEndpointRevisionProvider,
      cachePreparationStateByEndpointRevision: true,
    });
    const fake = new CachePreparedFakeAdapter();
    registerFake(service, fake, "llamacpp");
    const handle = await service.prepareMessage(llamaRequest(), {
      mode: "complete",
    });

    generation = undefined;
    const stale = await service.sendPrepared(
      handle as PreparedCompleteCall
    );
    expect(stale).toMatchObject({
      object: "error",
      error: { code: "PREPARED_CALL_STALE" },
    });
    generation = "generation-a";
    await service.prepareMessage(llamaRequest(), { mode: "complete" });
    expect(fake.snapshotCalls).toBe(2);
  });

  it("keeps keyed scopes independent and treats keyed raw evidence as canonical", async () => {
    const service = new LLMService(async () => "not-needed", {
      logLevel: "silent",
    });
    const fake = new PreparedFakeAdapter();
    registerFake(service, fake);
    fake.sendResults.push({
      ...success(request as InternalLLMChatRequest),
      choices: [{
        index: 0,
        message: { role: "assistant", content: "answer" },
        rawContent: "answer",
        answerAccounting: {
          rawContent: {
            tokens: 5,
            method: "model",
            source: "library",
            reasoning: "unknown",
          },
          providerOutput: {
            tokens: 8,
            method: "exact",
            source: "provider",
            reasoning: "included_native",
          },
        },
        rawAnswerAccounting: {
          tokens: 99,
          method: "heuristic",
          source: "library",
          reasoning: "unknown",
        },
        finish_reason: "stop",
      }],
    });
    const handle = await service.prepareMessage(request, {
      mode: "complete",
    });
    const response = await service.sendPrepared(
      handle as PreparedCompleteCall
    );

    expect(response.object).toBe("chat.completion");
    if (response.object === "chat.completion") {
      expect(response.choices[0].answerAccounting).toMatchObject({
        rawContent: { tokens: 5, method: "model" },
        providerOutput: { tokens: 8, source: "provider" },
      });
      expect(response.choices[0].rawAnswerAccounting).toMatchObject({
        tokens: 5,
        method: "model",
      });
    }
  });
});
