import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { createRequire } from 'node:module';
import type { FormatsPlugin } from 'ajv-formats';

const addFormats = createRequire(import.meta.url)('ajv-formats') as FormatsPlugin;
const schema = JSON.parse(readFileSync(new URL('../../../contracts/v1/schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ coerceTypes: false, removeAdditional: false, useDefaults: false, strict: false });
addFormats(ajv);
ajv.addSchema(schema);
export type Row = Record<string, unknown>;
// Tool discovery reuses the Command payload schema rather than a second model.
export function payloadSchema(operation: string): Row {
  function inline(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(inline);
    if (value && typeof value === 'object') {
      const row = value as Row;
      if (typeof row.$ref === 'string') {
        const name = row.$ref.replace('#/$defs/', '');
        if (row.$ref !== `#/$defs/${name}` || !schema.$defs[name]) throw new Error('Unsupported schema reference');
        return inline(schema.$defs[name]);
      }
      return Object.fromEntries(Object.entries(row).map(([key, item]) => [key, inline(item)]));
    }
    return value;
  }
  for (const branch of schema.$defs.Command.allOf) {
    if (branch.if.properties.operation.const === operation) return inline(branch.then.properties.payload) as Row;
  }
  throw new Error('Unknown command operation');
}
export const validates = (name: string, value: unknown): boolean => {
  const validator = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!validator) throw new Error('Unknown contract');
  return Boolean(validator(value));
};
export interface Command {
  request_id: string;
  operation: string;
  payload: { evidence_id?: string; status?: string; limit?: number; cursor?: string };
}
