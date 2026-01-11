import React from "react";
import type { Chart as ChartJS } from "chart.js";
import { Line } from "react-chartjs-2";
import { formatCurrency } from "../../../../lib/formatters";
import { aggregateByMonth, truncateLabel } from "../chartHelpers";
import { TimeNavigator, useSimpleTimeFilter, ViewModeToggle } from "../shared";

interface CumulativeCategoryTrendChartProps {
  filteredData: Array<{
    date: string | Date;
    type: string;
    category?: string;
    amount: number;
  }>;
  chartRef: React.RefObject<ChartJS<"line", number[], unknown>>;
}

export const CumulativeCategoryTrendChart: React.FC<CumulativeCategoryTrendChartProps> = ({
  filteredData,
  chartRef,
}) => {
  const [viewMode, setViewMode] = React.useState<"monthly" | "yearly" | "all-time">("yearly");
  const [currentYear, setCurrentYear] = React.useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = React.useState(new Date().getMonth() + 1);
  const [selectedCategories, setSelectedCategories] = React.useState(new Set<string>());

  const availableYears = React.useMemo(() => {
    const years = new Set<number>();
    filteredData.forEach((item) => {
      if (item.date) {
        years.add(new Date(item.date).getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [filteredData]);

  const availableCategories = React.useMemo(() => {
    const categories = new Set<string>();
    filteredData.forEach((item) => {
      if (item.type === "Expense" && item.category && item.category !== "In-pocket") {
        categories.add(item.category);
      }
    });
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [filteredData]);

  React.useEffect(() => {
    if (availableCategories.length > 0 && selectedCategories.size === 0) {
      const categoryTotals = availableCategories.map((category) => {
        const total = filteredData
          .filter((item) => item.type === "Expense" && item.category === category)
          .reduce((sum, item) => sum + item.amount, 0);
        return { category, total };
      });

      const sortedCategories = categoryTotals.sort((a, b) => b.total - a.total);
      const top5Categories = sortedCategories.slice(0, 5).map((item) => item.category);

      setSelectedCategories(new Set(top5Categories));
    }
  }, [availableCategories, filteredData, selectedCategories.size]);

  const timeFilteredData = useSimpleTimeFilter(filteredData, viewMode, currentYear, currentMonth, {
    filterExpenses: true,
    excludeInPocket: true,
  });

  const chartData = React.useMemo(() => {
    if (selectedCategories.size === 0) {
      return { labels: [], datasets: [] };
    }

    const dailyData: Record<string, Record<string, number>> = {};

    timeFilteredData
      .filter((item) => selectedCategories.has(item.category))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach((transaction) => {
        const date =
          transaction.date instanceof Date ? transaction.date : new Date(transaction.date);
        const dateKey = date.toISOString().split("T")[0];

        if (!dailyData[dateKey]) {
          dailyData[dateKey] = {};
          selectedCategories.forEach((category) => {
            dailyData[dateKey][category] = 0;
          });
        }

        dailyData[dateKey][transaction.category] += transaction.amount;
      });

    const sortedDates = Object.keys(dailyData).sort((a, b) => a.localeCompare(b));

    const cumulativeData: Record<string, number> = {};
    selectedCategories.forEach((category) => {
      cumulativeData[category] = 0;
    });

    const processedData = sortedDates.map((dateKey) => {
      const dayData = dailyData[dateKey];
      const result: Record<string, number | string> = { date: dateKey };

      selectedCategories.forEach((category) => {
        cumulativeData[category] += dayData[category] || 0;
        result[category] = cumulativeData[category];
      });

      return result;
    });

    const formatLabel = (dateString: string, _index: number, total: number) => {
      const date = new Date(dateString);

      if (viewMode === "monthly") {
        return date.getDate().toString();
      } else if (viewMode === "yearly") {
        const monthNames = [
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
        return monthNames[date.getMonth()];
      }
      if (total > 50) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }
      const monthNames = [
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
      return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    };

    let aggregatedData = processedData;

    // Aggregate data by month for better readability when there's too much data
    if (
      (viewMode === "yearly" && processedData.length > 12) ||
      (viewMode === "all-time" && processedData.length > 50)
    ) {
      aggregatedData = aggregateByMonth(processedData);
    }

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

    const datasets = Array.from(selectedCategories).map((category, index) => ({
      label: category,
      data: aggregatedData.map((item) => item[category] || 0),
      borderColor: colors[index % colors.length],
      backgroundColor: `${colors[index % colors.length]}20`,
      borderWidth: 2,
      fill: false,
      tension: 0.3,
      pointBackgroundColor: colors[index % colors.length],
      pointBorderColor: "#ffffff",
      pointBorderWidth: 1,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: colors[index % colors.length],
      pointHoverBorderColor: "#ffffff",
      pointHoverBorderWidth: 2,
    }));

    return {
      labels: aggregatedData.map((item, index) =>
        formatLabel(item.date, index, aggregatedData.length)
      ),
      datasets,
    };
  }, [timeFilteredData, viewMode, selectedCategories]);

  const cumulativeChartOptions = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index" as const,
      },
      plugins: {
        legend: {
          position: "top" as const,
          labels: {
            color: "#d1d5db",
            font: {
              size: 11,
              weight: "500" as const,
            },
            padding: 12,
            usePointStyle: true,
            pointStyle: "circle" as const,
            boxWidth: 10,
            boxHeight: 10,
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
            weight: "600" as const,
          },
          bodyFont: {
            size: 13,
            weight: "500" as const,
          },
          callbacks: {
            title: (tooltipItems) => {
              return `Period: ${tooltipItems[0].label}`;
            },
            label: (context) => {
              const value = context.parsed.y;
              return `${context.dataset.label}: ${formatCurrency(value)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#9ca3af",
            font: { size: 10 },
            maxRotation: 45,
            maxTicksLimit: (() => {
              if (viewMode === "monthly") {
                return 31;
              }
              if (viewMode === "yearly") {
                return 12;
              }
              return 10;
            })(),
              callback: (value: string | number) => {
                return truncateLabel(String(value), 12);
              },
          },
          grid: {
            color: "#374151",
            drawOnChartArea: true,
          },
        },
        y: {
          ticks: {
            color: "#9ca3af",
              callback: (value: string | number) => formatCurrency(Number(value)),
          },
          grid: {
            color: "#374151",
          },
          beginAtZero: true,
        },
      },
    }),
    [viewMode]
  );

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

  const getDisplayTitle = () => {
    if (viewMode === "all-time") {
      return "Cumulative Category Spending Trends (All Time)";
    } else if (viewMode === "yearly") {
      return `Cumulative Category Spending Trends (${currentYear})`;
    } else if (viewMode === "monthly") {
      return `Cumulative Category Spending Trends (${monthNames[currentMonth - 1]} ${currentYear})`;
    }
    return "Cumulative Category Spending Trends";
  };

  const toggleCategory = (category: string) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(category)) {
      newSelected.delete(category);
    } else {
      newSelected.add(category);
    }
    setSelectedCategories(newSelected);
  };

  return (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg h-[500px] flex flex-col lg:col-span-2">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-white">{getDisplayTitle()}</h3>
        <button
          type="button"
          onClick={() => {
            if (chartRef?.current) {
              const canvas = chartRef.current.canvas;
              const url = canvas.toDataURL("image/png");
              const link = document.createElement("a");
              const fileName = `cumulative-category-trends-${viewMode}-${currentYear}${
                viewMode === "monthly" ? `-${currentMonth}` : ""
              }.png`;
              link.download = fileName;
              link.href = url;
              link.click();
            }
          }}
          className="text-gray-400 hover:text-white"
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
            <title>Download cumulative chart</title>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>

      <ViewModeToggle
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        modes={[
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: "Yearly" },
          { value: "all-time", label: "All Time" },
        ]}
      />

      <TimeNavigator
        viewMode={viewMode}
        currentYear={currentYear}
        currentMonth={currentMonth}
        monthNames={monthNames}
        availableYears={availableYears}
        onYearChange={setCurrentYear}
        onMonthChange={setCurrentMonth}
      />

      {/* Category Selection */}
      <div className="mb-4">
        <div className="text-sm text-gray-400 mb-2">Select Categories to Display:</div>
        <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
          {availableCategories.map((category) => (
            <button
              type="button"
              key={category}
              onClick={() => toggleCategory(category)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedCategories.has(category)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 relative">
        {chartData.labels.length > 0 && selectedCategories.size > 0 ? (
          <Line ref={chartRef} data={chartData} options={cumulativeChartOptions} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">📊</div>
              <div>
                {selectedCategories.size === 0
                  ? "Select categories to display"
                  : "No spending data available"}
              </div>
              <div className="text-sm">
                {selectedCategories.size === 0
                  ? "Choose from the categories above"
                  : "for the selected period"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
