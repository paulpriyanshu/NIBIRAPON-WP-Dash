'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Shape every paginated endpoint returns when called with `?limit=`. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

interface Options<T> {
  /** API path that accepts `?limit=&cursor=` and returns `{ items, nextCursor }`. */
  endpoint: string;
  limit?: number;
  /** First screen rendered on the server, so there's no blank → spinner on load. */
  initialItems?: T[];
  initialCursor?: string | null;
}

/**
 * Cursor-based infinite list. Seed it with the server-rendered first page
 * (`initialItems`/`initialCursor`); attach `sentinelRef` to a node near the
 * bottom of the scroll area to auto-load the next page as the user scrolls.
 */
export function useInfiniteList<T>({ endpoint, limit = 30, initialItems = [], initialCursor = null }: Options<T>) {
  const [items, setItems]   = useState<T[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialCursor !== null);
  const [loading, setLoading] = useState(false);

  // Avoid stale closures / overlapping fetches inside the IntersectionObserver.
  const cursorRef  = useRef(cursor);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  cursorRef.current  = cursor;
  hasMoreRef.current = hasMore;

  const fetchPage = useCallback(async (c: string | null): Promise<Page<T>> => {
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}limit=${limit}${c ? `&cursor=${encodeURIComponent(c)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load (${res.status})`);
    return res.json();
  }, [endpoint, limit]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await fetchPage(cursorRef.current);
      setItems(prev => prev.concat(page.items));
      setCursor(page.nextCursor);
      setHasMore(page.nextCursor !== null);
    } catch { /* keep what we have; sentinel will retry on next intersect */ }
    finally { loadingRef.current = false; setLoading(false); }
  }, [fetchPage]);

  /** Reset to the first page (after a create/delete, or a manual refresh). */
  const reload = useCallback(async () => {
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await fetchPage(null);
      setItems(page.items);
      setCursor(page.nextCursor);
      setHasMore(page.nextCursor !== null);
    } catch { /* leave current list intact */ }
    finally { loadingRef.current = false; setLoading(false); }
  }, [fetchPage]);

  // Attach to a sentinel <div> at the bottom of the list.
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;
    observerRef.current = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) loadMore(); },
      { rootMargin: '400px' },
    );
    observerRef.current.observe(node);
  }, [loadMore]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { items, setItems, loading, hasMore, loadMore, reload, sentinelRef };
}
