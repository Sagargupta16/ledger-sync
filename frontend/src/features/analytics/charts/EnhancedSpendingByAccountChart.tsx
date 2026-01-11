import type { Chart as ChartJS, TooltipItem } from "chart.js";
import React from "react";
import { Doughnut } from "react-chartjs-2";
import { formatCurrency, truncateLabel } from "../../../lib/formatters";
import type { Transaction } from "../../../types";
import { useTimeNavigation } from "./useChartHooks";

interface ChartComponentProps {
  filteredData: Transaction[];
  chartRef?: React.RefObject<ChartJS<"doughnut"> | null>;
}

export const EnhancedSpendingByAccountChart = ({ filteredData, chartRef }: ChartComponentProps) => {
  const {
    currentYear,
    currentMonth,
    viewMode,
    setViewMode,
    handlePrevious,
    handleNext,
    canGoPrevious,
    canGoNext,
  } = useTimeNavigation(filteredData, "all-time");

  const timeFilteredData = React.useMemo(() => {
    return filteredData.filter((item) => {
      if (!item.date || item.type !== "Expense") {
        return false;
      }
      const date = new Date(item.date);

      if (viewMode === "all-time") {
        return true;
      } else if (viewMode === "year") {
        return date.getFullYear() === currentYear;
      } else if (viewMode === "month") {
        return date.getFullYear() === currentYear && date.getMonth() + 1 === currentMonth;
      }
      return false;
    });
  }, [filteredData, currentYear, currentMonth, viewMode]);

  const chartData = React.useMemo(() => {
    const spending = timeFilteredData.reduce(
      (acc, item) => {
        acc[item.account] = (acc[item.account] || 0) + item.amount;
        return acc;
      },
      {} as Record<string, number>
    );

    const sorted = Object.entries(spending).sort(([, a], [, b]) => b - a);

    const colors = [
      "#3b82f6",
      "#8b5cf6",
      "#ec4899",
      "#f97316",
      "#eab308",
      "#10b981",
      "#ef4444",
      "#06b6d4",
      "#84cc16",
      "#f59e0b",
      "#8b5a2b",
      "#6b7280",
    ];

    const hoverColors = [
      "#60a5fa",
      "#a78bfa",
      "#f472b6",
      "#fb923c",
      "#fbbf24",
      "#34d399",
      "#f87171",
      "#22d3ee",
      "#a3e635",
      "#fbbf24",
      "#a3a3a3",
      "#9ca3af",
    ];

    return {
      labels: sorted.map(([account]) => truncateLabel(account, 12)),
      datasets: [
        {
          data: sorted.map(([, amount]) => amount),
          backgroundColor: colors.slice(0, sorted.length),
          hoverBackgroundColor: hoverColors.slice(0, sorted.length),
          borderColor: "#1f2937",
          borderWidth: 3,
          hoverBorderWidth: 4,
          hoverBorderColor: "#ffffff",
        },
      ],
    };
  }, [timeFilteredData]);

  const enhancedDoughnutOptions = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: "#d1d5db",
            font: {
              size: 12,
              weight: "500",
              family: "Inter, system-ui, sans-serif",
            },
            padding: 15,
            usePointStyle: true,
            pointStyle: "circle",
            boxWidth: 12,
            boxHeight: 12,
            generateLabels: (chart: ChartJS<"doughnut">) => {
              const data = chart.data;
              if (!data.labels.length || !data.datasets.length) {
                return [];
              }

              const dataset = data.datasets[0];
              const total = dataset.data.reduce((sum: number, val: number) => sum + val, 0);

              return data.labels.map((label: string, i: number) => {
                const value = dataset.data[i];
                const percentage = ((value / total) * 100).toFixed(1);
                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: dataset.backgroundColor[i],
                  strokeStyle: dataset.borderColor,
                  pointStyle: "circle",
                  hidden: false,
                  index: i,
                };
              });
            },
          },
        },
        tooltip: {
          backgroundColor: "#111827",
          titleColor: "#ffffff",
          bodyColor: "#e5e7eb",
          borderColor: "#374151",
          borderWidth: 1,
          cornerRadius: 12,
          displayColors: true,
          padding: 12,
          titleFont: {
            size: 14,
            weight: "600",
          },
          bodyFont: {
            size: 13,
            weight: "500",
          },
          callbacks: {
            title: (tooltipItems: TooltipItem<"doughnut">[]) => {
              return `Account: ${tooltipItems[0].label}`;
            },
            label: (context: TooltipItem<"doughnut">) => {
              const value = context.parsed;
              const total = context.dataset.data.reduce((sum: number, val: number) => sum + val, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return [`Amount: ${formatCurrency(value)}`, `Percentage: ${percentage}%`];
            },
          },
        },
      },
      cutout: "60%",
      radius: "90%",
      animation: {
        animateRotate: true,
        animateScale: true,
        duration: 1000,
      },
    }),
    []
  );

  const formatMonthLabel = (monthString: number) => {
    const monthNames = [
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
    ];
    return monthNames[monthString - 1];
  };

  const getDisplayTitle = () => {
    if (viewMode === "all-time") {
      return "Spending by Account (All Time)";
    } else if (viewMode === "year") {
      return `Spending by Account (${currentYear})`;
    } else if (viewMode === "month") {
      return `Spending by Account (${formatMonthLabel(currentMonth)} ${currentYear})`;
    }
    return "Spending by Account";
  };

  const totalSpending = React.useMemo(() => {
    return timeFilteredData.reduce((sum, item) => sum + item.amount, 0);
  }, [timeFilteredData]);

  return (
    <div className="group relative bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 p-6 rounded-2xl shadow-xl hover:shadow-2xl border border-gray-700 hover:border-gray-600 transition-all duration-500 h-[450px] flex flex-col overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-purple-600/5 to-pink-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>

      {/* Floating orbs */}
      <div className="absolute -top-10 -right-10 w-20 h-20 bg-gradient-to-br from-blue-500/10 to-purple-600/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
      <div className="absolute -bottom-10 -left-10 w-16 h-16 bg-gradient-to-br from-purple-500/10 to-pink-600/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000 delay-300"></div>

      <div className="relative z-10 flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-white group-hover:text-gray-100 transition-colors duration-300">
          {getDisplayTitle()}
        </h3>
        <button
          type="button"
          onClick={() => {
            if (chartRef?.current) {
              const canvas = chartRef.current.canvas;
              const url = canvas.toDataURL("image/png");
              const link = document.createElement("a");
              const fileName = `spending-by-account-${viewMode}-${currentYear}${
                viewMode === "month" ? `-${currentMonth}` : ""
              }.png`;
              link.download = fileName;
              link.href = url;
              link.click();
            }
          }}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-xl transition-all duration-300 hover:scale-110 transform"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>Download Chart</title>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>

      {/* View Mode Selector */}
      <div className="relative z-10 flex space-x-2 mb-4">
        {["month", "year", "all-time"].map((mode) => (
          <button
            type="button"
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 transform hover:scale-105 ${
              viewMode === mode
                ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/25"
                : "bg-gradient-to-r from-gray-700 to-gray-800 text-gray-300 hover:from-gray-600 hover:to-gray-700 border border-gray-600"
            }`}
          >
            {mode === "all-time" ? "All Time" : mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Navigation Controls */}
      {viewMode !== "all-time" && (
        <div className="relative z-10 flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={!canGoPrevious()}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700/50 rounded-xl transition-all duration-300 hover:scale-110 transform disabled:transform-none"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <title>Previous</title>
              <polyline points="15,18 9,12 15,6"></polyline>
            </svg>
          </button>
          <span className="text-gray-300 font-medium px-4 py-2 bg-gradient-to-r from-gray-700 to-gray-800 rounded-xl border border-gray-600">
            {viewMode === "month" && `${formatMonthLabel(currentMonth)} ${currentYear}`}
            {viewMode === "year" && currentYear}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext()}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700/50 rounded-xl transition-all duration-300 hover:scale-110 transform disabled:transform-none"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <title>Next</title>
              <polyline points="9,18 15,12 9,6"></polyline>
            </svg>
          </button>
        </div>
      )}

      {/* Total Spending Display */}
      <div className="relative z-10 text-center mb-4 p-4 bg-gradient-to-r from-gray-800/50 to-gray-900/50 rounded-xl border border-gray-700/50">
        <div className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors duration-300">
          Total Spending
        </div>
        <div className="text-2xl font-bold text-white group-hover:text-gray-100 transition-colors duration-300">
          {formatCurrency(totalSpending)}
        </div>
      </div>

      {/* Chart Container */}
      <div className="relative z-10 flex-1 relative bg-gradient-to-br from-gray-900/50 to-gray-800/50 rounded-xl p-4 border border-gray-700/50">
        {chartData.labels.length > 0 ? (
          <Doughnut ref={chartRef} data={chartData} options={enhancedDoughnutOptions} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">📊</div>
              <div>No spending data available</div>
              <div className="text-sm">for the selected period</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-700 origin-center"></div>
    </div>
  );
};
