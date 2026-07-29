import type {
  PreparedCallMode,
  PreparedProviderMessageView,
  PreparedProviderRequestView,
  PreparedRequestValue,
  PreparedStructuredOutputView,
  StructuredOutputSettings,
} from "../types";
import type { InternalLLMChatRequest } from "./types";

export const PROMPT_STRUCTURED_OUTPUT_REVISION = "prompt-schema-v1";

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

/** Recursively freezes an adapter-owned plain request graph. */
export function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

/** Clones and freezes a provider payload so SDK mutation cannot affect redispatch. */
export function freezeProviderRequest<T>(value: T): T {
  return deepFreeze(cloneValue(value));
}

/** Converts provider-owned data into a detached JSON-safe library value. */
export function toPreparedRequestValue(
  value: unknown
): PreparedRequestValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map(toPreparedRequestValue)
      .filter((item): item is PreparedRequestValue => item !== undefined);
  }
  if (typeof value === "object") {
    const result: Record<string, PreparedRequestValue> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>
    )) {
      const converted = toPreparedRequestValue(child);
      if (converted !== undefined) {
        result[key] = converted;
      }
    }
    return result;
  }
  return undefined;
}

function normalizeMessages(value: unknown): PreparedProviderMessageView[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((message) => {
    const record =
      message && typeof message === "object"
        ? (message as Record<string, unknown>)
        : {};
    const content =
      toPreparedRequestValue(record.content ?? record.parts ?? "") ?? "";
    return {
      role: String(record.role ?? "unknown"),
      content,
    };
  });
}

function structuredOutputView(
  settings: StructuredOutputSettings | undefined,
  payload: Record<string, unknown>
): PreparedStructuredOutputView | undefined {
  if (!settings?.schema || settings.enabled === false) {
    return undefined;
  }
  const delivery = settings.delivery ?? "native";
  if (delivery === "prompt") {
    return {
      delivery,
      enforcement: "instruction_only",
      name: settings.name,
      schema: toPreparedRequestValue(settings.schema) ?? {},
      promptRevision: PROMPT_STRUCTURED_OUTPUT_REVISION,
    };
  }

  const responseFormat = payload.response_format as
    | Record<string, unknown>
    | undefined;
  const jsonSchema = responseFormat?.json_schema as
    | Record<string, unknown>
    | undefined;
  const outputConfig = payload.output_config as
    | Record<string, unknown>
    | undefined;
  const outputFormat = outputConfig?.format as
    | Record<string, unknown>
    | undefined;
  const config = payload.config as Record<string, unknown> | undefined;
  const nativeSchema =
    jsonSchema?.schema ??
    responseFormat?.schema ??
    outputFormat?.schema ??
    config?.responseSchema;
  const nativeName =
    typeof jsonSchema?.name === "string" ? jsonSchema.name : undefined;
  return {
    delivery,
    enforcement: nativeSchema === undefined ? "json_only" : "provider",
    ...(nativeName !== undefined && { name: nativeName }),
    ...(nativeSchema !== undefined && {
      schema: toPreparedRequestValue(nativeSchema) ?? {},
    }),
  };
}

export interface PreparedViewOptions {
  operation: string;
  mode: PreparedCallMode;
  payload: Record<string, unknown>;
  structuredOutput?: StructuredOutputSettings;
  messageField?: string;
  systemField?: string;
  reasoningField?: string;
  extensionFields?: readonly string[];
}

/** Builds the stable inspection view from the same canonical provider payload. */
export function createPreparedRequestView(
  options: PreparedViewOptions
): PreparedProviderRequestView {
  const messageField = options.messageField ?? "messages";
  const systemField = options.systemField ?? "system";
  const excluded = new Set([
    messageField,
    systemField,
    options.reasoningField,
    ...(options.extensionFields ?? []),
  ].filter((field): field is string => field !== undefined));
  const settings: Record<string, PreparedRequestValue> = {};
  for (const [key, value] of Object.entries(options.payload)) {
    if (excluded.has(key)) {
      continue;
    }
    const converted = toPreparedRequestValue(value);
    if (converted !== undefined) {
      settings[key] = converted;
    }
  }

  const extensions: Record<string, PreparedRequestValue> = {};
  for (const field of options.extensionFields ?? []) {
    const converted = toPreparedRequestValue(options.payload[field]);
    if (converted !== undefined) {
      extensions[field] = converted;
    }
  }

  const systemInstruction = toPreparedRequestValue(
    options.payload[systemField]
  );
  const reasoning = options.reasoningField
    ? toPreparedRequestValue(options.payload[options.reasoningField])
    : undefined;

  return deepFreeze({
    operation: options.operation,
    mode: options.mode,
    messages: normalizeMessages(options.payload[messageField]),
    ...(systemInstruction !== undefined && { systemInstruction }),
    ...(structuredOutputView(options.structuredOutput, options.payload) && {
      structuredOutput: structuredOutputView(
        options.structuredOutput,
        options.payload
      ),
    }),
    ...(reasoning !== undefined && { reasoning }),
    settings,
    ...(Object.keys(extensions).length > 0 && { extensions }),
  });
}

/** Deterministic instruction used for explicit prompt-delivered structured output. */
export function createPromptStructuredOutputInstruction(
  settings: StructuredOutputSettings
): string {
  return [
    `<GENAI_LITE_STRUCTURED_OUTPUT revision="${PROMPT_STRUCTURED_OUTPUT_REVISION}" name="${settings.name}">`,
    "Return only valid JSON matching this schema. Do not include markdown fences or commentary.",
    JSON.stringify(settings.schema),
    "</GENAI_LITE_STRUCTURED_OUTPUT>",
  ].join("\n");
}

/**
 * Injects explicit prompt-delivered schema guidance before provider formatting.
 *
 * Native delivery is untouched. The final user message is extended when one
 * exists; otherwise a user message is appended so provider role alternation
 * remains the adapter's responsibility.
 */
export function applyPromptStructuredOutput(
  request: InternalLLMChatRequest
): InternalLLMChatRequest {
  const structuredOutput = request.settings.structuredOutput;
  if (
    !structuredOutput?.schema ||
    structuredOutput.enabled === false ||
    structuredOutput.delivery !== "prompt"
  ) {
    return request;
  }

  const messages = request.messages.map((message) => ({ ...message }));
  const instruction = createPromptStructuredOutputInstruction(structuredOutput);
  if (messages.some((message) => message.content.includes(instruction))) {
    return request;
  }
  let targetIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      targetIndex = index;
      break;
    }
  }

  if (targetIndex >= 0) {
    messages[targetIndex].content =
      `${messages[targetIndex].content}\n\n${instruction}`;
  } else {
    messages.push({ role: "user", content: instruction });
  }

  return {
    ...request,
    messages,
  };
}
