/**
 * Table Storage tools:
 *   storage.tables.list
 *   storage.tables.get
 *   storage.tables.query
 */

import type { TableServiceClient, TableClient } from "@azure/data-tables";
import { clampPageSize, makePagedResult } from "./types.js";

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
}

export async function queryTable(
  tableClient: TableClient,
  input: QueryTableInput
) {
  const pageSize = clampPageSize(input.pageSize);

  const iter = tableClient.listEntities({
    queryOptions: {
      filter: input.filter ?? undefined,
      select: input.select ?? undefined,
    },
  });

  const page = iter.byPage({
    maxPageSize: pageSize,
    continuationToken: input.cursor ?? undefined,
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
