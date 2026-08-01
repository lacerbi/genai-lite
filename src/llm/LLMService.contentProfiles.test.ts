import { LLMService } from "./LLMService";
import { MockClientAdapter } from "./clients/MockClientAdapter";
import type { AdapterLLMStreamEvent } from "./clients/types";
import {
  computeContentTokenizerSemanticRevision,
  registerContentTokenProfileConfiguration,
} from "./tokenization";
import type {
  LLMFailureResponse,
  LLMResponse,
  PreparedCompleteCall,
  PreparedStreamCall,
} from "./types";

function createProviderAccountedResponse(
  model: string,
  content = "answer"
): LLMResponse {
  return {
    id: `service-content-profile-${model}`,
    object: "chat.completion",
    created: 1,
    model,
    provider: "mock",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
        answerAccounting: {
          providerOutput: {
            tokens: 9,
            method: "exact",
            source: "provider",
            reasoning: "unknown",
          },
        },
      },
    ],
  };
}

function expectModelRawContentAccounting(
  response: LLMResponse,
  tokenizerId: string,
  revision: string
): void {
  expect(response.choices[0].answerAccounting).toEqual({
    rawContent: {
      tokens: 6,
      method: "model",
      source: "library",
      tokenizerId,
      tokenProfileRevision: revision,
      reasoning: "unknown",
    },
    providerOutput: {
      tokens: 9,
      method: "exact",
      source: "provider",
      reasoning: "unknown",
    },
  });
  expect(response.choices[0].rawAnswerAccounting).toEqual(
    response.choices[0].answerAccounting?.rawContent
  );
}

describe("LLMService registered content-token profiles", () => {
  const semantic = {
    tokenizerImplementation: "service-test-tokenizer-v1",
    textPolicy: "ordinary-text-no-specials-v1" as const,
    artifacts: [{ role: "vocab", sha256: "e".repeat(64) }],
  };
  const revision = computeContentTokenizerSemanticRevision(semantic);

  beforeAll(() => {
    registerContentTokenProfileConfiguration({
      backends: [
        {
          id: "service-test-profile",
          tokenizerId: "test:service-tokenizer",
          revision,
          provenance: { semantic },
          countTextTokens: (text: string): number => text.length,
        },
      ],
      aliases: [
        {
          providerId: "mock",
          modelId: "registered-content-model",
          profileId: "service-test-profile",
        },
      ],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reports model-quality counting with mapping provenance", async () => {
    const service = new LLMService(
      async () => "mock-key",
      { logLevel: "silent" }
    );
    const result = await service.getModelCapabilities(
      "mock",
      "registered-content-model"
    );

    expect(result).toMatchObject({
      capabilities: {
        contentTokenCounting: "model",
        tokenProfileId: "service-test-profile",
        tokenProfileMappingRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
  });

  it("fills only missing raw-content evidence from the registered profile", async () => {
    jest.spyOn(MockClientAdapter.prototype, "sendPrepared").mockResolvedValue(
      createProviderAccountedResponse("registered-content-model")
    );
    const service = new LLMService(
      async () => "mock-key",
      { logLevel: "silent" }
    );
    const response = await service.sendMessage({
      providerId: "mock",
      modelId: "registered-content-model",
      messages: [{ role: "user", content: "question" }],
    });

    expect(response.object).toBe("chat.completion");
    if (response.object === "chat.completion") {
      expectModelRawContentAccounting(
        response,
        "test:service-tokenizer",
        revision
      );
    }
  });

  it("supports cloud-first late registration for prepared complete and stream calls", async () => {
    const service = new LLMService(
      async () => "mock-key",
      { logLevel: "silent" }
    );
    const cloudBefore = await service.getModelCapabilities(
      "openai",
      "gpt-4.1"
    );
    expect(cloudBefore).toMatchObject({
      capabilities: {
        contentTokenCounting: "exact",
        tokenProfileMappingRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    if (cloudBefore.object === "error") {
      throw new Error(cloudBefore.error.message);
    }
    const mappingBefore = cloudBefore.capabilities.tokenProfileMappingRevision;

    const preRegistrationResponse = await service.sendMessage({
      providerId: "mock",
      modelId: "before-late-content-registration",
      messages: [{ role: "user", content: "hello before registration" }],
    });
    expect(preRegistrationResponse.object).toBe("chat.completion");

    const lateModel = "late-content-model";
    const request = {
      providerId: "mock" as const,
      modelId: lateModel,
      messages: [{ role: "user" as const, content: "question" }],
    };
    const completeHandle = await service.prepareMessage(request, {
      mode: "complete",
    });
    const streamHandle = await service.prepareMessage(request, {
      mode: "stream",
    });
    expect((completeHandle as LLMFailureResponse).object).not.toBe("error");
    expect((streamHandle as LLMFailureResponse).object).not.toBe("error");

    const completeInspectionBefore = await service.inspectPrepared(
      completeHandle as PreparedCompleteCall
    );
    const streamInspectionBefore = await service.inspectPrepared(
      streamHandle as PreparedStreamCall
    );
    const capabilityBefore = await service.getModelCapabilities(
      "mock",
      lateModel
    );
    if (capabilityBefore.object === "error") {
      throw new Error(capabilityBefore.error.message);
    }
    expect(capabilityBefore.capabilities.contentTokenCounting).toBe(
      "unavailable"
    );

    const lateSemantic = {
      tokenizerImplementation: "late-service-test-tokenizer-v1",
      textPolicy: "ordinary-text-no-specials-v1" as const,
      artifacts: [{ role: "vocab", sha256: "f".repeat(64) }],
    };
    const lateRevision = computeContentTokenizerSemanticRevision(lateSemantic);
    registerContentTokenProfileConfiguration({
      backends: [
        {
          id: "late-service-test-profile",
          tokenizerId: "test:late-service-tokenizer",
          revision: lateRevision,
          provenance: { semantic: lateSemantic },
          countTextTokens: (text: string): number => text.length,
        },
      ],
      aliases: [
        {
          providerId: "mock",
          modelId: lateModel,
          profileId: "late-service-test-profile",
        },
      ],
    });

    const capabilityAfter = await service.getModelCapabilities(
      "mock",
      lateModel
    );
    expect(capabilityAfter).toMatchObject({
      capabilities: {
        contentTokenCounting: "model",
        tokenProfileId: "late-service-test-profile",
        tokenProfileMappingRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    if (capabilityAfter.object === "error") {
      throw new Error(capabilityAfter.error.message);
    }
    expect(capabilityAfter.capabilities.tokenProfileMappingRevision).not.toBe(
      mappingBefore
    );

    const completeInspectionAfter = await service.inspectPrepared(
      completeHandle as PreparedCompleteCall
    );
    const streamInspectionAfter = await service.inspectPrepared(
      streamHandle as PreparedStreamCall
    );
    expect(completeInspectionAfter).toEqual(completeInspectionBefore);
    expect(streamInspectionAfter).toEqual(streamInspectionBefore);

    jest.spyOn(MockClientAdapter.prototype, "sendPrepared").mockImplementation(
      async (): Promise<LLMResponse> =>
        createProviderAccountedResponse(lateModel)
    );
    jest.spyOn(MockClientAdapter.prototype, "streamPrepared").mockImplementation(
      async function* (): AsyncIterable<AdapterLLMStreamEvent> {
        yield {
          type: "complete",
          response: createProviderAccountedResponse(lateModel),
        };
      }
    );

    const completeResponse = await service.sendPrepared(
      completeHandle as PreparedCompleteCall
    );
    expect(completeResponse.object).toBe("chat.completion");
    if (completeResponse.object === "chat.completion") {
      expectModelRawContentAccounting(
        completeResponse,
        "test:late-service-tokenizer",
        lateRevision
      );
    }

    const streamEvents = [];
    for await (const event of service.streamPrepared(
      streamHandle as PreparedStreamCall
    )) {
      streamEvents.push(event);
    }
    const terminal = streamEvents.find((event) => event.type === "complete");
    expect(terminal?.type).toBe("complete");
    if (terminal?.type === "complete") {
      expectModelRawContentAccounting(
        terminal.response,
        "test:late-service-tokenizer",
        lateRevision
      );
    }
  });
});
