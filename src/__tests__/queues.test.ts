import { describe, it, expect, vi } from "vitest";
import type { QueueServiceClient } from "@azure/storage-queue";
import { listQueues, peekQueue } from "../queues.js";

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
      return { next: async () => ({ value: undefined, done: true }) };
    },
  };
}

describe("listQueues", () => {
  it("returns queue names", async () => {
    const mockClient = {
      listQueues: vi.fn().mockReturnValue(
        makeAsyncIterable([
          { queueItems: [{ name: "queue1" }, { name: "queue2" }], continuationToken: undefined },
        ])
      ),
    } as unknown as QueueServiceClient;

    const result = await listQueues(mockClient, {});
    expect(result.items).toHaveLength(2);
    const item0 = result.items[0] as { name: string };
    expect(item0.name).toBe("queue1");
    expect(result.summary.returned).toBe(2);
  });
});

describe("peekQueue", () => {
  it("returns message previews without full body", async () => {
    const longBody = "x".repeat(500);
    const mockQueueClient = {
      peekMessages: vi.fn().mockResolvedValue({
        peekedMessageItems: [
          {
            messageId: "msg-1",
            messageText: longBody,
            insertedOn: new Date("2024-01-01"),
            expiresOn: new Date("2024-01-08"),
            dequeueCount: 0,
          },
          {
            messageId: "msg-2",
            messageText: "short message",
            insertedOn: new Date("2024-01-02"),
            expiresOn: new Date("2024-01-09"),
            dequeueCount: 1,
          },
        ],
      }),
    };
    const mockClient = {
      getQueueClient: vi.fn().mockReturnValue(mockQueueClient),
    } as unknown as QueueServiceClient;

    const result = await peekQueue(mockClient, { queue: "myqueue", maxMessages: 5 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].truncated).toBe(true);
    expect(result.items[0].preview.length).toBeLessThanOrEqual(260); // 256 + ellipsis
    expect(result.items[1].truncated).toBe(false);
    expect(result.items[1].preview).toBe("short message");
    expect(result.items[0].messageId).toBe("msg-1");
    expect(result.items[0].dequeueCount).toBe(0);
  });

  it("clamps maxMessages to 32", async () => {
    const mockQueueClient = {
      peekMessages: vi.fn().mockResolvedValue({ peekedMessageItems: [] }),
    };
    const mockClient = {
      getQueueClient: vi.fn().mockReturnValue(mockQueueClient),
    } as unknown as QueueServiceClient;

    await peekQueue(mockClient, { queue: "q", maxMessages: 100 });
    expect(mockQueueClient.peekMessages).toHaveBeenCalledWith({ numberOfMessages: 32 });
  });
});
