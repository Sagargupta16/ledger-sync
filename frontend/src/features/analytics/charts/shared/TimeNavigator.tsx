/**
 * TimeNavigator - Reusable time period selector
 * Handles year/month/decade navigation for charts
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";

interface TimeNavigatorProps {
  viewMode: "month" | "year" | "decade";
  currentYear: number;
  currentMonth?: number;
  availableYears: number[];
  onYearChange: (year: number) => void;
  onMonthChange?: (month: number) => void;
  monthNames?: string[];
}

export const TimeNavigator: React.FC<TimeNavigatorProps> = ({
  viewMode,
  currentYear,
  currentMonth,
  availableYears,
  onYearChange,
  onMonthChange,
  monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
}) => {
  const handlePrevPeriod = () => {
    if (viewMode === "month" && currentMonth && onMonthChange) {
      if (currentMonth === 1) {
        onMonthChange(12);
        onYearChange(currentYear - 1);
      } else {
        onMonthChange(currentMonth - 1);
      }
    } else if (viewMode === "year") {
      onYearChange(currentYear - 1);
    } else if (viewMode === "decade") {
      onYearChange(currentYear - 10);
    }
  };

  const handleNextPeriod = () => {
    if (viewMode === "month" && currentMonth && onMonthChange) {
      if (currentMonth === 12) {
        onMonthChange(1);
        onYearChange(currentYear + 1);
      } else {
        onMonthChange(currentMonth + 1);
      }
    } else if (viewMode === "year") {
      onYearChange(currentYear + 1);
    } else if (viewMode === "decade") {
      onYearChange(currentYear + 10);
    }
  };

  const getPeriodLabel = () => {
    if (viewMode === "month" && currentMonth) {
      return `${monthNames[currentMonth - 1]} ${currentYear}`;
    }
    if (viewMode === "year") {
      return `${currentYear}`;
    }
    if (viewMode === "decade") {
      const decade = Math.floor(currentYear / 10) * 10;
      return `${decade}-${decade + 9}`;
    }
    return "";
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handlePrevPeriod}
        className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600 text-gray-300 transition-colors"
        title="Previous period"
      >
        <ChevronLeft size={18} />
      </button>

      {viewMode === "month" && currentMonth && onMonthChange && (
        <select
          value={currentMonth}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          className="px-3 py-1.5 rounded-lg bg-gray-700/50 text-white border border-gray-600 hover:border-gray-500 transition-colors"
        >
          {monthNames.map((month, idx) => (
            <option key={month} value={idx + 1}>
              {month}
            </option>
          ))}
        </select>
      )}

      <select
        value={currentYear}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="px-3 py-1.5 rounded-lg bg-gray-700/50 text-white border border-gray-600 hover:border-gray-500 transition-colors"
      >
        {availableYears.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>

      <span className="px-3 py-1.5 text-sm text-gray-400 font-medium min-w-[140px] text-center">
        {getPeriodLabel()}
      </span>

      <button
        type="button"
        onClick={handleNextPeriod}
        className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600 text-gray-300 transition-colors"
        title="Next period"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
};
