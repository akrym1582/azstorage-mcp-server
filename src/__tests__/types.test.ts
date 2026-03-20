import { describe, it, expect } from "vitest";
import { makePagedResult, clampPageSize, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "../types.js";

describe("makePagedResult", () => {
  it("returns correct shape with items", () => {
    const result = makePagedResult(["a", "b", "c"], 10, null);
    expect(result.items).toEqual(["a", "b", "c"]);
    expect(result.summary.returned).toBe(3);
    expect(result.page.pageSize).toBe(10);
    expect(result.page.hasMore).toBe(false);
    expect(result.page.cursor).toBeNull();
  });

  it("sets hasMore and cursor when continuation token is present", () => {
    const result = makePagedResult(["a"], 10, "abc123");
    expect(result.page.hasMore).toBe(true);
    expect(result.page.cursor).toBe("abc123");
  });

  it("sets totalCount and totalPages when count provided", () => {
    const result = makePagedResult(["a", "b"], 10, null, 25);
    expect(result.page.totalCount).toBe(25);
    expect(result.page.totalPages).toBe(3);
    expect(result.page.countMode).toBe("exact");
  });

  it("sets countMode=disabled when no totalCount", () => {
    const result = makePagedResult([], 20, null);
    expect(result.page.countMode).toBe("disabled");
    expect(result.page.totalCount).toBeNull();
    expect(result.page.totalPages).toBeNull();
  });
});

describe("clampPageSize", () => {
  it("returns default for undefined", () => {
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("returns default for 0", () => {
    expect(clampPageSize(0)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps to MAX_PAGE_SIZE", () => {
    expect(clampPageSize(999)).toBe(MAX_PAGE_SIZE);
  });

  it("returns valid value as-is", () => {
    expect(clampPageSize(50)).toBe(50);
  });

  it("parses string numbers", () => {
    expect(clampPageSize("30")).toBe(30);
  });

  it("handles negative numbers", () => {
    expect(clampPageSize(-5)).toBe(DEFAULT_PAGE_SIZE);
  });
});
