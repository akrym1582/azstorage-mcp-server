# azstorage-mcp-server

Read-only Azure Storage MCP (Model Context Protocol) Server for Blob Storage, Queue Storage, and Table Storage.

## Features

- **Read-only** — no write, update, or delete operations
- **Blob Storage** — list containers, list blobs (flat & tree), read text content, download binary content
- **Queue Storage** — list queues, peek messages (visibility unchanged)
- **Table Storage** — list tables, get entity by key, query with OData filter
- **Cursor-based pagination** — consistent `cursor` / `hasMore` pattern for all list operations
- **LLM-optimized responses** — compact JSON, truncated text, no unnecessary fields
- **Connection string or Managed Identity** authentication via environment variables

## Authentication

Set **one** of the following environment variables:

| Variable | Description |
|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | Full connection string (takes priority) |
| `AZURE_STORAGE_ACCOUNT_NAME` | Storage account name; uses `DefaultAzureCredential` (Managed Identity, Azure CLI, etc.) |

Copy `.env.example` to `.env` and fill in your values.

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Start with connection string
AZURE_STORAGE_CONNECTION_STRING="..." npm start

# Start with Managed Identity
AZURE_STORAGE_ACCOUNT_NAME="mystorageaccount" npm start
```

Or run directly in development mode:

```bash
AZURE_STORAGE_CONNECTION_STRING="..." npm run dev
```

## MCP Tools

### Blob Storage

| Tool | Description |
|---|---|
| `storage.blobs.listContainers` | List containers. Params: `prefix`, `pageSize`, `cursor` |
| `storage.blobs.listFlat` | Flat blob list. Params: `container`*, `prefix`, `pageSize`, `cursor` |
| `storage.blobs.listTree` | Hierarchical blob list. Params: `container`*, `prefix`, `delimiter`, `pageSize`, `cursor` |
| `storage.blobs.read` | Read blob metadata + inline text (≤8 KB). Params: `container`*, `blob`*, `maxBytes` |
| `storage.blobs.download` | Download blob chunk as base64. Params: `container`*, `blob`*, `offset`, `length` |

### Queue Storage

| Tool | Description |
|---|---|
| `storage.queues.list` | List queues. Params: `prefix`, `pageSize`, `cursor` |
| `storage.queues.peek` | Peek messages (read-only, no visibility change). Params: `queue`*, `maxMessages` |

### Table Storage

| Tool | Description |
|---|---|
| `storage.tables.list` | List tables. Params: `pageSize`, `cursor` |
| `storage.tables.get` | Get entity by key. Params: `table`*, `partitionKey`*, `rowKey`*, `select` |
| `storage.tables.query` | Query with OData filter. Params: `table`*, `filter`, `select`, `pageSize`, `cursor` |

`*` = required

## Response Format

All list operations return a common envelope:

```json
{
  "items": [...],
  "page": {
    "pageSize": 20,
    "cursor": "opaque-next-cursor-or-null",
    "hasMore": true,
    "totalCount": null,
    "totalPages": null,
    "countMode": "disabled"
  },
  "summary": { "returned": 20 }
}
```

Use `cursor` from the previous response to fetch the next page.

## Development

```bash
npm test       # run unit tests
npm run build  # compile TypeScript → dist/
npm run dev    # run with tsx (no compilation)
```

## License

MIT
