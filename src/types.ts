/**
 * Common types for the Azure Storage MCP Server
 */

export interface PageInfo {
  pageSize: number;
  cursor: string | null;
  hasMore: boolean;
  totalCount: number | null;
  totalPages: number | null;
  countMode: "disabled" | "exact";
}

export interface PagedResult<T> {
  items: T[];
  page: PageInfo;
  summary: { returned: number };
}

export function makePagedResult<T>(
  items: T[],
  pageSize: number,
  nextCursor: string | null | undefined,
  totalCount?: number | null
): PagedResult<T> {
  const hasMore = nextCursor != null && nextCursor !== "";
  return {
    items,
    page: {
      pageSize,
      cursor: hasMore ? nextCursor : null,
      hasMore,
      totalCount: totalCount ?? null,
      totalPages:
        totalCount != null ? Math.ceil(totalCount / pageSize) : null,
      countMode: totalCount != null ? "exact" : "disabled",
    },
    summary: { returned: items.length },
  };
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_TEXT_INLINE_BYTES = 8192;

export function clampPageSize(n: unknown): number {
  const v = typeof n === "number" ? n : parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(v) || v < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(v, MAX_PAGE_SIZE);
}
