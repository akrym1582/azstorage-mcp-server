# GitHub Copilot 向け指示書

## プロジェクト概要

`azstorage-mcp-server` は、Azure Blob Storage・Queue Storage・Table Storage に対して**読み取り専用**でアクセスするための MCP (Model Context Protocol) サーバーです。書き込み・更新・削除操作は一切実装しておらず、LLM が安全にストレージを参照できることを目的としています。

## 技術スタック

| カテゴリ | 採用技術 |
|---|---|
| 言語 | TypeScript 5.x |
| ランタイム | Node.js (ESM) |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Azure SDK | `@azure/storage-blob`, `@azure/storage-queue`, `@azure/data-tables`, `@azure/identity` |
| テストフレームワーク | Vitest |
| ビルドツール | `tsc` (TypeScript コンパイラ) |
| 開発サーバー | `tsx` |

## ディレクトリ構成

```
src/
  index.ts      # サーバーエントリーポイント・ツール定義・ルーティング
  auth.ts       # 認証ロジック（接続文字列 / Managed Identity）
  blobs.ts      # Blob Storage 操作
  queues.ts     # Queue Storage 操作
  tables.ts     # Table Storage 操作
  types.ts      # 共通型定義・ページングユーティリティ
  __tests__/    # Vitest ユニットテスト
```

## 認証

環境変数を **1 つだけ** 設定してください。

| 変数名 | 説明 |
|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | 接続文字列（優先） |
| `AZURE_STORAGE_ACCOUNT_NAME` | ストレージアカウント名（`DefaultAzureCredential` を使用） |

`.env.example` を `.env` にコピーして値を記入してください。

## 利用可能な MCP ツール

### Blob Storage

| ツール名 | 説明 | 必須パラメータ |
|---|---|---|
| `storage.blobs.listContainers` | コンテナ一覧を取得 | なし |
| `storage.blobs.listFlat` | ブロブをフラットに一覧取得 | `container` |
| `storage.blobs.listTree` | ブロブを階層（仮想ディレクトリ）形式で一覧取得 | `container` |
| `storage.blobs.read` | ブロブのメタデータとテキスト内容を読み取り（最大 8 KB） | `container`, `blob` |
| `storage.blobs.download` | ブロブのチャンクを base64 でダウンロード | `container`, `blob` |

### Queue Storage

| ツール名 | 説明 | 必須パラメータ |
|---|---|---|
| `storage.queues.list` | キュー一覧を取得 | なし |
| `storage.queues.peek` | メッセージを可視性変更なしでプレビュー取得 | `queue` |

### Table Storage

| ツール名 | 説明 | 必須パラメータ |
|---|---|---|
| `storage.tables.list` | テーブル一覧を取得 | なし |
| `storage.tables.get` | PartitionKey・RowKey でエンティティを 1 件取得 | `table`, `partitionKey`, `rowKey` |
| `storage.tables.query` | OData フィルター式でエンティティを検索 | `table` |

## レスポンス形式

全リスト操作は以下の共通エンベロープを返します。

```json
{
  "items": [...],
  "page": {
    "pageSize": 20,
    "cursor": "次ページカーソルまたは null",
    "hasMore": true,
    "totalCount": null,
    "totalPages": null,
    "countMode": "disabled"
  },
  "summary": { "returned": 20 }
}
```

次のページを取得するには、前のレスポンスの `cursor` を次のリクエストに渡してください。

## コーディング規約

- **読み取り専用を守る**: 書き込み・更新・削除の操作を追加しないでください。
- **型安全性**: TypeScript の型を積極的に活用し、`any` は使用しないでください。
- **ページングヘルパー**: `src/types.ts` の `makePagedResult` / `clampPageSize` を必ず利用してください。
- **エラーハンドリング**: `try/catch` でエラーをキャッチし、`isError: true` フラグと共にメッセージを返してください。
- **ESM**: `import` 文のパスには `.js` 拡張子を付けてください（例: `./auth.js`）。
- **命名規則**:
  - ファイル名・変数名・関数名はキャメルケースまたはスネークケースを使用
  - MCP ツール名は `storage.<service>.<action>` の形式（例: `storage.blobs.listFlat`）

## 開発コマンド

```bash
# 依存パッケージのインストール
npm install

# TypeScript コンパイル（dist/ に出力）
npm run build

# 開発モードで起動（コンパイル不要）
npm run dev

# ユニットテストの実行
npm test

# 本番起動
npm start
```

## テスト

- テストファイルは `src/__tests__/` に配置してください。
- テストフレームワークは **Vitest** を使用します。
- Azure SDK のクライアントはモック化し、実際のストレージにアクセスしないようにしてください。
- `makePagedResult` などの純粋関数はユニットテストの対象です。

## 新しいツールを追加するときの手順

1. `src/index.ts` の `TOOLS` 配列にツール定義（`name`, `description`, `inputSchema`）を追加する。
2. 対応するサービスファイル（`blobs.ts`, `queues.ts`, `tables.ts`）に実装関数を追加する。
3. `src/index.ts` の `switch` 文にケースを追加し、実装関数を呼び出す。
4. `src/__tests__/` にユニットテストを追加する。
5. **読み取り専用であることを必ず確認すること。**
