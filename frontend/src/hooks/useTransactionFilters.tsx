import { useCallback, useMemo, useState } from "react";
import type { Transaction } from "../types";

interface FilterOptions {
  searchTerm?: string;
  type?: string;
  category?: string;
  account?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Custom hook for filtering transactions with multiple criteria
 * @param {Transaction[]} transactions - Array of transactions to filter
 * @returns {object} - Filter utilities
 *
 * @example
 * const { filteredData, filters, updateFilter, resetFilters, totalCount } = useTransactionFilters(transactions);
 *
 * updateFilter('type', 'Expense');
 * updateFilter('category', 'Food & Dining');
 * resetFilters();
 */
export const useTransactionFilters = (transactions: Transaction[]) => {
  const [filters, setFilters] = useState<FilterOptions>({
    searchTerm: "",
    type: "All",
    category: "All",
    account: "All",
    startDate: "",
    endDate: "",
  });

  const updateFilter = useCallback((key: keyof FilterOptions, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      searchTerm: "",
      type: "All",
      category: "All",
      account: "All",
      startDate: "",
      endDate: "",
    });
  }, []);

  const filteredData = useMemo(() => {
    const predicates: Array<(t: Transaction) => boolean> = [];

    if (filters.searchTerm?.trim()) {
      const search = filters.searchTerm.toLowerCase();
      predicates.push(
        (t) =>
          t.note?.toLowerCase().includes(search) ||
          t.category?.toLowerCase().includes(search) ||
          t.account?.toLowerCase().includes(search)
      );
    }

    if (filters.type && filters.type !== "All") {
      predicates.push((t) => t.type === filters.type);
    }

    if (filters.category && filters.category !== "All") {
      predicates.push((t) => t.category === filters.category);
    }

    if (filters.account && filters.account !== "All") {
      predicates.push((t) => t.account === filters.account);
    }

    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      predicates.push((t) => new Date(t.date) >= startDate);
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      predicates.push((t) => new Date(t.date) <= endDate);
    }

    return predicates.reduce((data, predicate) => data.filter(predicate), [...transactions]);
  }, [transactions, filters]);

  return {
    filteredData,
    filters,
    updateFilter,
    resetFilters,
    totalCount: transactions.length,
    filteredCount: filteredData.length,
  };
};
