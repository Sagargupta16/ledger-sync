/**
 * useBuckets Hook
 * Fetches dynamic buckets (needs/wants/savings, investment categories/accounts) from backend.
 */

import { useEffect, useState } from "react";
import { fetchBuckets, type BucketResponse } from "../services/api";

interface UseBucketsReturn {
  buckets: BucketResponse | null;
  loading: boolean;
  error: string | null;
}

export function useBuckets(): UseBucketsReturn {
  const [buckets, setBuckets] = useState<BucketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem("buckets");
    if (cached) {
      try {
        setBuckets(JSON.parse(cached));
        setLoading(false);
        return;
      } catch {
        // ignore bad cache
      }
    }

    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchBuckets();
        setBuckets(data);
        sessionStorage.setItem("buckets", JSON.stringify(data));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch buckets");
        setBuckets(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return { buckets, loading, error };
}
