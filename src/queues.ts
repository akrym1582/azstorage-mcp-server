/**
 * Queue Storage tools:
 *   storage.queues.list
 *   storage.queues.peek
 */

import type { QueueServiceClient } from "@azure/storage-queue";
import { clampPageSize, makePagedResult } from "./types.js";

const MAX_PREVIEW_CHARS = 256;
const MAX_PEEK_MESSAGES = 32;

// ────────────────────────────────────────────────────────────
// list
// ────────────────────────────────────────────────────────────

export interface ListQueuesInput {
  prefix?: string;
  pageSize?: number;
  cursor?: string;
}

export async function listQueues(
  client: QueueServiceClient,
  input: ListQueuesInput
) {
  const pageSize = clampPageSize(input.pageSize);
  const iter = client.listQueues({ prefix: input.prefix ?? undefined });
  const page = iter.byPage({
    maxPageSize: pageSize,
    continuationToken: input.cursor ?? undefined,
  });
  const result = await page.next();
  const segment = result.value;
  const items = (segment.queueItems ?? []).map(
    (q: { name: string; metadata?: Record<string, string> }) => ({
      name: q.name,
    })
  );
  return makePagedResult(items, pageSize, segment.continuationToken);
}

// ────────────────────────────────────────────────────────────
// peek (read-only, does not change visibility)
// ────────────────────────────────────────────────────────────

export interface PeekQueueInput {
  queue: string;
  maxMessages?: number;
}

export async function peekQueue(
  client: QueueServiceClient,
  input: PeekQueueInput
) {
  const maxMessages = Math.min(
    input.maxMessages ?? 10,
    MAX_PEEK_MESSAGES
  );
  const queueClient = client.getQueueClient(input.queue);
  const response = await queueClient.peekMessages({ numberOfMessages: maxMessages });

  const items = response.peekedMessageItems.map((m) => {
    const body = m.messageText ?? "";
    const truncated = body.length > MAX_PREVIEW_CHARS;
    return {
      messageId: m.messageId,
      insertionTime: m.insertedOn?.toISOString() ?? null,
      expiresOn: m.expiresOn?.toISOString() ?? null,
      dequeueCount: m.dequeueCount,
      preview: truncated ? body.slice(0, MAX_PREVIEW_CHARS) + "…" : body,
      truncated,
    };
  });

  return {
    items,
    summary: { returned: items.length },
  };
}
