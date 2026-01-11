/**
 * useTimeFilter - Reusable hook for time-based filtering
 */

import { useMemo, useState } from "react";
import type { Transaction } from "../../../../types";

interface UseTimeFilterOptions {
  initialYear?: number;
  initialMonth?: number;
  initialViewMode?: "month" | "year" | "decade";
}

export const useTimeFilter = (data: Transaction[], options: UseTimeFilterOptions = {}) => {
  const [currentYear, setCurrentYear] = useState(options.initialYear || new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(
    options.initialMonth || new Date().getMonth() + 1
  );
  const [viewMode, setViewMode] = useState(options.initialViewMode || "month");

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    data.forEach((item) => {
      if (item.date) {
        years.add(new Date(item.date).getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      if (!item.date) return false;
      const date = new Date(item.date);

      if (viewMode === "decade") {
        const decade = Math.floor(currentYear / 10) * 10;
        return date.getFullYear() >= decade && date.getFullYear() < decade + 10;
      } else if (viewMode === "year") {
        return date.getFullYear() === currentYear;
      } else {
        return date.getFullYear() === currentYear && date.getMonth() + 1 === currentMonth;
      }
    });
  }, [data, currentYear, currentMonth, viewMode]);

  return {
    currentYear,
    currentMonth,
    viewMode,
    availableYears,
    filteredData,
    setCurrentYear,
    setCurrentMonth,
    setViewMode,
  };
};

/**
 * useDataMode - Hook for regular vs cumulative data mode
 */
export const useDataMode = (initialMode: "regular" | "cumulative" = "regular") => {
  const [dataMode, setDataMode] = useState(initialMode);

  return {
    dataMode,
    setDataMode,
    isRegular: dataMode === "regular",
    isCumulative: dataMode === "cumulative",
  };
};

/**
 * useSimpleTimeFilter - Simple time-based filtering with custom options
 */
export const useSimpleTimeFilter = (
  data: Array<{ date?: string | Date; type?: string; category?: string }>,
  viewMode: "monthly" | "yearly" | "all-time",
  currentYear: number,
  currentMonth: number,
  options: {
    filterExpenses?: boolean;
    excludeInPocket?: boolean;
  } = {}
) => {
  return useMemo(() => {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: filtering logic is intentionally comprehensive
    return data.filter((item) => {
      if (!item.date) return false;

      // Apply custom filters
      if (options.filterExpenses && item.type !== "Expense") return false;
      if (options.excludeInPocket && item.category === "In-pocket") return false;

      const date = new Date(item.date);

      if (viewMode === "all-time") {
        return true;
      } else if (viewMode === "yearly") {
        return date.getFullYear() === currentYear;
      } else if (viewMode === "monthly") {
        return date.getFullYear() === currentYear && date.getMonth() + 1 === currentMonth;
      }
      return false;
    });
  }, [data, currentYear, currentMonth, viewMode, options.filterExpenses, options.excludeInPocket]);
};
