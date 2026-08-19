import { LLMService } from "./LLMService";
import {
  MODEL_DEFAULT_SETTINGS,
  PROVIDER_DEFAULT_SETTINGS,
} from "./config";
import { extractSingleTokenLabelProbs } from "./constrainedLabels";
import type { ApiKeyProvider } from "../types";
import type {
  LLMFailureResponse,
  LLMResponse,
  PreparedCompleteCall,
  PreparedStreamCall,
} from "./types";

describe("LLMService logprobs integration", () => {
  let apiKeyProvider: jest.MockedFunction<ApiKeyProvider>;
  let service: LLMService;

  const request = {
    providerId: "mock" as const,
    modelId: "mock-model",
    messages: [{ role: "user" as const, content: "Hello" }],
    settings: {
      logprobs: true,
      topLogprobs: 2,
      maxTokens: 500,
    },
  };

  beforeEach(() => {
    apiKeyProvider = jest.fn(async (_providerId: string) => "mock-key");
    service = new LLMService(apiKeyProvider, { logLevel: "silent" });
  });

  function expectExtractable(response: LLMResponse): void {
    const choice = response.choices[0];
    const evidence = choice?.logprobs?.[0];
    expect(evidence).toBeDefined();

    const extraction = extractSingleTokenLabelProbs(
      [choice.message.content, "<mock-alternative-1>"],
      evidence!
    );

    expect(extraction).toMatchObject({
      status: "ok",
      absoluteLabelProbs: {
        [choice.message.content]: 0.7,
        "<mock-alternative-1>": 0.2,
      },
      ambiguousMass: 0,
    });
    expect(extraction.conditionalLabelProbs[choice.message.content]).toBeCloseTo(
      0.7 / 0.9
    );
    expect(extraction.conditionalLabelProbs["<mock-alternative-1>"]).toBeCloseTo(
      0.2 / 0.9
    );
    expect(extraction.residualMass).toBeCloseTo(0.1);
  }

  async function terminalResponse(
    events: AsyncIterable<{
      type: string;
      response?: LLMResponse;
    }>
  ): Promise<LLMResponse> {
    let response: LLMResponse | undefined;
    for await (const event of events) {
      if (event.type === "complete") {
        response = event.response;
      }
    }
    expect(response).toBeDefined();
    return response!;
  }

  it("preserves extractable evidence through complete and terminal stream responses", async () => {
    const complete = await service.sendMessage(request);
    expect(complete.object).toBe("chat.completion");
    expectExtractable(complete as LLMResponse);

    const streamed = await terminalResponse(service.streamMessage(request));
    expectExtractable(streamed);
  });

  it("preserves extractable evidence through prepared complete and stream calls", async () => {
    const completeHandle = await service.prepareMessage(request, { mode: "complete" });
    expect((completeHandle as LLMFailureResponse).object).not.toBe("error");
    const complete = await service.sendPrepared(
      completeHandle as PreparedCompleteCall
    );
    expect(complete.object).toBe("chat.completion");
    expectExtractable(complete as LLMResponse);

    const streamHandle = await service.prepareMessage(request, { mode: "stream" });
    expect((streamHandle as LLMFailureResponse).object).not.toBe("error");
    const streamed = await terminalResponse(
      service.streamPrepared(streamHandle as PreparedStreamCall)
    );
    expectExtractable(streamed);
  });

  it("rejects orphaned topLogprobs after final settings merge", async () => {
    const result = await service.validateRequestCapabilities({
      providerId: "mock",
      modelId: "mock-model",
      settings: { topLogprobs: 2 },
    });

    expect(result).toMatchObject({
      object: "error",
      valid: false,
      error: {
        code: "INVALID_SETTINGS",
        type: "validation_error",
        param: "settings.topLogprobs",
      },
    });
    expect(apiKeyProvider).not.toHaveBeenCalled();
  });

  it("accepts preset and request settings that jointly enable logprobs", async () => {
    const presetTopService = new LLMService(apiKeyProvider, {
      logLevel: "silent",
      presets: [{
        id: "mock-top",
        displayName: "Mock top logprobs",
        providerId: "openai",
        modelId: "gpt-4.1",
        settings: { topLogprobs: 2 },
      }],
    });
    const presetLogprobsService = new LLMService(apiKeyProvider, {
      logLevel: "silent",
      presets: [{
        id: "mock-logprobs",
        displayName: "Mock logprobs",
        providerId: "openai",
        modelId: "gpt-4.1",
        settings: { logprobs: true },
      }],
    });

    await expect(presetTopService.validateRequestCapabilities({
      presetId: "mock-top",
      settings: { logprobs: true },
    })).resolves.toMatchObject({ valid: true });
    await expect(presetLogprobsService.validateRequestCapabilities({
      presetId: "mock-logprobs",
      settings: { topLogprobs: 2 },
    })).resolves.toMatchObject({ valid: true });
  });

  it("rejects an explicit false override of preset-enabled logprobs", async () => {
    const presetService = new LLMService(apiKeyProvider, {
      logLevel: "silent",
      presets: [{
        id: "mock-logprobs-top",
        displayName: "Mock logprobs and top",
        providerId: "openai",
        modelId: "gpt-4.1",
        settings: { logprobs: true, topLogprobs: 2 },
      }],
    });

    const result = await presetService.validateRequestCapabilities({
      presetId: "mock-logprobs-top",
      settings: { logprobs: false },
    });

    expect(result).toMatchObject({
      object: "error",
      valid: false,
      error: { code: "INVALID_SETTINGS" },
    });
  });

  it("honors provider and model defaults before final validation", async () => {
    const priorProviderDefaults = PROVIDER_DEFAULT_SETTINGS.mock;
    const priorModelDefaults = MODEL_DEFAULT_SETTINGS["mock-model"];

    try {
      PROVIDER_DEFAULT_SETTINGS.mock = {
        ...priorProviderDefaults,
        logprobs: true,
      };
      await expect(service.validateRequestCapabilities({
        providerId: "mock",
        modelId: "mock-provider-default-model",
        settings: { topLogprobs: 2 },
      })).resolves.toMatchObject({ valid: true });

      if (priorProviderDefaults === undefined) {
        delete PROVIDER_DEFAULT_SETTINGS.mock;
      } else {
        PROVIDER_DEFAULT_SETTINGS.mock = priorProviderDefaults;
      }
      MODEL_DEFAULT_SETTINGS["mock-model"] = {
        ...priorModelDefaults,
        logprobs: true,
      };
      await expect(service.validateRequestCapabilities({
        providerId: "mock",
        modelId: "mock-model",
        settings: { topLogprobs: 2 },
      })).resolves.toMatchObject({ valid: true });
    } finally {
      if (priorProviderDefaults === undefined) {
        delete PROVIDER_DEFAULT_SETTINGS.mock;
      } else {
        PROVIDER_DEFAULT_SETTINGS.mock = priorProviderDefaults;
      }
      if (priorModelDefaults === undefined) {
        delete MODEL_DEFAULT_SETTINGS["mock-model"];
      } else {
        MODEL_DEFAULT_SETTINGS["mock-model"] = priorModelDefaults;
      }
    }
  });

  it("preserves template topLogprobs until another source enables logprobs", async () => {
    const created = await service.createMessages({
      template: `<META>
{
  "settings": { "topLogprobs": 2 }
}
</META>
<USER>Hello</USER>`,
    });

    expect(created.settings).toEqual({ topLogprobs: 2 });
    const result = await service.validateRequestCapabilities({
      providerId: "mock",
      modelId: "mock-model",
      settings: { ...created.settings, logprobs: true },
    });
    expect(result).toMatchObject({ valid: true });
  });
});
