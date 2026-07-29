import { createLlamaCppStateBinding } from "./llamaCppState";

const props = {
  model_alias: "C:\\private\\models\\model.gguf",
  model_path: "C:\\private\\models\\model.gguf",
  chat_template: "{{ messages }}",
  chat_template_caps: { supports_system_role: true },
  bos_token: "<bos>",
  eos_token: "<eos>",
  build_info: { build: 123, commit: "abc" },
};

const models = {
  object: "list",
  data: [
    {
      id: "C:\\private\\models\\model.gguf",
      meta: { n_ctx: 4096, n_vocab: 1000 },
    },
  ],
};

describe("llama.cpp observable state binding", () => {
  it("is canonical, deterministic, and does not expose absolute paths", () => {
    const first = createLlamaCppStateBinding(props, models)!;
    const reordered = createLlamaCppStateBinding(
      {
        ...props,
        build_info: { commit: "abc", build: 123 },
      },
      models
    )!;
    expect(first).toEqual(reordered);
    expect(JSON.stringify(first)).not.toContain("C:\\private");
    expect(first.metadata.model).toBe("model.gguf");
  });

  it.each([
    ["template", { ...props, chat_template: "{{ changed }}" }, models],
    [
      "build",
      { ...props, build_info: { build: 124, commit: "abc" } },
      models,
    ],
    [
      "model",
      { ...props, model_path: "D:\\models\\other.gguf" },
      {
        ...models,
        data: [{ ...models.data[0], id: "D:\\models\\other.gguf" }],
      },
    ],
  ])("changes when observable %s state changes", (_, nextProps, nextModels) => {
    const before = createLlamaCppStateBinding(props, models)!;
    const after = createLlamaCppStateBinding(nextProps, nextModels)!;
    expect(after.serverStateFingerprint).not.toBe(
      before.serverStateFingerprint
    );
  });

  it("is unavailable when required observable fields are absent", () => {
    expect(
      createLlamaCppStateBinding(
        { ...props, chat_template: undefined },
        models
      )
    ).toBeUndefined();
  });

  it("distinguishes full model identities with the same basename", () => {
    const first = createLlamaCppStateBinding(
      { ...props, model_path: "C:\\models\\model.gguf" },
      models
    )!;
    const second = createLlamaCppStateBinding(
      { ...props, model_path: "D:\\other\\model.gguf" },
      models
    )!;

    expect(first.metadata.model).toBe(second.metadata.model);
    expect(first.serverStateFingerprint).not.toBe(
      second.serverStateFingerprint
    );
    expect(JSON.stringify(second)).not.toContain("D:\\other");
  });

  it("selects the requested router model independent of list order", () => {
    const routerModels = {
      object: "list",
      data: [
        { id: "first.gguf", meta: { n_ctx: 2048 } },
        { id: "selected.gguf", meta: { n_ctx: 8192 } },
      ],
    };
    const reversed = {
      ...routerModels,
      data: [...routerModels.data].reverse(),
    };
    const selectedProps = {
      ...props,
      model_alias: "selected.gguf",
      model_path: "C:\\models\\selected.gguf",
    };

    expect(
      createLlamaCppStateBinding(
        selectedProps,
        routerModels,
        "selected.gguf"
      )
    ).toEqual(
      createLlamaCppStateBinding(
        selectedProps,
        reversed,
        "selected.gguf"
      )
    );
    expect(
      createLlamaCppStateBinding(
        selectedProps,
        routerModels,
        "missing.gguf"
      )
    ).toBeUndefined();
  });
});
