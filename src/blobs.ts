/**
 * Blob Storage tools:
 *   storage.blobs.listContainers
 *   storage.blobs.listFlat
 *   storage.blobs.listTree
 *   storage.blobs.read
 *   storage.blobs.download
 */

import type { BlobServiceClient } from "@azure/storage-blob";
import {
  clampPageSize,
  makePagedResult,
  MAX_TEXT_INLINE_BYTES,
} from "./types.js";

// ────────────────────────────────────────────────────────────
// listContainers
// ────────────────────────────────────────────────────────────

export interface ListContainersInput {
  prefix?: string;
  pageSize?: number;
  cursor?: string;
}

export async function listContainers(
  client: BlobServiceClient,
  input: ListContainersInput
) {
  const pageSize = clampPageSize(input.pageSize);
  const iter = client.listContainers({ prefix: input.prefix ?? undefined });
  const page = iter.byPage({
    maxPageSize: pageSize,
    continuationToken: input.cursor ?? undefined,
  });
  const result = await page.next();
  const segment = result.value;
  const items = (segment.containerItems ?? []).map(
    (c: { name: string; properties: { lastModified: Date; etag: string } }) => ({
      name: c.name,
      lastModified: c.properties.lastModified?.toISOString() ?? null,
      etag: c.properties.etag ?? null,
    })
  );
  return makePagedResult(items, pageSize, segment.continuationToken);
}

// ────────────────────────────────────────────────────────────
// listFlat
// ────────────────────────────────────────────────────────────

export interface ListFlatInput {
  container: string;
  prefix?: string;
  pageSize?: number;
  cursor?: string;
}

export async function listFlat(
  client: BlobServiceClient,
  input: ListFlatInput
) {
  const pageSize = clampPageSize(input.pageSize);
  const containerClient = client.getContainerClient(input.container);
  const iter = containerClient.listBlobsFlat({ prefix: input.prefix ?? undefined });
  const page = iter.byPage({
    maxPageSize: pageSize,
    continuationToken: input.cursor ?? undefined,
  });
  const result = await page.next();
  const segment = result.value;
  const items = (segment.segment.blobItems ?? []).map(
    (b: {
      name: string;
      properties: {
        contentLength?: number;
        lastModified: Date;
        etag: string;
        contentType?: string;
      };
    }) => ({
      name: b.name,
      kind: "blob" as const,
      size: b.properties.contentLength ?? null,
      lastModified: b.properties.lastModified?.toISOString() ?? null,
      etag: b.properties.etag ?? null,
      contentType: b.properties.contentType ?? null,
    })
  );
  return makePagedResult(items, pageSize, segment.continuationToken);
}

// ────────────────────────────────────────────────────────────
// listTree (hierarchical with virtual directories)
// ────────────────────────────────────────────────────────────

export interface ListTreeInput {
  container: string;
  prefix?: string;
  delimiter?: string;
  pageSize?: number;
  cursor?: string;
}

export async function listTree(
  client: BlobServiceClient,
  input: ListTreeInput
) {
  const pageSize = clampPageSize(input.pageSize);
  const delimiter = input.delimiter ?? "/";
  const containerClient = client.getContainerClient(input.container);
  const iter = containerClient.listBlobsByHierarchy(delimiter, {
    prefix: input.prefix ?? undefined,
  });
  const page = iter.byPage({
    maxPageSize: pageSize,
    continuationToken: input.cursor ?? undefined,
  });
  const result = await page.next();
  const segment = result.value;

  const prefixes = (segment.segment.blobPrefixes ?? []).map(
    (p: { name: string }) => ({ name: p.name, kind: "prefix" as const })
  );
  const blobs = (segment.segment.blobItems ?? []).map(
    (b: {
      name: string;
      properties: {
        contentLength?: number;
        lastModified: Date;
        etag: string;
        contentType?: string;
      };
    }) => ({
      name: b.name,
      kind: "blob" as const,
      size: b.properties.contentLength ?? null,
      lastModified: b.properties.lastModified?.toISOString() ?? null,
      etag: b.properties.etag ?? null,
      contentType: b.properties.contentType ?? null,
    })
  );

  return makePagedResult(
    [...prefixes, ...blobs],
    pageSize,
    segment.continuationToken
  );
}

// ────────────────────────────────────────────────────────────
// read (inline text for small blobs)
// ────────────────────────────────────────────────────────────

export interface ReadBlobInput {
  container: string;
  blob: string;
  maxBytes?: number;
  skipBytes?: number;
}

export async function readBlob(
  client: BlobServiceClient,
  input: ReadBlobInput
) {
  const maxBytes = Math.min(
    input.maxBytes ?? MAX_TEXT_INLINE_BYTES,
    MAX_TEXT_INLINE_BYTES
  );
  const blobClient = client
    .getContainerClient(input.container)
    .getBlobClient(input.blob);

  const props = await blobClient.getProperties();
  const size = props.contentLength ?? 0;
  const contentType = props.contentType ?? "application/octet-stream";
  const isText =
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType.includes("yaml");

  const offset = Math.min(Math.max(0, input.skipBytes ?? 0), size);
  const remainingBytes = size - offset;

  if (!isText || remainingBytes > maxBytes) {
    return {
      name: input.blob,
      size,
      contentType,
      lastModified: props.lastModified?.toISOString() ?? null,
      etag: props.etag ?? null,
      metadata: props.metadata ?? {},
      content: null,
      truncated: false,
      hint: "Use storage.blobs.download to retrieve binary or large content.",
    };
  }

  const downloadResponse = await blobClient.download(offset, maxBytes);
  const chunks: Buffer[] = [];
  for await (const chunk of downloadResponse.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf-8");

  return {
    name: input.blob,
    size,
    contentType,
    lastModified: props.lastModified?.toISOString() ?? null,
    etag: props.etag ?? null,
    metadata: props.metadata ?? {},
    content: text,
    truncated: text.length === maxBytes && remainingBytes > maxBytes,
    hint: null,
  };
}

// ────────────────────────────────────────────────────────────
// download (returns base64 chunk + metadata)
// ────────────────────────────────────────────────────────────

export interface DownloadBlobInput {
  container: string;
  blob: string;
  offset?: number;
  length?: number;
}

export async function downloadBlob(
  client: BlobServiceClient,
  input: DownloadBlobInput
) {
  const offset = input.offset ?? 0;
  const length = Math.min(input.length ?? MAX_TEXT_INLINE_BYTES, MAX_TEXT_INLINE_BYTES);
  const blobClient = client
    .getContainerClient(input.container)
    .getBlobClient(input.blob);

  const props = await blobClient.getProperties();
  const totalSize = props.contentLength ?? 0;

  const downloadResponse = await blobClient.download(offset, length);
  const chunks: Buffer[] = [];
  for await (const chunk of downloadResponse.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const data = Buffer.concat(chunks);

  return {
    name: input.blob,
    totalSize,
    contentType: props.contentType ?? "application/octet-stream",
    offset,
    length: data.length,
    hasMore: offset + data.length < totalSize,
    nextOffset: offset + data.length < totalSize ? offset + data.length : null,
    encoding: "base64",
    data: data.toString("base64"),
  };
}
