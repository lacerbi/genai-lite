import { applyStrictSchemaConstraints } from './schemaUtils';

describe('applyStrictSchemaConstraints', () => {
  it('sets additionalProperties: false on the root object schema', () => {
    const result = applyStrictSchemaConstraints({
      type: 'object',
      properties: { name: { type: 'string' } }
    }) as any;

    expect(result.additionalProperties).toBe(false);
  });

  it('does not mutate the input schema', () => {
    const input: any = {
      type: 'object',
      properties: { nested: { type: 'object', properties: { a: { type: 'string' } } } }
    };

    applyStrictSchemaConstraints(input);

    expect(input).not.toHaveProperty('additionalProperties');
    expect(input.properties.nested).not.toHaveProperty('additionalProperties');
  });

  it('traverses nested properties and array items', () => {
    const result = applyStrictSchemaConstraints({
      type: 'object',
      properties: {
        person: { type: 'object', properties: { name: { type: 'string' } } },
        tags: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' } } } }
      }
    }) as any;

    expect(result.properties.person.additionalProperties).toBe(false);
    expect(result.properties.tags.items.additionalProperties).toBe(false);
    // Arrays are not objects, so they get no additionalProperties of their own.
    expect(result.properties.tags).not.toHaveProperty('additionalProperties');
  });

  it('traverses tuple-form items and prefixItems', () => {
    const result = applyStrictSchemaConstraints({
      type: 'object',
      properties: {
        pair: {
          type: 'array',
          items: [
            { type: 'object', properties: { a: { type: 'string' } } },
            { type: 'object', properties: { b: { type: 'string' } } }
          ],
          prefixItems: [{ type: 'object', properties: { c: { type: 'string' } } }]
        }
      }
    }) as any;

    expect(result.properties.pair.items[0].additionalProperties).toBe(false);
    expect(result.properties.pair.items[1].additionalProperties).toBe(false);
    expect(result.properties.pair.prefixItems[0].additionalProperties).toBe(false);
  });

  // These are the branches the pre-0.13.1 walker silently skipped, which is what
  // ISSUE-structured-output-schema-traversal.md was filed for.
  it('traverses $defs and definitions', () => {
    const result = applyStrictSchemaConstraints({
      type: 'object',
      properties: { home: { $ref: '#/$defs/Address' } },
      $defs: {
        Address: { type: 'object', properties: { city: { type: 'string' } } }
      },
      definitions: {
        Legacy: { type: 'object', properties: { code: { type: 'string' } } }
      }
    }) as any;

    expect(result.$defs.Address.additionalProperties).toBe(false);
    expect(result.definitions.Legacy.additionalProperties).toBe(false);
    // $ref pointers are left untouched - the target is constrained where defined.
    expect(result.properties.home).toEqual({ $ref: '#/$defs/Address' });
  });

  it('traverses anyOf, oneOf, and allOf branches', () => {
    const result = applyStrictSchemaConstraints({
      type: 'object',
      properties: {
        choice: { anyOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'null' }] },
        either: { oneOf: [{ type: 'object', properties: { b: { type: 'string' } } }] },
        both: { allOf: [{ type: 'object', properties: { c: { type: 'string' } } }] }
      }
    }) as any;

    expect(result.properties.choice.anyOf[0].additionalProperties).toBe(false);
    expect(result.properties.choice.anyOf[1]).toEqual({ type: 'null' });
    expect(result.properties.either.oneOf[0].additionalProperties).toBe(false);
    expect(result.properties.both.allOf[0].additionalProperties).toBe(false);
  });

  it('traverses composition keywords on a root schema with no type', () => {
    const result = applyStrictSchemaConstraints({
      anyOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'string' } } }
      ]
    }) as any;

    expect(result.anyOf[0].additionalProperties).toBe(false);
    expect(result.anyOf[1].additionalProperties).toBe(false);
  });

  it('traverses not', () => {
    const result = applyStrictSchemaConstraints({
      type: 'object',
      properties: {},
      not: { type: 'object', properties: { forbidden: { type: 'string' } } }
    }) as any;

    expect(result.not.additionalProperties).toBe(false);
  });

  it('terminates on a cyclic schema graph and reuses the copy', () => {
    const cyclic: any = { type: 'object', properties: {} };
    cyclic.properties.self = cyclic;

    const result = applyStrictSchemaConstraints(cyclic) as any;

    expect(result.additionalProperties).toBe(false);
    // The cycle resolves to the same processed node rather than recursing forever.
    expect(result.properties.self).toBe(result);
  });

  it('reuses one copy for a subschema referenced from two places', () => {
    const shared: any = { type: 'object', properties: { a: { type: 'string' } } };
    const result = applyStrictSchemaConstraints({
      type: 'object',
      properties: { first: shared, second: shared }
    }) as any;

    expect(result.properties.first.additionalProperties).toBe(false);
    expect(result.properties.first).toBe(result.properties.second);
  });

  it('passes through non-object input unchanged', () => {
    expect(applyStrictSchemaConstraints(null as any)).toBeNull();
    expect(applyStrictSchemaConstraints('nope' as any)).toBe('nope');
    expect(applyStrictSchemaConstraints(undefined as any)).toBeUndefined();
  });

  describe('requireAllProperties (OpenAI strict mode)', () => {
    it('rewrites required to every property, at every depth', () => {
      const result = applyStrictSchemaConstraints(
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'integer' },
            nested: {
              type: 'object',
              properties: { x: { type: 'string' }, y: { type: 'string' } },
              required: ['x']
            }
          },
          required: ['name']
        },
        { requireAllProperties: true }
      ) as any;

      expect(result.required).toEqual(['name', 'age', 'nested']);
      expect(result.properties.nested.required).toEqual(['x', 'y']);
    });

    it('also applies inside $defs and composition branches', () => {
      const result = applyStrictSchemaConstraints(
        {
          type: 'object',
          properties: { home: { $ref: '#/$defs/Address' } },
          $defs: {
            Address: {
              type: 'object',
              properties: { city: { type: 'string' }, zip: { type: 'string' } },
              required: ['city']
            }
          }
        },
        { requireAllProperties: true }
      ) as any;

      expect(result.$defs.Address.required).toEqual(['city', 'zip']);
    });

    it('leaves required alone when the option is off', () => {
      const result = applyStrictSchemaConstraints({
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'integer' } },
        required: ['name']
      }) as any;

      expect(result.required).toEqual(['name']);
    });

    it('does not invent required on an object with no properties', () => {
      const result = applyStrictSchemaConstraints(
        { type: 'object' },
        { requireAllProperties: true }
      ) as any;

      expect(result).not.toHaveProperty('required');
      expect(result.additionalProperties).toBe(false);
    });
  });
});
