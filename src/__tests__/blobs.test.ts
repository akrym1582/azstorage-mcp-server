import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BlobServiceClient } from "@azure/storage-blob";
import { listContainers, listFlat, listTree } from "../blobs.js";

function makeAsyncIterable<T>(pages: T[]) {
  let callCount = 0;
  return {
    byPage: () => ({
      next: async () => {
        if (callCount < 1) {
          callCount++;
          return { value: pages[0], done: false };
        }
        return { value: undefined, done: true };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    }),
    [Symbol.asyncIterator]() {
      return {
        next: async () => ({ value: undefined, done: true }),
      };
    },
  };
}

describe("listContainers", () => {
  it("returns paged result with container items", async () => {
    const containers = [
      { name: "container1", properties: { lastModified: new Date("2024-01-01"), etag: '"abc"' } },
      { name: "container2", properties: { lastModified: new Date("2024-01-02"), etag: '"def"' } },
    ];
    const mockClient = {
      listContainers: vi.fn().mockReturnValue(
        makeAsyncIterable([
          { containerItems: containers, continuationToken: undefined },
        ])
      ),
    } as unknown as BlobServiceClient;

    const result = await listContainers(mockClient, { pageSize: 20 });
    expect(result.items).toHaveLength(2);
    const item0 = result.items[0] as { name: string; lastModified: string };
    expect(item0.name).toBe("container1");
    expect(item0.lastModified).toBe("2024-01-01T00:00:00.000Z");
    expect(result.page.hasMore).toBe(false);
    expect(result.summary.returned).toBe(2);
  });

  it("passes cursor as continuationToken", async () => {
    const mockListContainers = vi.fn().mockReturnValue(
      makeAsyncIterable([
        { containerItems: [], continuationToken: "next-token" },
      ])
    );
    const mockClient = {
      listContainers: mockListContainers,
    } as unknown as BlobServiceClient;

    const result = await listContainers(mockClient, { cursor: "prev-token" });
    expect(result.page.hasMore).toBe(true);
    expect(result.page.cursor).toBe("next-token");
  });
});

describe("listFlat", () => {
  it("returns blob items with correct shape", async () => {
    const blobItems = [
      {
        name: "path/to/file.txt",
        properties: {
          contentLength: 1234,
          lastModified: new Date("2024-03-01"),
          etag: '"etag1"',
          contentType: "text/plain",
        },
      },
    ];
    const mockContainerClient = {
      listBlobsFlat: vi.fn().mockReturnValue(
        makeAsyncIterable([
          {
            segment: { blobItems },
            continuationToken: undefined,
          },
        ])
      ),
    };
    const mockClient = {
      getContainerClient: vi.fn().mockReturnValue(mockContainerClient),
    } as unknown as BlobServiceClient;

    const result = await listFlat(mockClient, { container: "mycontainer" });
    const item0 = result.items[0] as { name: string; kind: string; size: number; contentType: string };
    expect(item0.name).toBe("path/to/file.txt");
    expect(item0.kind).toBe("blob");
    expect(item0.size).toBe(1234);
    expect(item0.contentType).toBe("text/plain");
  });
});

describe("listTree", () => {
  it("returns prefixes and blob items", async () => {
    const blobPrefixes = [{ name: "folder/" }];
    const blobItems = [
      {
        name: "root-file.txt",
        properties: {
          contentLength: 100,
          lastModified: new Date("2024-01-01"),
          etag: '"e1"',
          contentType: "text/plain",
        },
      },
    ];
    const mockContainerClient = {
      listBlobsByHierarchy: vi.fn().mockReturnValue(
        makeAsyncIterable([
          {
            segment: { blobPrefixes, blobItems },
            continuationToken: undefined,
          },
        ])
      ),
    };
    const mockClient = {
      getContainerClient: vi.fn().mockReturnValue(mockContainerClient),
    } as unknown as BlobServiceClient;

    const result = await listTree(mockClient, { container: "mycontainer" });
    expect(result.items).toHaveLength(2);
    const item0 = result.items[0] as { name: string; kind: string };
    const item1 = result.items[1] as { name: string; kind: string };
    expect(item0.kind).toBe("prefix");
    expect(item0.name).toBe("folder/");
    expect(item1.kind).toBe("blob");
  });
});
