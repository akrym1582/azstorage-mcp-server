#!/usr/bin/env node
/**
 * Azure Storage MCP Server (read-only)
 *
 * Environment variables:
 *   AZURE_STORAGE_CONNECTION_STRING  – connection string (takes priority)
 *   AZURE_STORAGE_ACCOUNT_NAME       – account name for Managed Identity
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  getStorageConfig,
  getBlobServiceClient,
  getQueueServiceClient,
  getTableServiceClient,
  createTableClient,
} from "./auth.js";
import {
  listContainers,
  listFlat,
  listTree,
  readBlob,
  downloadBlob,
} from "./blobs.js";
import { listQueues, peekQueue } from "./queues.js";
import { listTables, getEntity, queryTable } from "./tables.js";

// ────────────────────────────────────────────────────────────
// Tool definitions
// ────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "storage.blobs.listContainers",
    description: "List Blob Storage containers.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prefix: { type: "string", description: "Filter containers by prefix." },
        pageSize: { type: "number", description: "Max items per page (1-100). Default 20." },
        cursor: { type: "string", description: "Continuation cursor from previous response." },
      },
    },
  },
  {
    name: "storage.blobs.listFlat",
    description: "List blobs in a container (flat, no virtual-directory grouping).",
    inputSchema: {
      type: "object" as const,
      required: ["container"],
      properties: {
        container: { type: "string", description: "Container name." },
        prefix: { type: "string", description: "Filter blobs by prefix." },
        pageSize: { type: "number", description: "Max items per page (1-100). Default 20." },
        cursor: { type: "string", description: "Continuation cursor from previous response." },
      },
    },
  },
  {
    name: "storage.blobs.listTree",
    description: "List blobs in a container using hierarchical (virtual-directory) listing.",
    inputSchema: {
      type: "object" as const,
      required: ["container"],
      properties: {
        container: { type: "string", description: "Container name." },
        prefix: { type: "string", description: "Virtual directory prefix." },
        delimiter: { type: "string", description: "Delimiter character. Default '/'." },
        pageSize: { type: "number", description: "Max items per page (1-100). Default 20." },
        cursor: { type: "string", description: "Continuation cursor from previous response." },
      },
    },
  },
  {
    name: "storage.blobs.read",
    description:
      "Read blob metadata and inline content (text only, up to 8 KB). For binary or large blobs use storage.blobs.download.",
    inputSchema: {
      type: "object" as const,
      required: ["container", "blob"],
      properties: {
        container: { type: "string", description: "Container name." },
        blob: { type: "string", description: "Blob name (path)." },
        maxBytes: { type: "number", description: "Max inline bytes for text content. Default/max 8192." },
        skipBytes: { type: "number", description: "Number of bytes to skip from the start of the blob before reading. Clamped to blob size (skipping past the end returns empty content). Default 0." },
      },
    },
  },
  {
    name: "storage.blobs.download",
    description:
      "Download a chunk of a blob as base64. Use offset/length for range requests.",
    inputSchema: {
      type: "object" as const,
      required: ["container", "blob"],
      properties: {
        container: { type: "string", description: "Container name." },
        blob: { type: "string", description: "Blob name (path)." },
        offset: { type: "number", description: "Byte offset. Default 0." },
        length: { type: "number", description: "Bytes to read. Default/max 8192." },
      },
    },
  },
  {
    name: "storage.queues.list",
    description: "List Queue Storage queues.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prefix: { type: "string", description: "Filter queues by prefix." },
        pageSize: { type: "number", description: "Max items per page (1-100). Default 20." },
        cursor: { type: "string", description: "Continuation cursor from previous response." },
      },
    },
  },
  {
    name: "storage.queues.peek",
    description:
      "Peek at messages in a queue without changing their visibility. Returns preview text.",
    inputSchema: {
      type: "object" as const,
      required: ["queue"],
      properties: {
        queue: { type: "string", description: "Queue name." },
        maxMessages: { type: "number", description: "Number of messages to peek (1-32). Default 10." },
      },
    },
  },
  {
    name: "storage.tables.list",
    description: "List Table Storage tables.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pageSize: { type: "number", description: "Max items per page (1-100). Default 20." },
        cursor: { type: "string", description: "Continuation cursor from previous response." },
      },
    },
  },
  {
    name: "storage.tables.get",
    description: "Get a single table entity by PartitionKey and RowKey.",
    inputSchema: {
      type: "object" as const,
      required: ["table", "partitionKey", "rowKey"],
      properties: {
        table: { type: "string", description: "Table name." },
        partitionKey: { type: "string", description: "Partition key." },
        rowKey: { type: "string", description: "Row key." },
        select: {
          type: "array",
          items: { type: "string" },
          description: "Columns to return. Omit for all columns.",
        },
      },
    },
  },
  {
    name: "storage.tables.query",
    description:
      "Query table entities using an OData filter expression. Use select to limit returned columns.",
    inputSchema: {
      type: "object" as const,
      required: ["table"],
      properties: {
        table: { type: "string", description: "Table name." },
        filter: { type: "string", description: "OData filter expression (e.g. \"PartitionKey eq 'foo'\")." },
        select: {
          type: "array",
          items: { type: "string" },
          description: "Columns to return. Strongly recommended to reduce token usage.",
        },
        pageSize: { type: "number", description: "Entities per page (1-100). Default 20." },
        cursor: { type: "string", description: "Continuation cursor from previous response." },
        skip: { type: "number", description: "Number of entities to skip from the start of the query result. Default 0." },
      },
    },
  },
];

// ────────────────────────────────────────────────────────────
// Server bootstrap
// ────────────────────────────────────────────────────────────

async function main() {
  const config = getStorageConfig();
  const blobClient = getBlobServiceClient(config);
  const queueClient = getQueueServiceClient(config);
  const tableServiceClient = getTableServiceClient(config);

  const server = new Server(
    { name: "azstorage-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // ── List tools ──
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // ── Call tool ──
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const a = args as Record<string, unknown>;

    try {
      let result: unknown;

      switch (name) {
        case "storage.blobs.listContainers":
          result = await listContainers(blobClient, a as Parameters<typeof listContainers>[1]);
          break;
        case "storage.blobs.listFlat":
          result = await listFlat(blobClient, a as unknown as Parameters<typeof listFlat>[1]);
          break;
        case "storage.blobs.listTree":
          result = await listTree(blobClient, a as unknown as Parameters<typeof listTree>[1]);
          break;
        case "storage.blobs.read":
          result = await readBlob(blobClient, a as unknown as Parameters<typeof readBlob>[1]);
          break;
        case "storage.blobs.download":
          result = await downloadBlob(blobClient, a as unknown as Parameters<typeof downloadBlob>[1]);
          break;
        case "storage.queues.list":
          result = await listQueues(queueClient, a as Parameters<typeof listQueues>[1]);
          break;
        case "storage.queues.peek":
          result = await peekQueue(queueClient, a as unknown as Parameters<typeof peekQueue>[1]);
          break;
        case "storage.tables.list":
          result = await listTables(tableServiceClient, a as Parameters<typeof listTables>[1]);
          break;
        case "storage.tables.get": {
          const table = String(a.table ?? "");
          const tc = createTableClient(config, table);
          result = await getEntity(tc, a as unknown as Parameters<typeof getEntity>[1]);
          break;
        }
        case "storage.tables.query": {
          const table = String(a.table ?? "");
          const tc = createTableClient(config, table);
          result = await queryTable(tc, a as unknown as Parameters<typeof queryTable>[1]);
          break;
        }
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 0),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
