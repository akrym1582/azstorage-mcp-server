import { describe, it, expect, vi } from "vitest";
import type { TableClient } from "@azure/data-tables";
import { getEntity, queryTable } from "../tables.js";

describe("getEntity", () => {
  it("returns entity without internal metadata", async () => {
    const rawEntity = {
      partitionKey: "pk1",
      rowKey: "rk1",
      name: "Alice",
      etag: '"internal-etag"',
      "odata.metadata": "https://...",
    };
    const mockTableClient = {
      getEntity: vi.fn().mockResolvedValue(rawEntity),
    } as unknown as TableClient;

    const result = await getEntity(mockTableClient, {
      table: "users",
      partitionKey: "pk1",
      rowKey: "rk1",
    });

    expect(result.partitionKey).toBe("pk1");
    expect(result.name).toBe("Alice");
    expect(result.etag).toBeUndefined();
    expect(result["odata.metadata"]).toBeUndefined();
  });

  it("passes select option when provided", async () => {
    const mockTableClient = {
      getEntity: vi.fn().mockResolvedValue({ partitionKey: "pk1", rowKey: "rk1", name: "Alice" }),
    } as unknown as TableClient;

    await getEntity(mockTableClient, {
      table: "users",
      partitionKey: "pk1",
      rowKey: "rk1",
      select: ["name"],
    });

    expect(mockTableClient.getEntity).toHaveBeenCalledWith("pk1", "rk1", {
      queryOptions: { select: ["name"] },
    });
  });
});

describe("queryTable", () => {
  function makeAsyncIterable(items: unknown[], nextCursor?: string) {
    return {
      byPage: () => ({
        next: async () => ({
          value: items,
          done: false,
          continuationToken: nextCursor,
        }),
        [Symbol.asyncIterator]() {
          return this;
        },
      }),
      [Symbol.asyncIterator]() {
        return { next: async () => ({ value: undefined, done: true }) };
      },
    };
  }

  it("returns paged query results", async () => {
    const entities = [
      { partitionKey: "pk1", rowKey: "rk1", value: "foo" },
      { partitionKey: "pk1", rowKey: "rk2", value: "bar" },
    ];
    const mockTableClient = {
      listEntities: vi.fn().mockReturnValue(makeAsyncIterable(entities)),
    } as unknown as TableClient;

    const result = await queryTable(mockTableClient, { table: "mytable" });
    expect(result.items).toHaveLength(2);
    expect(result.summary.returned).toBe(2);
    expect(result.page.hasMore).toBe(false);
  });

  it("passes filter and select to listEntities", async () => {
    const mockTableClient = {
      listEntities: vi.fn().mockReturnValue(makeAsyncIterable([])),
    } as unknown as TableClient;

    await queryTable(mockTableClient, {
      table: "mytable",
      filter: "PartitionKey eq 'pk1'",
      select: ["name", "value"],
    });

    expect(mockTableClient.listEntities).toHaveBeenCalledWith({
      queryOptions: {
        filter: "PartitionKey eq 'pk1'",
        select: ["name", "value"],
      },
    });
  });
});
