/**
 * Hook to fetch transactions from backend API
 */

import { useEffect } from "react";
import { checkHealth, fetchTransactions } from "../services/api";
import { useSetError, useSetLoading, useSetTransactions } from "../store/financialStore";

export function useBackendData() {
  const setTransactions = useSetTransactions();
  const setLoading = useSetLoading();
  const setError = useSetError();

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const isHealthy = await checkHealth();
        if (!isHealthy) {
          throw new Error("Backend server is not available. Please start the backend server.");
        }

        const transactions = await fetchTransactions();
        if (mounted) {
          setTransactions(transactions);
        }
      } catch (error) {
        console.error("Error loading data from backend:", error);
        if (mounted) {
          setError(error instanceof Error ? error.message : "Failed to load data from backend");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [setTransactions, setLoading, setError]);
}
