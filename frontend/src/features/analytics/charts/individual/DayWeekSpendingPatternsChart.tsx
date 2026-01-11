import React from "react";
import type { Chart as ChartJS } from "chart.js";
import { Bar } from "react-chartjs-2";
import { formatCurrency } from "../../../../lib/formatters";

interface DayWeekSpendingPatternsChartProps {
  filteredData: Array<{
    date: string | Date;
    type: string;
    category?: string;
    amount: number;
  }>;
  chartRef: React.RefObject<ChartJS<"bar", number[], unknown>>;
}

export const DayWeekSpendingPatternsChart: React.FC<DayWeekSpendingPatternsChartProps> = ({
  filteredData,
  chartRef,
}) => {
  const [patternType, setPatternType] = React.useState<"dayOfWeek" | "dayOfMonth">("dayOfWeek");
  const [metricType, setMetricType] = React.useState<"expense" | "income" | "count">("expense");

  const chartData = React.useMemo(() => {
    const expenseData = filteredData.filter(
      (item) => item.type === "Expense" && item.category !== "In-pocket"
    );
    const incomeData = filteredData.filter((item) => item.type === "Income");

    if (patternType === "dayOfWeek") {
      const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const weekData = new Array(7).fill(0).map(() => ({ expense: 0, income: 0, count: 0 }));

      expenseData.forEach((item) => {
        const dayOfWeek = new Date(item.date).getDay();
        weekData[dayOfWeek].expense += item.amount;
        weekData[dayOfWeek].count += 1;
      });

      incomeData.forEach((item) => {
        const dayOfWeek = new Date(item.date).getDay();
        weekData[dayOfWeek].income += item.amount;
      });

      const labels = dayNames;
      let data: number[], backgroundColors: string[];

      if (metricType === "expense") {
        data = weekData.map((d) => d.expense);
        backgroundColors = dayNames.map((_, index) => {
          const intensity = Math.max(0.3, Math.min(1, data[index] / Math.max(...data)));
          return `rgba(239, 68, 68, ${intensity})`;
        });
      } else if (metricType === "income") {
        data = weekData.map((d) => d.income);
        backgroundColors = dayNames.map((_, index) => {
          const intensity = Math.max(0.3, Math.min(1, data[index] / Math.max(...data)));
          return `rgba(16, 185, 129, ${intensity})`;
        });
      } else {
        data = weekData.map((d) => d.count);
        backgroundColors = dayNames.map((_, index) => {
          const intensity = Math.max(0.3, Math.min(1, data[index] / Math.max(...data)));
          return `rgba(59, 130, 246, ${intensity})`;
        });
      }

      return {
        labels,
        datasets: [
          {
            label: (() => {
              if (metricType === "expense") {
                return "Total Expenses";
              }
              if (metricType === "income") {
                return "Total Income";
              }
              return "Transaction Count";
            })(),
            data,
            backgroundColor: backgroundColors,
            borderColor: (() => {
              if (metricType === "expense") {
                return "#ef4444";
              }
              if (metricType === "income") {
                return "#10b981";
              }
              return "#3b82f6";
            })(),
            borderWidth: 2,
          },
        ],
      };
    } else {
      const monthData = new Array(31).fill(0).map(() => ({ expense: 0, income: 0, count: 0 }));

      expenseData.forEach((item) => {
        const dayOfMonth = new Date(item.date).getDate() - 1;
        if (dayOfMonth >= 0 && dayOfMonth < 31) {
          monthData[dayOfMonth].expense += item.amount;
          monthData[dayOfMonth].count += 1;
        }
      });

      incomeData.forEach((item) => {
        const dayOfMonth = new Date(item.date).getDate() - 1;
        if (dayOfMonth >= 0 && dayOfMonth < 31) {
          monthData[dayOfMonth].income += item.amount;
        }
      });

      const labels = Array.from({ length: 31 }, (_, i) => (i + 1).toString());
      let data: number[], backgroundColors: string[];

      if (metricType === "expense") {
        data = monthData.map((d) => d.expense);
        backgroundColors = new Array(31).fill(0).map((_, index) => {
          const maxValue = Math.max(...data.filter((v) => v > 0));
          const intensity =
            data[index] > 0 ? Math.max(0.3, Math.min(1, data[index] / maxValue)) : 0.1;
          return `rgba(239, 68, 68, ${intensity})`;
        });
      } else if (metricType === "income") {
        data = monthData.map((d) => d.income);
        backgroundColors = new Array(31).fill(0).map((_, index) => {
          const maxValue = Math.max(...data.filter((v) => v > 0));
          const intensity =
            data[index] > 0 ? Math.max(0.3, Math.min(1, data[index] / maxValue)) : 0.1;
          return `rgba(16, 185, 129, ${intensity})`;
        });
      } else {
        data = monthData.map((d) => d.count);
        backgroundColors = new Array(31).fill(0).map((_, index) => {
          const maxValue = Math.max(...data.filter((v) => v > 0));
          const intensity =
            data[index] > 0 ? Math.max(0.3, Math.min(1, data[index] / maxValue)) : 0.1;
          return `rgba(59, 130, 246, ${intensity})`;
        });
      }

      return {
        labels,
        datasets: [
          {
            label: (() => {
              if (metricType === "expense") {
                return "Total Expenses";
              }
              if (metricType === "income") {
                return "Total Income";
              }
              return "Transaction Count";
            })(),
            data,
            backgroundColor: backgroundColors,
            borderColor: (() => {
              if (metricType === "expense") {
                return "#ef4444";
              }
              if (metricType === "income") {
                return "#10b981";
              }
              return "#3b82f6";
            })(),
            borderWidth: 1,
          },
        ],
      };
    }
  }, [filteredData, patternType, metricType]);

  return (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg h-[450px] flex flex-col lg:col-span-2">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-white">Spending Patterns</h3>
        <div className="flex items-center space-x-4">
          <select
            value={patternType}
            onChange={(e) => setPatternType(e.target.value as "dayOfWeek" | "dayOfMonth")}
            className="bg-gray-700 text-white px-3 py-1 rounded-lg text-sm"
          >
            <option value="dayOfWeek">Day of Week</option>
            <option value="dayOfMonth">Day of Month</option>
          </select>
          <select
            value={metricType}
            onChange={(e) => setMetricType(e.target.value as "expense" | "income" | "count")}
            className="bg-gray-700 text-white px-3 py-1 rounded-lg text-sm"
          >
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="count">Transaction Count</option>
          </select>
          <button
            type="button"
            onClick={() => {
              if (chartRef?.current) {
                const canvas = chartRef.current.canvas;
                const url = canvas.toDataURL("image/png");
                const link = document.createElement("a");
                link.download = `spending-patterns-${patternType}-${metricType}.png`;
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
            >
              <title>Download Chart</title>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7,10 12,15 17,10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        <Bar
          ref={chartRef}
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false,
              },
              tooltip: {
                backgroundColor: "#111827",
                titleColor: "#ffffff",
                bodyColor: "#e5e7eb",
                callbacks: {
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
                  maxRotation: patternType === "dayOfMonth" ? 45 : 0,
                  font: { size: patternType === "dayOfMonth" ? 9 : 10 },
                  maxTicksLimit: patternType === "dayOfMonth" ? 31 : 15,
                },
                grid: { color: "#374151" },
              },
              y: {
                ticks: {
                  color: "#9ca3af",
                  callback: (v: string | number) =>
                    metricType === "count" ? v : formatCurrency(Number(v)),
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
