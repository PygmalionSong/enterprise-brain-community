// An installed read tool using the foundation's actual contract. / 复用基座实际合同的已安装读取工具。
import { z } from 'zod';
import type { Actor } from '../../src/identity/service.ts';
import type { GraphTool } from '../../src/runtime/graph-contracts.ts';
import { graphResultSchema } from '../../src/runtime/graph-contracts.ts';

const argsSchema = z.object({ sku: z.string().regex(/^[A-Z0-9-]{1,40}$/) }).strict();
const snapshotSchema = z.object({
  onHandCases: z.number().int().nonnegative(),
  observedAt: z.iso.datetime(),
  documentId: z.string().min(1).max(120),
}).strict();

export interface InventorySource {
  capture(actor: Actor, sku: string, reference: string): Promise<unknown>;
  original(actor: Actor, sku: string, reference: string): Promise<unknown | null>;
}

export function inventoryTool(
  source: InventorySource,
  authorize: (actor: Actor) => Promise<void>,
): GraphTool {
  if (typeof authorize !== 'function') throw Error('authorizer_required');

  async function read(
    actor: Actor,
    input: Record<string, unknown>,
    reference: string,
    signal: AbortSignal,
    lookup: boolean,
  ) {
    const args = argsSchema.parse(input);
    z.uuid().parse(reference);
    await authorize(actor);
    signal.throwIfAborted();
    const raw = lookup
      ? await source.original(actor, args.sku, reference)
      : await source.capture(actor, args.sku, reference);
    signal.throwIfAborted();
    const snapshot = raw === null ? null : snapshotSchema.parse(raw);
    return graphResultSchema.parse({
      reference,
      state: snapshot ? 'completed' : 'missing',
      receiptRef: snapshot?.documentId ?? null,
      sourceRevision: snapshot ? 'inventory-fixture-v1' : null,
      data: snapshot ? { sku: args.sku, ...snapshot } : {},
    });
  }

  return {
    id: 'inventory.snapshot.read',
    version: 'v1',
    effect: 'read',
    inputSchema: {
      type: 'object',
      properties: { sku: { type: 'string', pattern: '^[A-Z0-9-]{1,40}$' } },
      required: ['sku'],
      additionalProperties: false,
    },
    validate: input => argsSchema.parse(input),
    authorize: actor => authorize(actor),
    submit: (actor, args, ref, signal) => read(actor, args, ref, signal, false),
    lookup: (actor, args, ref, signal) => read(actor, args, ref, signal, true),
  };
}
