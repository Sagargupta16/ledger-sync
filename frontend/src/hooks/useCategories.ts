/**
 * useCategories Hook
 * Fetches and caches master categories from backend
 */

import { useEffect, useState } from "react";
import { fetchMasterCategories, type MasterCategories } from "../services/api";

interface UseCategoriesReturn {
  categories: MasterCategories | null;
  loading: boolean;
  error: string | null;
  incomeCategories: string[];
  expenseCategories: string[];
}

/**
 * Custom hook to fetch master categories
 * Includes caching to avoid repeated API calls
 */
export function useCategories(): UseCategoriesReturn {
  const [categories, setCategories] = useState<MasterCategories | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if categories are already cached in sessionStorage
    const cachedCategories = sessionStorage.getItem("masterCategories");
    if (cachedCategories) {
      try {
        setCategories(JSON.parse(cachedCategories));
        setLoading(false);
        return;
      } catch {
        // Invalid cache, proceed with fetch
      }
    }

    // Fetch categories from backend
    const loadCategories = async () => {
      try {
        setLoading(true);
        const data = await fetchMasterCategories();
        setCategories(data);
        // Cache for the session
        sessionStorage.setItem("masterCategories", JSON.stringify(data));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch categories");
        setCategories(null);
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, []);

  return {
    categories,
    loading,
    error,
    incomeCategories: categories ? Object.keys(categories.income) : [],
    expenseCategories: categories ? Object.keys(categories.expense) : [],
  };
}
