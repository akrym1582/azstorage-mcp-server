# @akrym1582/azstorage-mcp-server

Read-only Azure Storage MCP (Model Context Protocol) Server for Blob Storage, Queue Storage, and Table Storage.

[![npm version](https://img.shields.io/npm/v/azstorage-mcp-server)](https://www.npmjs.com/package/azstorage-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Read-only** — no write, update, or delete operations
- **Blob Storage** — list containers, list blobs (flat & tree), read text content, download binary content
- **Queue Storage** — list queues, peek messages (visibility unchanged)
- **Table Storage** — list tables, get entity by key, query with OData filter
- **Cursor-based pagination** — consistent `cursor` / `hasMore` pattern for all list operations
- **LLM-optimized responses** — compact JSON, truncated text, no unnecessary fields
- **Connection string or Managed Identity** authentication via environment variables

## Installation

```bash
npm install -g azstorage-mcp-server
```

Or use without installing via `npx`:

```bash
npx azstorage-mcp-server
```

## Authentication

Set **one** of the following environment variables before starting the server:

| Variable | Description |
|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | Full connection string (takes priority) |
| `AZURE_STORAGE_ACCOUNT_NAME` | Storage account name; uses `DefaultAzureCredential` (Managed Identity, Azure CLI, etc.) |

## MCP Client Configuration

### Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "azstorage": {
      "command": "npx",
      "args": ["-y", "azstorage-mcp-server"],
      "env": {
        "AZURE_STORAGE_CONNECTION_STRING": "<your-connection-string>"
      }
    }
  }
}
```

To use Managed Identity instead, replace the `env` block with:

```json
"env": {
  "AZURE_STORAGE_ACCOUNT_NAME": "<your-storage-account-name>"
}
```

### Other MCP clients (Cursor, VS Code, etc.)

Use the same pattern with `npx -y azstorage-mcp-server` as the command and supply one of the authentication environment variables.

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
git clone https://github.com/akryk7316/azstorage-mcp-server.git
cd azstorage-mcp-server
npm install
npm run build   # compile TypeScript → dist/
npm test        # run unit tests
npm run dev     # run with tsx (no compilation needed)
```

## License

MIT
