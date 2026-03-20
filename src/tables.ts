/**
 * Table Storage tools:
 *   storage.tables.list
 *   storage.tables.get
 *   storage.tables.query
 */

import type { TableServiceClient, TableClient } from "@azure/data-tables";
import { clampPageSize, makePagedResult, MAX_PAGE_SIZE } from "./types.js";

// ────────────────────────────────────────────────────────────
// list
// ────────────────────────────────────────────────────────────

export interface ListTablesInput {
  pageSize?: number;
  cursor?: string;
}

export async function listTables(
  client: TableServiceClient,
  input: ListTablesInput
) {
  const pageSize = clampPageSize(input.pageSize);
  const iter = client.listTables();
  const page = iter.byPage({
    maxPageSize: pageSize,
    continuationToken: input.cursor ?? undefined,
  });
  const result = await page.next();
  const segment = result.value;
  const items = (segment ?? []).map((t: { name?: string }) => ({
    name: t.name ?? "",
  }));
  // Azure Tables SDK returns the continuation token on the iterator result
  const nextCursor =
    (result as { continuationToken?: string }).continuationToken ?? null;
  return makePagedResult(items, pageSize, nextCursor);
}

// ────────────────────────────────────────────────────────────
// get (point read by PartitionKey + RowKey)
// ────────────────────────────────────────────────────────────

export interface GetEntityInput {
  table: string;
  partitionKey: string;
  rowKey: string;
  select?: string[];
}

export async function getEntity(
  tableClient: TableClient,
  input: GetEntityInput
) {
  const options = input.select?.length
    ? { queryOptions: { select: input.select } }
    : {};
  const entity = await tableClient.getEntity(
    input.partitionKey,
    input.rowKey,
    options
  );
  return sanitizeEntity(entity);
}

// ────────────────────────────────────────────────────────────
// query (OData filter)
// ────────────────────────────────────────────────────────────

export interface QueryTableInput {
  table: string;
  filter?: string;
  select?: string[];
  pageSize?: number;
  cursor?: string;
  skip?: number;
}

export async function queryTable(
  tableClient: TableClient,
  input: QueryTableInput
) {
  const pageSize = clampPageSize(input.pageSize);
  const skipCount = Math.max(0, Math.floor(input.skip ?? 0));

  let currentCursor = input.cursor ?? undefined;

  // Client-side skip: Azure Table Storage does not support OData $skip natively.
  // Consume pages of entities until skipCount items have been passed over.
  if (skipCount > 0) {
    let totalSkipped = 0;
    while (totalSkipped < skipCount) {
      const batchSize = Math.min(skipCount - totalSkipped, MAX_PAGE_SIZE);
      const skipIter = tableClient.listEntities({
        queryOptions: {
          filter: input.filter ?? undefined,
          select: ["PartitionKey", "RowKey"],
        },
      });
      const skipPage = skipIter.byPage({
        maxPageSize: batchSize,
        continuationToken: currentCursor,
      });
      const skipResult = await skipPage.next();
      const skippedItems: unknown[] = Array.isArray(skipResult.value)
        ? skipResult.value
        : [];
      totalSkipped += skippedItems.length;
      currentCursor =
        (skipResult as { continuationToken?: string }).continuationToken ??
        undefined;
      if (skippedItems.length < batchSize || !currentCursor) break;
    }
  }

  const iter = tableClient.listEntities({
    queryOptions: {
      filter: input.filter ?? undefined,
      select: input.select ?? undefined,
    },
  });

  const page = iter.byPage({
    maxPageSize: pageSize,
    continuationToken: currentCursor,
  });
  const result = await page.next();
  const segment: Record<string, unknown>[] = Array.isArray(result.value) ? result.value : [];
  const nextCursor =
    (result as { continuationToken?: string }).continuationToken ?? null;
  const items = segment.map(sanitizeEntity);
  return makePagedResult(items, pageSize, nextCursor);
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function sanitizeEntity(entity: Record<string, unknown>): Record<string, unknown> {
  // Remove Azure SDK internal metadata fields, keep user data
  const {
    etag: _etag,
    "odata.metadata": _meta,
    ...rest
  } = entity as Record<string, unknown>;
  return rest;
}
