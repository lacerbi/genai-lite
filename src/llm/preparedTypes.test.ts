import { validateLLMSettings } from "./config";
import type {
  LLMFailureResponse,
  LLMServiceStreamEvent,
  LLMStreamEvent,
  PreparedCompleteCall,
  PreparedPromptAccounting,
  PreparedStreamCall,
} from "./types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
} from "./clients/types";

describe("prepared-call public contracts", () => {
  it("requires evidence when prepared accounting is available", () => {
    const countOnly: PreparedPromptAccounting = {
      status: "available",
      count: { tokens: 12, method: "exact" },
    };
    const boundOnly: PreparedPromptAccounting = {
      status: "available",
      upperBound: {
        tokens: 16,
        certificate: {
          id: "test",
          derivation: "fixture",
          provenance: "unit test",
          targetProfileRevision: "target-v1",
        },
      },
    };

    // @ts-expect-error available accounting must contain a count or bound
    const empty: PreparedPromptAccounting = { status: "available" };

    expect(countOnly.status).toBe("available");
    expect(boundOnly.status).toBe("available");
    expect(empty.status).toBe("available");
  });

  it("keeps complete and stream handles nominally distinct", () => {
    const send = (_prepared: PreparedCompleteCall): void => undefined;
    const stream = (_prepared: PreparedStreamCall): void => undefined;
    const complete = {} as PreparedCompleteCall;
    const streaming = {} as PreparedStreamCall;

    send(complete);
    stream(streaming);
    // @ts-expect-error stream handles cannot be sent through the complete dispatcher
    send(streaming);
    // @ts-expect-error complete handles cannot be sent through the stream dispatcher
    stream(complete);
  });

  it("requires attempt IDs on service stream events", () => {
    const event: LLMServiceStreamEvent = {
      attemptId: "attempt-1",
      type: "content_delta",
      delta: "hello",
      index: 0,
    };
    // @ts-expect-error service events always carry an attempt ID
    const missing: LLMServiceStreamEvent = {
      type: "content_delta",
      delta: "hello",
      index: 0,
    };

    expect(event.attemptId).toBe("attempt-1");
    expect(missing.type).toBe("content_delta");
  });

  it("keeps legacy adapter implementations source-compatible", async () => {
    const failure: LLMFailureResponse = {
      provider: "legacy",
      model: "legacy-model",
      object: "error",
      error: { message: "fixture" },
    };
    const legacy: ILLMClientAdapter = {
      async sendMessage(_request: InternalLLMChatRequest) {
        return failure;
      },
      async *streamMessage() {
        const event: LLMStreamEvent = {
          type: "content_delta",
          delta: "legacy",
          index: 0,
        };
        yield event;
      },
    };

    expect(legacy.prepareRequest).toBeUndefined();
    await expect(
      legacy.sendMessage({} as InternalLLMChatRequest, "unused")
    ).resolves.toBe(failure);
    const stream = legacy.streamMessage!(
      {} as InternalLLMChatRequest,
      "unused"
    );
    await expect(stream[Symbol.asyncIterator]().next()).resolves.toMatchObject({
      value: { type: "content_delta", delta: "legacy" },
    });
  });

  it("validates explicit structured-output delivery", () => {
    const base = {
      name: "answer",
      schema: { type: "object" as const },
    };

    expect(
      validateLLMSettings({
        structuredOutput: { ...base, delivery: "prompt" },
      })
    ).toEqual([]);
    expect(
      validateLLMSettings({
        structuredOutput: {
          ...base,
          delivery: "invalid" as "native",
        },
      })
    ).toContain("structuredOutput.delivery must be 'native' or 'prompt'");
  });
});
