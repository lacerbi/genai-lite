import { createHash } from "node:crypto";
import type {
  LlamaCppModelsResponse,
  LlamaCppPropsResponse,
} from "./LlamaCppServerClient";

export interface LlamaCppStateBinding {
  serverStateFingerprint: string;
  chatTemplateFingerprint: string;
  metadata: {
    model: string;
    modelAlias?: string;
    buildInfo: string;
  };
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

/** Selects the observable model addressed by a router-mode request. */
export function selectLlamaCppModel(
  models: LlamaCppModelsResponse,
  selectedModel?: string
): LlamaCppModelsResponse["data"][number] | undefined {
  if (!selectedModel) {
    return models.data.length === 1 ? models.data[0] : undefined;
  }
  const selectedBasename = basename(selectedModel);
  const matches = models.data.filter((model) => {
    const candidates = [model.id, ...(model.aliases ?? [])];
    return candidates.some(
      (candidate) =>
        candidate === selectedModel ||
        basename(candidate) === selectedBasename
    );
  });
  if (matches.length === 1) {
    return matches[0];
  }
  return models.data.length === 1 ? models.data[0] : undefined;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = canonicalize(
        (value as Record<string, unknown>)[key]
      );
    }
    return result;
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Creates a privacy-preserving binding over observable model/server/template
 * state. Absolute local model paths never leave this helper.
 */
export function createLlamaCppStateBinding(
  props: LlamaCppPropsResponse,
  models: LlamaCppModelsResponse,
  selectedModel?: string
): LlamaCppStateBinding | undefined {
  const model = selectLlamaCppModel(models, selectedModel);
  if (
    !model?.id ||
    typeof props.chat_template !== "string" ||
    props.build_info === undefined
  ) {
    return undefined;
  }

  const observableModelIdentity =
    typeof props.model_path === "string" ? props.model_path : model.id;
  const modelName = basename(observableModelIdentity);
  const modelAlias =
    typeof props.model_alias === "string"
      ? basename(props.model_alias)
      : undefined;
  const buildInfo = stableJson(props.build_info);
  const chatTemplateFingerprint = sha256(props.chat_template);
  const observable = {
    model: modelName,
    modelIdentityFingerprint: sha256(
      observableModelIdentity.replace(/\\/g, "/")
    ),
    modelAlias,
    modelMeta: model.meta,
    buildInfo: props.build_info,
    chatTemplate: props.chat_template,
    chatTemplateCaps: props.chat_template_caps,
    bosToken: props.bos_token,
    eosToken: props.eos_token,
  };

  return {
    serverStateFingerprint: sha256(stableJson(observable)),
    chatTemplateFingerprint,
    metadata: {
      model: modelName,
      ...(modelAlias && { modelAlias }),
      buildInfo,
    },
  };
}
