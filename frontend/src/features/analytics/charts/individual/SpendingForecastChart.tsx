import React from "react";
import type { Chart as ChartJS, ChartData } from "chart.js";
import { Line } from "react-chartjs-2";
import { formatCurrency } from "../../../../lib/formatters";
import { comprehensiveForecast } from "../chartHelpers";

interface SpendingForecastChartProps {
  filteredData: Array<{
    date: string | Date;
    type: string;
    category?: string;
    amount: number;
  }>;
  chartRef: React.RefObject<ChartJS<"line", number[], string>>;
}

export const SpendingForecastChart: React.FC<SpendingForecastChartProps> = ({
  filteredData,
  chartRef,
}) => {
  const [forecastMonths, setForecastMonths] = React.useState(6);
  const [forecastType, setForecastType] = React.useState("best");
  const [showConfidence, setShowConfidence] = React.useState(true);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex but stable data prep
  const { chartData, forecastInfo } = React.useMemo(() => {
    const monthlyData: Record<string, { income: number; expense: number; net: number }> = {};
    filteredData.forEach((item) => {
      if (item.category === "In-pocket") {
        return;
      }

      const date = new Date(item.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expense: 0, net: 0 };
      }

      if (item.type === "Income") {
        monthlyData[monthKey].income += item.amount;
      } else if (item.type === "Expense") {
        monthlyData[monthKey].expense += item.amount;
      }

      monthlyData[monthKey].net = monthlyData[monthKey].income - monthlyData[monthKey].expense;
    });

    const historicalMonths = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b));
    const lastMonth = historicalMonths.at(-1);

    // Prepare data for advanced forecasting
    const historicalNet = historicalMonths.map((m) => monthlyData[m].net);

    // Use comprehensive forecasting
    const netForecast = comprehensiveForecast(historicalNet, forecastMonths);

    // Select forecast based on type
    let selectedNetForecast = netForecast?.best.forecast || [];
    let selectedNetConfidence = netForecast?.best.confidence || null;
    const forecastMethod = netForecast?.best.method || "simple";

    if (forecastType === "simple") {
      selectedNetForecast = netForecast?.simple.forecast || [];
      selectedNetConfidence = null;
    } else if (forecastType === "exponential") {
      selectedNetForecast = netForecast?.exponential.forecast || [];
      selectedNetConfidence = null;
    } else if (forecastType === "regression") {
      selectedNetForecast = netForecast?.regression.forecast || [];
      selectedNetConfidence = null;
    }

    const futureMonths: string[] = [];
    if (lastMonth) {
      const currentDate = new Date(`${lastMonth}-01`);
      for (let i = 0; i < forecastMonths; i++) {
        currentDate.setMonth(currentDate.getMonth() + 1);
        const monthKey = `${currentDate.getFullYear()}-${String(
          currentDate.getMonth() + 1
        ).padStart(2, "0")}`;
        futureMonths.push(monthKey);
      }
    }

    const allMonths = [...historicalMonths.slice(-12), ...futureMonths];
    const labels = allMonths.map((month) => {
      const [year, monthNum] = month.split("-");
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
      return `${monthNames[Number.parseInt(monthNum, 10) - 1]} ${year}`;
    });

    const historicalNetDisplay = historicalMonths
      .slice(-12)
      .map((month) => monthlyData[month]?.net || 0);

    const datasets: ChartData<"line", number[], string>["datasets"] = [
      {
        label: "Historical Net Cash Flow",
        data: [...historicalNetDisplay, ...new Array(forecastMonths).fill(null)],
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        borderWidth: 3,
        fill: false,
        tension: 0.3,
      },
      {
        label: `Forecast (${forecastMethod})`,
        data: [...new Array(historicalNetDisplay.length).fill(null), ...selectedNetForecast],
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.1)",
        borderWidth: 3,
        borderDash: [5, 5],
        fill: false,
        tension: 0.3,
      },
    ];

    // Add confidence intervals if available and enabled
    if (showConfidence && selectedNetConfidence && forecastType === "best") {
      datasets.push(
        {
          label: "Upper Bound (95%)",
          data: [
            ...new Array(historicalNetDisplay.length).fill(null),
            ...selectedNetConfidence.upper,
          ],
          borderColor: "rgba(245, 158, 11, 0.3)",
          backgroundColor: "rgba(245, 158, 11, 0.05)",
          borderWidth: 1,
          borderDash: [2, 2],
          fill: "+1",
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: "Lower Bound (95%)",
          data: [
            ...new Array(historicalNetDisplay.length).fill(null),
            ...selectedNetConfidence.lower,
          ],
          borderColor: "rgba(245, 158, 11, 0.3)",
          backgroundColor: "rgba(245, 158, 11, 0.05)",
          borderWidth: 1,
          borderDash: [2, 2],
          fill: false,
          tension: 0.3,
          pointRadius: 0,
        }
      );
    }

    return {
      chartData: { labels, datasets },
      forecastInfo: {
        method: forecastMethod,
        volatility: netForecast?.volatility,
        dataQuality: netForecast?.dataQuality,
        outliers: netForecast?.outliers || 0,
      },
    };
  }, [filteredData, forecastMonths, forecastType, showConfidence]);

  return (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg h-[500px] flex flex-col lg:col-span-2">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="text-xl font-semibold text-white">Advanced Spending Forecast</h3>
          {forecastInfo && (
            <div className="text-xs text-gray-400 mt-1">
              Method: {forecastInfo.method} | Volatility: {forecastInfo.volatility?.level || "N/A"}{" "}
              | R²: {(forecastInfo.dataQuality?.r2 || 0).toFixed(2)} | Outliers:{" "}
              {forecastInfo.outliers}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={forecastMonths}
            onChange={(e) => setForecastMonths(Number.parseInt(e.target.value, 10))}
            className="bg-gray-700 text-white px-2 py-1 rounded-lg text-xs"
          >
            <option value={3}>3 Months</option>
            <option value={6}>6 Months</option>
            <option value={12}>12 Months</option>
          </select>
          <select
            value={forecastType}
            onChange={(e) => setForecastType(e.target.value)}
            className="bg-gray-700 text-white px-2 py-1 rounded-lg text-xs"
          >
            <option value="best">Best Fit</option>
            <option value="simple">Simple Avg</option>
            <option value="exponential">Exponential</option>
            <option value="regression">Regression</option>
          </select>
          <label className="flex items-center text-xs text-gray-300">
            <input
              type="checkbox"
              checked={showConfidence}
              onChange={(e) => setShowConfidence(e.target.checked)}
              className="mr-1"
            />{" "}
            CI
          </label>
          <button
            type="button"
            onClick={() => {
              if (chartRef?.current) {
                const canvas = chartRef.current.canvas;
                const url = canvas.toDataURL("image/png");
                const link = document.createElement("a");
                link.download = `spending-forecast-${forecastMonths}m.png`;
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
        <Line
          ref={chartRef}
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: { color: "#9ca3af", font: { size: 10 } },
                position: "bottom" as const,
              },
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
                  callback: (v: string | number) => formatCurrency(Number(v)),
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
