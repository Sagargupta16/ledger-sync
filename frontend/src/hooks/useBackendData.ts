/**
 * Hook to fetch transactions from backend API
 */

import { useEffect } from "react";
import { fetchTransactions, checkHealth } from "../services/api";
import { useSetTransactions, useSetLoading, useSetError } from "../store/financialStore";

export function useBackendData() {
  const setTransactions = useSetTransactions();
  const setLoading = useSetLoading();
  const setError = useSetError();

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Check if backend is available
        const isHealthy = await checkHealth();
        if (!isHealthy) {
          throw new Error("Backend server is not available. Please start the backend server.");
        }

        // Fetch transactions
        const transactions = await fetchTransactions();

        if (mounted) {
          setTransactions(transactions);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error loading data from backend:", error);
        if (mounted) {
          setError(error instanceof Error ? error.message : "Failed to load data from backend");
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [setTransactions, setLoading, setError]);
}
