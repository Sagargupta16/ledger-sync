/**
 * NetWorthTrendChart - Shows cumulative net worth over time
 * Refactored to use shared components
 */

import React, { useMemo } from "react";
import type { Chart as ChartJS } from "chart.js";
import { Line } from "react-chartjs-2";
import { formatCurrency, truncateLabel } from "../../../../lib/formatters";
import type { Transaction } from "../../../../types";
import { aggregateByMonth } from "../chartHelpers";
import { MONTH_NAMES } from "../shared";

interface NetWorthTrendChartProps {
  filteredData: Transaction[];
  chartRef?: React.RefObject<ChartJS<"line", number[], unknown>>;
}

export const NetWorthTrendChart: React.FC<NetWorthTrendChartProps> = ({
  filteredData,
  chartRef,
}) => {
  const [viewMode, setViewMode] = React.useState("all-time");
  const [currentYear, setCurrentYear] = React.useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = React.useState(new Date().getMonth() + 1);

  const _availableYears = useMemo(() => {
    const years = new Set<number>();
    filteredData.forEach((item) => {
      if (item.date) {
        years.add(new Date(item.date).getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [filteredData]);

  const timeFilteredData = useMemo(() => {
    return filteredData.filter((item) => {
      if (!item.date || item.category === "In-pocket") return false;
      const date = new Date(item.date);

      if (viewMode === "all-time") return true;
      if (viewMode === "year") return date.getFullYear() === currentYear;
      if (viewMode === "month") {
        return date.getFullYear() === currentYear && date.getMonth() + 1 === currentMonth;
      }
      return false;
    });
  }, [filteredData, currentYear, currentMonth, viewMode]);

  const chartData = useMemo(() => {
    const dailyData = timeFilteredData
      .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
      .reduce(
        (acc, transaction) => {
          const date = new Date(transaction.date as string);
          const dateKey = date.toISOString().split("T")[0];

          if (!acc[dateKey]) {
            acc[dateKey] = { income: 0, expense: 0, date };
          }

          if (transaction.type === "Income") {
            acc[dateKey].income += transaction.amount || 0;
          } else if (transaction.type === "Expense") {
            acc[dateKey].expense += transaction.amount || 0;
          }

          return acc;
        },
        {} as Record<string, { income: number; expense: number; date: Date }>
      );

    const sortedDates = Object.keys(dailyData).sort((a, b) => a.localeCompare(b));

    let cumulativeNetWorth = 0;
    const netWorthData = sortedDates.map((dateKey) => {
      const dayData = dailyData[dateKey];
      const dailyNetChange = dayData.income - dayData.expense;
      cumulativeNetWorth += dailyNetChange;

      return {
        date: dateKey,
        netWorth: cumulativeNetWorth,
        dailyIncome: dayData.income,
        dailyExpense: dayData.expense,
        dailyNet: dailyNetChange,
      };
    });

    const formatLabel = (dateString: string, _index: number, total: number) => {
      const date = new Date(dateString);

      if (viewMode === "month") return date.getDate().toString();
      if (viewMode === "year") {
        const shortMonths = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        return shortMonths[date.getMonth()];
      }
      if (total > 50) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }
      const shortMonths = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return `${shortMonths[date.getMonth()]} ${date.getFullYear()}`;
    };

    let aggregatedData = netWorthData;

    if (
      (viewMode === "year" && netWorthData.length > 12) ||
      (viewMode === "all-time" && netWorthData.length > 50)
    ) {
      aggregatedData = aggregateByMonth(netWorthData);
    }

    return {
      labels: aggregatedData.map((item, index) =>
        formatLabel(item.date, index, aggregatedData.length)
      ),
      datasets: [
        {
          label: "Net Worth",
          data: aggregatedData.map((item) => item.netWorth),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: "#10b981",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };
  }, [timeFilteredData, viewMode]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" as const },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#111827",
          titleColor: "#ffffff",
          bodyColor: "#e5e7eb",
          borderColor: "#374151",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (context: { parsed: { y: number } }) =>
              `Net Worth: ${formatCurrency(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#9ca3af",
            font: { size: 10 },
            maxRotation: 45,
            callback: (value: string | number) => truncateLabel(String(value), 12),
          },
          grid: { color: "#374151" },
        },
        y: {
          ticks: {
            color: "#9ca3af",
            callback: (value: string | number) => formatCurrency(Number(value)),
          },
          grid: { color: "#374151" },
        },
      },
    }),
    []
  );

  const handlePrevious = () => {
    if (viewMode === "month") {
      if (currentMonth === 1) {
        setCurrentMonth(12);
        setCurrentYear(currentYear - 1);
      } else {
        setCurrentMonth(currentMonth - 1);
      }
    } else if (viewMode === "year") {
      setCurrentYear(currentYear - 1);
    }
  };

  const handleNext = () => {
    if (viewMode === "month") {
      if (currentMonth === 12) {
        setCurrentMonth(1);
        setCurrentYear(currentYear + 1);
      } else {
        setCurrentMonth(currentMonth + 1);
      }
    } else if (viewMode === "year") {
      setCurrentYear(currentYear + 1);
    }
  };

  const getDisplayTitle = () => {
    if (viewMode === "all-time") return "Net Worth Progression (All Time)";
    if (viewMode === "year") return `Net Worth Progression (${currentYear})`;
    return `Net Worth Progression (${MONTH_NAMES[currentMonth - 1]} ${currentYear})`;
  };

  return (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg h-[450px] flex flex-col lg:col-span-2">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-white">{getDisplayTitle()}</h3>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => setViewMode("all-time")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === "all-time"
              ? "bg-blue-600 text-white"
              : "bg-gray-700/50 text-gray-300 hover:bg-gray-600"
          }`}
        >
          All Time
        </button>
        <button
          type="button"
          onClick={() => setViewMode("year")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === "year"
              ? "bg-blue-600 text-white"
              : "bg-gray-700/50 text-gray-300 hover:bg-gray-600"
          }`}
        >
          Year
        </button>
        <button
          type="button"
          onClick={() => setViewMode("month")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === "month"
              ? "bg-blue-600 text-white"
              : "bg-gray-700/50 text-gray-300 hover:bg-gray-600"
          }`}
        >
          Month
        </button>

        {viewMode !== "all-time" && (
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={handlePrevious}
              className="px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600 text-gray-300"
            >
              ←
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-600 text-gray-300"
            >
              →
            </button>
          </div>
        )}
      </div>

      <div className="flex-grow relative">
        <Line ref={chartRef} data={chartData} options={chartOptions} />
      </div>
    </div>
  );
};
