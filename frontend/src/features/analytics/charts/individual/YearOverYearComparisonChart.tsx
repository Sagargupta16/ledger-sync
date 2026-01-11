import React from "react";
import { Line } from "react-chartjs-2";
import { formatCurrency } from "../../../../lib/formatters";
import type { Transaction } from "../../../../types";
import { CHART_COLORS } from "../shared";

interface YearOverYearComparisonChartProps {
  filteredData: Transaction[];
  chartRef: React.RefObject<unknown>;
}

const processTransactionData = (
  data: Transaction[],
  years: Set<number>,
  type: "monthly" | "quarterly"
) => {
  const groupedData: Record<number, Record<number, { income: number; expense: number }>> = {};

  data.forEach((item) => {
    if (item.category === "In-pocket") {
      return;
    }

    const date = new Date(item.date);
    const year = date.getFullYear();

    if (!years.has(year)) {
      return;
    }

    const periodKey =
      type === "monthly" ? date.getMonth() + 1 : Math.floor(date.getMonth() / 3) + 1;

    if (!groupedData[year]) {
      groupedData[year] = {};
    }
    if (!groupedData[year][periodKey]) {
      groupedData[year][periodKey] = { income: 0, expense: 0 };
    }

    if (item.type === "Income") {
      groupedData[year][periodKey].income += item.amount;
    } else if (item.type === "Expense") {
      groupedData[year][periodKey].expense += item.amount;
    }
  });

  return groupedData;
};

export const YearOverYearComparisonChart: React.FC<YearOverYearComparisonChartProps> = ({
  filteredData,
  chartRef,
}) => {
  const [comparisonType, setComparisonType] = React.useState<"monthly" | "quarterly">("monthly");
  const [selectedYears, setSelectedYears] = React.useState<Set<number>>(new Set());

  const availableYears = React.useMemo(() => {
    const years = new Set<number>();
    filteredData.forEach((item) => {
      if (item.date) {
        years.add(new Date(item.date).getFullYear());
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [filteredData]);

  React.useEffect(() => {
    if (availableYears.length > 0 && selectedYears.size === 0) {
      const recentYears = availableYears.slice(0, 3);
      setSelectedYears(new Set(recentYears));
    }
  }, [availableYears, selectedYears.size]);

  const chartData = React.useMemo(() => {
    if (selectedYears.size === 0) {
      return { labels: [], datasets: [] };
    }

    const groupedData = processTransactionData(filteredData, selectedYears, comparisonType);

    const labels =
      comparisonType === "monthly"
        ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        : ["Q1", "Q2", "Q3", "Q4"];

    const datasets = [];
    Array.from(selectedYears)
      .sort((a, b) => a - b)
      .forEach((year, yearIndex) => {
        datasets.push({
          label: `${year} Net`,
          data: labels.map((_, index) => {
            const periodData = groupedData[year]?.[index + 1];
            return periodData ? periodData.income - periodData.expense : 0;
          }),
          borderColor: CHART_COLORS[yearIndex % CHART_COLORS.length],
          backgroundColor: `${CHART_COLORS[yearIndex % CHART_COLORS.length]}20`,
          borderWidth: 3,
          fill: false,
          tension: 0.3,
        });
      });

    return { labels, datasets };
  }, [filteredData, selectedYears, comparisonType]);

  const toggleYear = (year: number) => {
    const newSelected = new Set(selectedYears);
    if (newSelected.has(year)) {
      newSelected.delete(year);
    } else {
      newSelected.add(year);
    }
    setSelectedYears(newSelected);
  };

  return (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg h-[450px] flex flex-col lg:col-span-2">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-white">Year-over-Year Comparison</h3>
        <div className="flex items-center space-x-4">
          <select
            value={comparisonType}
            onChange={(e) => setComparisonType(e.target.value as "monthly" | "quarterly")}
            className="bg-gray-700 text-white px-3 py-1 rounded-lg text-sm"
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
          <button
            type="button"
            onClick={() => {
              if (chartRef?.current) {
                const canvas = chartRef.current.canvas;
                const url = canvas.toDataURL("image/png");
                const link = document.createElement("a");
                link.download = `year-over-year-${comparisonType}.png`;
                link.href = url;
                link.click();
              }
            }}
            className="text-gray-400 hover:text-white"
            aria-label="Download chart as PNG"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              role="img"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7,10 12,15 17,10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Year Selection */}
      <div className="mb-4">
        <div className="text-sm text-gray-400 mb-2">Select Years to Compare:</div>
        <div className="flex flex-wrap gap-2">
          {availableYears.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => toggleYear(year)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                selectedYears.has(year)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative">
        <Line
          ref={chartRef}
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: "#9ca3af" } },
              tooltip: {
                backgroundColor: "#111827",
                titleColor: "#ffffff",
                bodyColor: "#e5e7eb",
                callbacks: {
                  label: (context) =>
                    `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
                },
              },
            },
            scales: {
              x: {
                ticks: {
                  color: "#9ca3af",
                  font: { size: 10 },
                  maxRotation: 45,
                  maxTicksLimit: 12,
                },
                grid: { color: "#374151" },
              },
              y: {
                ticks: {
                  color: "#9ca3af",
                  callback: (v: number | string) => formatCurrency(Number(v)),
                },
                grid: { color: "#374151" },
              },
            },
          }}
        />
      </div>
    </div>
  );
};
