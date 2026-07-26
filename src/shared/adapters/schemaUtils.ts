// AI Summary: Shared JSON Schema preparation for providers whose strict
// structured-output mode requires additionalProperties: false on every object
// schema. Traverses properties, items (incl. tuple form), $defs/definitions,
// anyOf/oneOf/allOf, prefixItems and not, and is safe against cyclic input.

/** Keywords whose value is a map of name -> subschema. */
const SUBSCHEMA_MAPS = ["properties", "$defs", "definitions"] as const;

/** Keywords whose value is an array of subschemas. */
const SUBSCHEMA_ARRAYS = ["anyOf", "oneOf", "allOf", "prefixItems"] as const;

export interface StrictSchemaOptions {
  /**
   * When true, every object schema's `required` is rewritten to list all of its
   * properties. OpenAI's strict mode demands this; Anthropic's does not.
   *
   * @default false
   */
  requireAllProperties?: boolean;
}

/**
 * Returns a deep copy of `schema` with `additionalProperties: false` set on every
 * object schema, as required by OpenAI's and Anthropic's strict structured-output
 * modes.
 *
 * The input is never mutated.
 *
 * Traversal covers `properties`, `items` (single or tuple form), `prefixItems`,
 * `$defs`, `definitions`, `anyOf`, `oneOf`, `allOf`, and `not`. Note that `$ref`
 * pointers are **not** resolved — they are left as-is, and the schemas they point
 * at are constrained where they are *defined* (typically under `$defs`), which is
 * what the providers validate. Both providers reject genuinely recursive schemas
 * anyway, so resolving refs would buy nothing.
 *
 * Cyclic *JavaScript* object graphs (a schema object reachable from itself) are
 * handled: each input node is copied at most once and revisits reuse that copy,
 * so the walk terminates and shared subschemas stay shared.
 *
 * @param schema - The JSON schema to process
 * @param options - Provider-specific strictness tweaks
 * @returns A new schema with strict-mode constraints applied
 */
export function applyStrictSchemaConstraints<T>(
  schema: T,
  options: StrictSchemaOptions = {}
): T {
  return walk(schema, options, new Map<object, unknown>()) as T;
}

function walk(
  node: unknown,
  options: StrictSchemaOptions,
  seen: Map<object, unknown>
): unknown {
  if (!node || typeof node !== "object") {
    return node;
  }

  const cached = seen.get(node);
  if (cached !== undefined) {
    return cached;
  }

  if (Array.isArray(node)) {
    const copy: unknown[] = [];
    seen.set(node, copy);
    for (const entry of node) {
      copy.push(walk(entry, options, seen));
    }
    return copy;
  }

  const source = node as Record<string, unknown>;
  const processed: Record<string, unknown> = { ...source };
  // Registered before recursing so a cycle resolves to this same object.
  seen.set(node, processed);

  if (source.type === "object") {
    processed.additionalProperties = false;

    const properties = source.properties;
    if (options.requireAllProperties && properties && typeof properties === "object") {
      processed.required = Object.keys(properties as Record<string, unknown>);
    }
  }

  for (const key of SUBSCHEMA_MAPS) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const out: Record<string, unknown> = {};
      for (const [name, subschema] of Object.entries(value as Record<string, unknown>)) {
        out[name] = walk(subschema, options, seen);
      }
      processed[key] = out;
    }
  }

  for (const key of SUBSCHEMA_ARRAYS) {
    const value = source[key];
    if (Array.isArray(value)) {
      processed[key] = value.map((subschema) => walk(subschema, options, seen));
    }
  }

  if (source.items !== undefined) {
    processed.items = walk(source.items, options, seen);
  }

  if (source.not !== undefined) {
    processed.not = walk(source.not, options, seen);
  }

  return processed;
}
