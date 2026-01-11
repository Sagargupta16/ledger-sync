import type { Chart as ChartJS, TooltipItem } from "chart.js";
import React from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  ChartContainer,
  ExportButton,
  TimeNavigationControls,
} from "../../../components/data-display/ChartUIComponents";
import { formatCurrency, truncateLabel } from "../../../lib/formatters";
import type { Transaction } from "../../../types";
import { commonChartOptions } from "./ChartConfig";
import { useTimeNavigation } from "./useChartHooks";

interface EnhancedChartProps {
  filteredData: Transaction[];
  chartRef?: React.RefObject<ChartJS<"bar">>;
}

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

export const EnhancedTopExpenseCategoriesChart = ({
  filteredData,
  chartRef,
}: EnhancedChartProps) => {
  const {
    currentYear,
    currentMonth,
    viewMode,
    setViewMode,
    handlePrevious,
    handleNext,
    canGoPrevious,
    canGoNext,
    getFilteredData,
  } = useTimeNavigation(filteredData);

  const timeFilteredData = React.useMemo(() => {
    return getFilteredData().filter((item) => item.type === "Expense");
  }, [getFilteredData]);

  type ExpenseRow = { amount?: number; category?: string; type?: string };

  const chartData = React.useMemo(() => {
    const expenses = timeFilteredData.reduce<Record<string, number>>((acc, item: ExpenseRow) => {
      const key = String(item.category ?? "Uncategorized");
      acc[key] = (acc[key] || 0) + (Number(item.amount) || 0);
      return acc;
    }, {});

    const sorted = Object.entries(expenses)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return {
      labels: sorted.map(([category]) => truncateLabel(category, 10)),
      datasets: [
        {
          label: "Expenses",
          data: sorted.map(([, amount]) => amount),
          backgroundColor: "#3b82f6",
          borderRadius: 8,
        },
      ],
    };
  }, [timeFilteredData]);

  return (
    <ChartContainer title="Top Expense Categories">
      <TimeNavigationControls
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentPeriod={(() => {
          if (viewMode === "all-time") {
            return "All Time";
          }
          if (viewMode === "year") {
            return `Year ${currentYear}`;
          }
          return `${monthNames[currentMonth - 1]} ${currentYear}`;
        })()}
        onPrevious={handlePrevious}
        onNext={handleNext}
        canGoPrevious={canGoPrevious()}
        canGoNext={canGoNext()}
      />

      <ExportButton
        chartRef={chartRef}
        filename={`top-expenses-${viewMode}-${currentYear}${
          viewMode === "month" ? `-${currentMonth}` : ""
        }.png`}
      />

      <div className="text-sm text-gray-400 mb-4">{timeFilteredData.length} expenses</div>

      <div className="flex-grow">
        <Bar ref={chartRef} data={chartData} options={commonChartOptions} />
      </div>
    </ChartContainer>
  );
};

// Enhanced Top Income Sources Chart with time navigation
export const EnhancedTopIncomeSourcesChart = ({ filteredData, chartRef }: EnhancedChartProps) => {
  const {
    currentYear,
    currentMonth,
    viewMode,
    setViewMode,
    handlePrevious,
    handleNext,
    canGoPrevious,
    canGoNext,
    getFilteredData,
  } = useTimeNavigation(filteredData, "year");

  const timeFilteredData = React.useMemo(() => {
    return getFilteredData().filter(
      (item) => item.type === "Income" && item.category !== "In-pocket"
    );
  }, [getFilteredData]);

  type IncomeRow = { amount?: number; category?: string; type?: string };

  const chartData = React.useMemo(() => {
    const income = timeFilteredData.reduce<Record<string, number>>((acc, item: IncomeRow) => {
      const key = String(item.category ?? "Uncategorized");
      acc[key] = (acc[key] || 0) + (Number(item.amount) || 0);
      return acc;
    }, {});

    const sorted = Object.entries(income)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return {
      labels: sorted.map(([category]) => truncateLabel(category, 10)),
      datasets: [
        {
          label: "Income",
          data: sorted.map(([, amount]) => amount),
          backgroundColor: "#10b981",
          borderRadius: 8,
        },
      ],
    };
  }, [timeFilteredData]);

  return (
    <ChartContainer title="Top Income Sources">
      <TimeNavigationControls
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentPeriod={(() => {
          if (viewMode === "all-time") {
            return "All Time";
          }
          if (viewMode === "year") {
            return `Year ${currentYear}`;
          }
          return `${monthNames[currentMonth - 1]} ${currentYear}`;
        })()}
        onPrevious={handlePrevious}
        onNext={handleNext}
        canGoPrevious={canGoPrevious()}
        canGoNext={canGoNext()}
      />

      <ExportButton
        chartRef={chartRef}
        filename={`top-income-${viewMode}-${currentYear}${
          viewMode === "month" ? `-${currentMonth}` : ""
        }.png`}
      />

      <div className="text-sm text-gray-400 mb-4">{timeFilteredData.length} income entries</div>

      <div className="flex-grow">
        <Bar ref={chartRef} data={chartData} options={commonChartOptions} />
      </div>
    </ChartContainer>
  );
};

// Enhanced Subcategory Breakdown Chart with category selection
interface EnhancedSubcategoryBreakdownChartProps {
  filteredData: Transaction[];
  chartRef?: React.RefObject<ChartJS<"bar">>;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

export const EnhancedSubcategoryBreakdownChart = ({
  filteredData,
  chartRef,
  categories,
  selectedCategory,
  onCategoryChange,
}: EnhancedSubcategoryBreakdownChartProps) => {
  const {
    currentYear,
    currentMonth,
    viewMode,
    setViewMode,
    handlePrevious,
    handleNext,
    canGoPrevious,
    canGoNext,
    getFilteredData,
  } = useTimeNavigation(filteredData, "year");

  const timeFilteredData = React.useMemo(() => {
    return getFilteredData().filter(
      (item) =>
        item.type === "Expense" &&
        item.category === selectedCategory &&
        item.category !== "In-pocket" &&
        item.category !== "Transfer"
    );
  }, [getFilteredData, selectedCategory]);

  const chartData = React.useMemo(() => {
    const subcategories = timeFilteredData.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.subcategory ?? "Uncategorized");
      acc[key] = (acc[key] || 0) + (Number(item.amount) || 0);
      return acc;
    }, {});

    const sorted = Object.entries(subcategories)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return {
      labels: sorted.map(([subcategory]) => truncateLabel(subcategory, 15)),
      datasets: [
        {
          label: "Expense",
          data: sorted.map(([, amount]) => amount),
          backgroundColor: "#ef4444",
          borderRadius: 8,
        },
      ],
    };
  }, [timeFilteredData]);

  return (
    <ChartContainer title={`${selectedCategory} - Subcategory Breakdown`}>
      <div className="mb-4">
        <label
          className="block text-sm font-medium text-gray-400 mb-2"
          htmlFor="subcategory-category-select"
        >
          Category
        </label>
        <select
          id="subcategory-category-select"
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <TimeNavigationControls
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentPeriod={(() => {
          if (viewMode === "all-time") {
            return "All Time";
          }
          if (viewMode === "year") {
            return `Year ${currentYear}`;
          }
          return `${monthNames[currentMonth - 1]} ${currentYear}`;
        })()}
        onPrevious={handlePrevious}
        onNext={handleNext}
        canGoPrevious={canGoPrevious()}
        canGoNext={canGoNext()}
      />

      <ExportButton
        chartRef={chartRef}
        filename={`subcategory-breakdown-${selectedCategory}-${viewMode}-${currentYear}${
          viewMode === "month" ? `-${currentMonth}` : ""
        }.png`}
      />

      <div className="text-sm text-gray-400 mb-4">{timeFilteredData.length} expenses</div>

      <div className="flex-grow">
        <Bar
          ref={chartRef}
          data={chartData}
          options={{
            ...commonChartOptions,
            plugins: {
              ...commonChartOptions.plugins,
              tooltip: {
                callbacks: {
                  label: (context: TooltipItem<"bar">) =>
                    `${context.dataset.label}: ${formatCurrency(Number(context.parsed.y))}`,
                },
              },
            },
            scales: {
              ...commonChartOptions.scales,
              y: {
                ...commonChartOptions.scales?.y,
                ticks: {
                  ...commonChartOptions.scales?.y?.ticks,
                  callback: (value: number | string) => formatCurrency(Number(value)),
                },
              },
            },
          }}
        />
      </div>
    </ChartContainer>
  );
};

interface MultiCategoryTimeAnalysisChartProps {
  filteredData: Transaction[];
  chartRef?: React.RefObject<ChartJS<"bar">>;
}

export const MultiCategoryTimeAnalysisChart = ({
  filteredData,
  chartRef,
}: MultiCategoryTimeAnalysisChartProps) => {
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
  
  const categories = React.useMemo(() => {
    const cats = new Set<string>();
    filteredData.forEach((item) => {
      if (
        item.type === "Expense" &&
        item.category &&
        item.category !== "In-pocket" &&
        item.category !== "Transfer"
      ) {
        cats.add(item.category);
      }
    });
    return Array.from(cats).sort();
  }, [filteredData]);

  React.useEffect(() => {
    if (categories.length > 0 && selectedCategories.length === 0) {
      setSelectedCategories(categories.slice(0, 5));
    }
  }, [categories, selectedCategories.length]);

  const chartData = React.useMemo(() => {
    const monthlyData: Record<string, Record<string, number>> = {};
    
    filteredData.forEach((item) => {
      if (
        item.type === "Expense" &&
        item.category &&
        item.category !== "In-pocket" &&
        item.category !== "Transfer" &&
        selectedCategories.includes(item.category)
      ) {
        const dateStr = typeof item.date === "string" ? item.date : new Date(item.date).toISOString();
        const month = dateStr.substring(0, 7);
        if (!monthlyData[month]) {
          monthlyData[month] = {};
        }
        const cat = item.category;
        monthlyData[month][cat] = (monthlyData[month][cat] || 0) + item.amount;
      }
    });

    const months = Object.keys(monthlyData).sort();
    const datasets = selectedCategories.map((category, index) => ({
      label: category,
      data: months.map((month) => monthlyData[month]?.[category] || 0),
      backgroundColor: `hsl(${(index * 360) / selectedCategories.length}, 70%, 50%)`,
      borderRadius: 4,
    }));

    return {
      labels: months.map((m) => m.substring(5)),
      datasets,
    };
  }, [filteredData, selectedCategories]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h3 className="text-xl font-semibold mb-2">Multi-Category Time Analysis</h3>
        <p className="block text-sm font-medium text-gray-400 mb-2">
          Select Categories (max 10)
        </p>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => toggleCategory(category)}
              disabled={!selectedCategories.includes(category) && selectedCategories.length >= 10}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                selectedCategories.includes(category)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer chartRef={chartRef}>
        <Bar
          data={chartData}
          options={{
            ...commonChartOptions,
            plugins: {
              ...commonChartOptions.plugins,
              tooltip: {
                callbacks: {
                  label: (context: TooltipItem<"bar">) =>
                    `${context.dataset.label}: ${formatCurrency(Number(context.parsed.y))}`,
                },
              },
            },
            scales: {
              ...commonChartOptions.scales,
              y: {
                ...commonChartOptions.scales?.y,
                ticks: {
                  ...commonChartOptions.scales?.y?.ticks,
                  callback: (value: number | string) => formatCurrency(Number(value)),
                },
              },
            },
          }}
        />
      </ChartContainer>
    </div>
  );
};

// Account Balance Progression Chart
interface AccountBalanceProgressionChartProps {
  filteredData: Transaction[];
  chartRef?: React.RefObject<ChartJS<"line">>;
}

export const AccountBalanceProgressionChart = ({
  filteredData,
  chartRef,
}: AccountBalanceProgressionChartProps) => {
  const [selectedAccount, setSelectedAccount] = React.useState("all");
  const [viewMode, setViewMode] = React.useState("cumulative");
  const [showAverage, setShowAverage] = React.useState(true);

  const chartData = React.useMemo(() => {
    const accountData: Record<string, Record<string, { income: number; expense: number; balance: number }>> = {};
    const accounts = [...new Set(filteredData.map((item) => item.account))].filter(Boolean).sort((a, b) => a.localeCompare(b));

    accounts.forEach((account) => {
      accountData[account] = {};
    });

    // Helper to process each transaction
    const processTransaction = (item: Transaction) => {
      if (!item.account || item.category === "In-pocket") return;
      
      const dateStr = typeof item.date === "string" ? item.date : new Date(item.date).toISOString();
      const month = dateStr.substring(0, 7);

      if (!accountData[item.account][month]) {
        accountData[item.account][month] = { income: 0, expense: 0, balance: 0 };
      }

      if (item.type === "Income") {
        accountData[item.account][month].income += item.amount;
      } else if (item.type === "Expense") {
        accountData[item.account][month].expense += item.amount;
      }
    };

    filteredData.forEach(processTransaction);

    const allMonths = [...new Set(Object.values(accountData).flatMap((acc) => Object.keys(acc)))].sort((a, b) => a.localeCompare(b));

    accounts.forEach((account) => {
      let runningBalance = 0;
      allMonths.forEach((month) => {
        if (accountData[account][month]) {
          runningBalance += accountData[account][month].income - accountData[account][month].expense;
          accountData[account][month].balance = runningBalance;
        } else {
          accountData[account][month] = {
            income: 0,
            expense: 0,
            balance: runningBalance,
          };
        }
      });
    });

    const labels = allMonths.map((month) => {
      const [year, monthNum] = month.split("-");
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[Number.parseInt(monthNum, 10) - 1]} ${year}`;
    });

    const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

    if (selectedAccount === "all") {
      const datasets = accounts.map((account, index) => ({
        label: account,
        data: allMonths.map((month) => {
          const data = accountData[account][month];
          return viewMode === "cumulative" ? data.balance : data.income - data.expense;
        }),
        borderColor: colors[index % colors.length],
        backgroundColor: `${colors[index % colors.length]}20`,
        borderWidth: 2,
        fill: false,
        tension: 0.3,
      }));

      const totalPortfolioData = allMonths.map((month) => {
        const accountValues = accounts
          .map((account) => {
            const data = accountData[account][month];
            return viewMode === "cumulative" ? data.balance : data.income - data.expense;
          })
          .filter((value) => value !== undefined && value !== null && !Number.isNaN(value));
        return accountValues.reduce((sum, value) => sum + value, 0);
      });

      const averageData = allMonths.map((month) => {
        const accountValues = accounts
          .map((account) => {
            const data = accountData[account][month];
            return viewMode === "cumulative" ? data.balance : data.income - data.expense;
          })
          .filter((value) => value !== undefined && value !== null && !Number.isNaN(value));
        if (accountValues.length === 0) return 0;
        return accountValues.reduce((sum, value) => sum + value, 0) / accountValues.length;
      });

      if (showAverage) {
        datasets.push(
          {
            label: "Total Portfolio Value",
            data: totalPortfolioData,
            borderColor: "#fbbf24",
            backgroundColor: "rgba(251, 191, 36, 0.1)",
            borderWidth: 3,
            borderDash: [8, 4],
            fill: false,
            tension: 0.3,
            pointBackgroundColor: "#fbbf24",
            pointBorderColor: "#fbbf24",
            pointRadius: 3,
            pointHoverRadius: 5,
          },
          {
            label: "Average Account Balance",
            data: averageData,
            borderColor: "#ffffff",
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            borderWidth: 3,
            borderDash: [12, 6],
            fill: false,
            tension: 0.3,
            pointBackgroundColor: "#ffffff",
            pointBorderColor: "#ffffff",
            pointRadius: 3,
            pointHoverRadius: 5,
          }
        );
      }

      return { labels, datasets };
    } else {
      const account = selectedAccount;
      return {
        labels,
        datasets: [
          {
            label: viewMode === "cumulative" ? "Balance" : "Net Income",
            data: allMonths.map((month) => {
              const data = accountData[account][month];
              return viewMode === "cumulative" ? data.balance : data.income - data.expense;
            }),
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderWidth: 3,
            fill: true,
            tension: 0.3,
          },
          ...(viewMode === "monthly"
            ? [
                {
                  label: "Income",
                  data: allMonths.map((month) => accountData[account][month].income),
                  borderColor: "#3b82f6",
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  borderWidth: 2,
                  fill: false,
                  tension: 0.3,
                },
                {
                  label: "Expense",
                  data: allMonths.map((month) => -accountData[account][month].expense),
                  borderColor: "#ef4444",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  borderWidth: 2,
                  fill: false,
                  tension: 0.3,
                },
              ]
            : []),
        ],
      };
    }
  }, [filteredData, selectedAccount, viewMode, showAverage]);

  const accounts = [...new Set(filteredData.map((item) => item.account))].filter(Boolean).sort((a, b) => a.localeCompare(b));

  return (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg h-[500px] flex flex-col lg:col-span-2">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold text-white">Account Balance Progression</h3>
        <div className="flex items-center space-x-3">
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Accounts</option>
            {accounts.map((account) => (
              <option key={account} value={account}>
                {account}
              </option>
            ))}
          </select>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="cumulative">Cumulative</option>
            <option value="monthly">Monthly</option>
          </select>
          {selectedAccount === "all" && (
            <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showAverage}
                onChange={(e) => setShowAverage(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
              />
              <span>Show Average</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => {
              if (chartRef?.current) {
                const canvas = chartRef.current.canvas;
                const url = canvas.toDataURL("image/png");
                const link = document.createElement("a");
                link.download = `account-balance-progression-${selectedAccount}.png`;
                link.href = url;
                link.click();
              }
            }}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <title>Download account balance chart</title>
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
              legend: { labels: { color: "#9ca3af", font: { size: 11 } } },
              tooltip: {
                backgroundColor: "#111827",
                titleColor: "#ffffff",
                bodyColor: "#e5e7eb",
                callbacks: {
                  label: (context: TooltipItem<"bar">) =>
                    `${context.dataset.label}: ${formatCurrency(Number(context.parsed.y))}`,
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

// Seasonal Spending Heatmap Chart
interface SeasonalSpendingHeatmapProps {
  filteredData: Transaction[];
  chartRef?: React.RefObject<ChartJS<"bar">>;
}

export const SeasonalSpendingHeatmap = ({
  filteredData,
  chartRef,
}: SeasonalSpendingHeatmapProps) => {
  const chartData = React.useMemo(() => {
    const monthlySpending: Record<number, number> = {};
    
    filteredData.forEach((item) => {
      if (
        item.type === "Expense" &&
        item.category !== "In-pocket" &&
        item.category !== "Transfer"
      ) {
        const month = new Date(item.date).getMonth();
        monthlySpending[month] = (monthlySpending[month] || 0) + item.amount;
      }
    });

    return {
      labels: monthNames,
      datasets: [
        {
          label: "Monthly Spending",
          data: monthNames.map((_, index) => monthlySpending[index] || 0),
          backgroundColor: monthNames.map((_, index) => {
            const amount = monthlySpending[index] || 0;
            const maxAmount = Math.max(...Object.values(monthlySpending));
            const intensity = maxAmount > 0 ? amount / maxAmount : 0;
            return `rgba(239, 68, 68, ${0.2 + intensity * 0.8})`;
          }),
          borderRadius: 8,
        },
      ],
    };
  }, [filteredData]);

  return (
    <ChartContainer title="Seasonal Spending Heatmap">
      <div className="flex-grow">
        <Bar
          ref={chartRef}
          data={chartData}
          options={{
            ...commonChartOptions,
            plugins: {
              ...commonChartOptions.plugins,
              tooltip: {
                callbacks: {
                  label: (context: TooltipItem<"bar">) => `${context.dataset.label}: ${formatCurrency(Number(context.parsed.y))}`,
                },
              },
            },
            scales: {
              ...commonChartOptions.scales,
              y: {
                ...commonChartOptions.scales?.y,
                ticks: {
                  ...commonChartOptions.scales?.y?.ticks,
                  callback: (value: number | string) => formatCurrency(Number(value)),
                },
              },
            },
          }}
        />
      </div>
    </ChartContainer>
  );
};
