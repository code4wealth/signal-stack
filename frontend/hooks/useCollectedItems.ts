"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getItem, listItems } from "@/lib/api";
import type { CollectedItem, CollectedItemsFilters } from "@/lib/types";

export function useCollectedItems(companyId: number, enabled = true) {
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  const [filters, setFilters] = useState<CollectedItemsFilters>({
    category: "all",
    change: "all",
    q: "",
  });
  const [extraItems, setExtraItems] = useState<CollectedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["crawler-items", companyId, filters],
    queryFn: async () => {
      if (useMocks) {
        return {
          items: [
            {
              id: 1,
              sourceId: 101,
              sourceName: "MOCK DATA — Industry Forum",
              domain: "example.com",
              category: "customers" as const,
              title: "MOCK DATA — Buyers asking for automated compliance exports",
              url: "https://example.com/community/compliance-exports",
              publishedAt: new Date(Date.now() - 7200_000).toISOString(),
              publishedAtMethod: "rss" as const,
              fetchedAt: new Date(Date.now() - 3600_000).toISOString(),
              change: "new" as const,
              contentHash: "a1b2c3d4e5f600001111222233334444",
              excerpt: "MOCK DATA — Sample extracted evidence text for preview only.",
            },
          ],
          nextCursor: null,
          total: 1,
        };
      }
      return listItems(companyId, filters);
    },
    enabled: enabled && Number.isFinite(companyId) && companyId > 0,
    retry: 1,
  });

  useEffect(() => {
    setExtraItems([]);
    setNextCursor(itemsQuery.data?.nextCursor ?? null);
  }, [itemsQuery.data]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || useMocks) return;
    setLoadingMore(true);
    try {
      const page = await listItems(companyId, filters, nextCursor);
      setExtraItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [companyId, filters, loadingMore, nextCursor, useMocks]);

  const itemDetailQuery = useQuery<CollectedItem>({
    queryKey: ["crawler-item-detail", companyId, selectedItemId],
    queryFn: () => {
      if (useMocks) {
        const found = itemsQuery.data?.items.find((i) => i.id === selectedItemId);
        if (found) return Promise.resolve(found);
      }
      return getItem(companyId, selectedItemId as number);
    },
    enabled: Boolean(selectedItemId && selectedItemId > 0),
    retry: 1,
  });

  const combinedItems = [...(itemsQuery.data?.items ?? []), ...extraItems];

  return {
    items: combinedItems,
    total: itemsQuery.data?.total ?? combinedItems.length,
    filters,
    setFilters,
    isLoading: itemsQuery.isLoading,
    hasMore: Boolean(nextCursor),
    loadMore,
    loadingMore,
    refetch: itemsQuery.refetch,
    selectedItemId,
    setSelectedItemId,
    selectedItem: itemDetailQuery.data ?? null,
    isLoadingDetail: itemDetailQuery.isLoading,
  };
}
