/**
 * Authentication helper for Azure Storage.
 *
 * Priority:
 *   1. AZURE_STORAGE_CONNECTION_STRING  → connection string auth
 *   2. AZURE_STORAGE_ACCOUNT_NAME       → Managed Identity / DefaultAzureCredential
 */

import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { QueueServiceClient } from "@azure/storage-queue";
import { TableServiceClient, TableClient } from "@azure/data-tables";

export interface StorageConfig {
  connectionString?: string;
  accountName?: string;
}

export function getStorageConfig(): StorageConfig {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  if (!connectionString && !accountName) {
    throw new Error(
      "Either AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME must be set."
    );
  }
  return { connectionString, accountName };
}

export function getBlobServiceClient(config: StorageConfig): BlobServiceClient {
  if (config.connectionString) {
    return BlobServiceClient.fromConnectionString(config.connectionString);
  }
  const credential = new DefaultAzureCredential();
  return new BlobServiceClient(
    `https://${config.accountName}.blob.core.windows.net`,
    credential
  );
}

export function getQueueServiceClient(
  config: StorageConfig
): QueueServiceClient {
  if (config.connectionString) {
    return QueueServiceClient.fromConnectionString(config.connectionString);
  }
  const credential = new DefaultAzureCredential();
  return new QueueServiceClient(
    `https://${config.accountName}.queue.core.windows.net`,
    credential
  );
}

export function getTableServiceClient(
  config: StorageConfig
): TableServiceClient {
  if (config.connectionString) {
    return TableServiceClient.fromConnectionString(config.connectionString);
  }
  const credential = new DefaultAzureCredential();
  return new TableServiceClient(
    `https://${config.accountName}.table.core.windows.net`,
    credential
  );
}

export function createTableClient(
  config: StorageConfig,
  tableName: string
): TableClient {
  if (config.connectionString) {
    return TableClient.fromConnectionString(config.connectionString, tableName);
  }
  const credential = new DefaultAzureCredential();
  return new TableClient(
    `https://${config.accountName}.table.core.windows.net`,
    tableName,
    credential
  );
}
