/**
 * useMetaFilters Hook
 * Fetches accounts and types for filters from backend meta endpoints.
 */

import { useEffect, useState } from "react";
import { fetchMetaFilters, type MetaFilters } from "../services/api";

interface UseMetaFiltersReturn {
  filters: MetaFilters | null;
  loading: boolean;
  error: string | null;
}

export function useMetaFilters(): UseMetaFiltersReturn {
  const [filters, setFilters] = useState<MetaFilters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem("metaFilters");
    if (cached) {
      try {
        setFilters(JSON.parse(cached));
        setLoading(false);
        return;
      } catch {
        // ignore bad cache
      }
    }

    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchMetaFilters();
        setFilters(data);
        sessionStorage.setItem("metaFilters", JSON.stringify(data));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch filter metadata");
        setFilters(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return { filters, loading, error };
}
