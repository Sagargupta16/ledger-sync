/**
 * Transaction filtering and utility hooks
 * Simplified from useDataProcessor - removed heavy CSV/Excel parsing
 * (parsing is now handled by backend API)
 */

import { useMemo } from "react";
import type { DataFilters, SortConfig, Transaction, UniqueValues } from "../types";

/**
 * Extract unique values from transactions for filter dropdowns
 */
export const useUniqueValues = (data: Transaction[]): UniqueValues => {
  return useMemo(() => {
    const categories = new Set<string>();
    const expenseCategories = new Set<string>();
    const accounts = new Set<string>();

    data.forEach((item) => {
      categories.add(item.category);
      accounts.add(item.account);
      if (item.type === "Expense") {
        expenseCategories.add(item.category);
      }
    });

    return {
      types: ["All", "Income", "Expense", "Transfer"],
      categories: ["All", ...Array.from(categories)],
      expenseCategories: Array.from(expenseCategories),
      accounts: ["All", ...Array.from(accounts)],
    };
  }, [data]);
};

/**
 * Filter and sort transactions based on user criteria
 */
export const useFilteredData = (
  data: Transaction[],
  filters: DataFilters,
  sortConfig: SortConfig
): Transaction[] => {
  return useMemo(() => {
    return data
      .filter((item) => {
        const searchTermLower = filters.searchTerm.toLowerCase();
        const itemDate = item.date;
        const startDate = filters.startDate ? new Date(filters.startDate) : null;
        const endDate = filters.endDate ? new Date(filters.endDate) : null;

        if (startDate) {
          startDate.setHours(0, 0, 0, 0);
        }
        if (endDate) {
          endDate.setHours(23, 59, 59, 999);
        }

        return (
          (item.category?.toLowerCase().includes(searchTermLower) ||
            item.subcategory?.toLowerCase().includes(searchTermLower) ||
            item.note?.toLowerCase().includes(searchTermLower) ||
            item.account?.toLowerCase().includes(searchTermLower)) &&
          (filters.type === "All" || item.type === filters.type) &&
          (filters.category === "All" || item.category === filters.category) &&
          (filters.account === "All" || item.account === filters.account) &&
          (!startDate || itemDate >= startDate) &&
          (!endDate || itemDate <= endDate)
        );
      })
      .sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Transaction];
        const bValue = b[sortConfig.key as keyof Transaction];

        if (aValue < bValue) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
  }, [data, filters, sortConfig]);
};
