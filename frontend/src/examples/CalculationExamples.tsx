/**
 * Example: Using Backend Calculations API
 *
 * This file demonstrates how to use the new backend calculation endpoints
 * instead of computing locally.
 */

import React from "react";
import {
  useDateRangeFormat,
  useFinancialInsights,
  useMonthlyAggregation,
  useTopCategories,
  useTotals,
} from "../hooks/useCalculations";

/**
 * Example 1: Simple Totals Display
 */
export const TotalsExample = () => {
  const { data: totals, isLoading, error } = useTotals();

  if (isLoading) return <div>Loading totals...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!totals) return <div>No data</div>;

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Financial Summary</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-gray-600">Total Income</p>
          <p className="text-2xl font-bold text-green-600">
            ${totals.total_income.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-gray-600">Total Expenses</p>
          <p className="text-2xl font-bold text-red-600">
            ${totals.total_expenses.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-gray-600">Net Savings</p>
          <p className="text-2xl font-bold text-blue-600">${totals.net_savings.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-gray-600">Savings Rate</p>
          <p className="text-2xl font-bold text-purple-600">{totals.savings_rate.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Example 2: Monthly Data with Date Range
 */
export const MonthlyDataExample = () => {
  // Get data for last 6 months
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);

  const dateRange = useDateRangeFormat(startDate, endDate);
  const { data: monthly, isLoading } = useMonthlyAggregation(dateRange);

  if (isLoading) return <div>Loading monthly data...</div>;
  if (!monthly) return <div>No data</div>;

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Last 6 Months</h2>
      <div className="space-y-2">
        {Object.entries(monthly)
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, 6)
          .map(([month, data]) => (
            <div key={month} className="flex justify-between items-center p-2 bg-gray-50 rounded">
              <span className="font-medium">{month}</span>
              <div className="text-right">
                <div className="text-green-600">↑ ${data.income.toLocaleString()}</div>
                <div className="text-red-600">↓ ${data.expense.toLocaleString()}</div>
                <div className="text-blue-600 font-bold">
                  Net: ${data.net_savings.toLocaleString()}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

/**
 * Example 3: Financial Insights
 */
export const InsightsExample = () => {
  const { data: insights, isLoading } = useFinancialInsights();

  if (isLoading) return <div>Loading insights...</div>;
  if (!insights) return <div>No insights available</div>;

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Financial Insights</h2>

      <div className="space-y-4">
        {/* Top Category */}
        <div className="p-3 bg-blue-50 rounded">
          <p className="text-sm text-gray-600">Top Expense Category</p>
          <p className="text-lg font-bold">{insights.top_expense_category.category}</p>
          <p className="text-sm">
            ${insights.top_expense_category.amount.toLocaleString()} (
            {insights.top_expense_category.percentage.toFixed(1)}%)
          </p>
        </div>

        {/* Averages */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">Avg Daily Expense</p>
            <p className="text-lg font-bold">${insights.average_daily_expense.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded">
            <p className="text-sm text-gray-600">Avg Monthly Expense</p>
            <p className="text-lg font-bold">${insights.average_monthly_expense.toFixed(2)}</p>
          </div>
        </div>

        {/* Savings Rate */}
        <div className="p-3 bg-green-50 rounded">
          <p className="text-sm text-gray-600">Savings Rate</p>
          <p className="text-lg font-bold">{insights.savings_rate.toFixed(1)}%</p>
        </div>

        {/* Unusual Spending */}
        {insights.unusual_spending.length > 0 && (
          <div className="p-3 bg-yellow-50 rounded">
            <p className="text-sm text-gray-600 font-bold mb-2">⚠️ Unusual Spending</p>
            {insights.unusual_spending.slice(0, 3).map((item) => (
              <div key={item.category} className="text-sm mb-1">
                {item.category}: ${item.amount.toFixed(2)} ({item.deviation.toFixed(0)}% above
                average)
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Example 4: Top Categories
 */
export const TopCategoriesExample = () => {
  const { data: topCategories, isLoading } = useTopCategories(
    undefined, // no date range
    5, // top 5
    "Expense" // only expenses
  );

  if (isLoading) return <div>Loading categories...</div>;
  if (!topCategories || topCategories.length === 0) return <div>No data</div>;

  const maxAmount = topCategories[0]?.amount || 1;

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Top 5 Expense Categories</h2>
      <div className="space-y-3">
        {topCategories.map((category) => (
          <div key={category.category}>
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium">{category.category}</span>
              <span className="text-sm text-gray-600">
                ${category.amount.toLocaleString()} ({category.percentage.toFixed(1)}%)
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${(category.amount / maxAmount) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{category.count} transactions</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Example 5: Complete Dashboard
 */
export const CompleteDashboard = () => {
  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Financial Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <TotalsExample />
        <InsightsExample />
        <TopCategoriesExample />
        <div className="lg:col-span-2">
          <MonthlyDataExample />
        </div>
      </div>
    </div>
  );
};

/**
 * Example 6: Custom Date Range
 */
export const CustomDateRangeExample = () => {
  const [startDate, setStartDate] = React.useState<Date>(
    new Date(new Date().getFullYear(), 0, 1) // Start of year
  );
  const [endDate, setEndDate] = React.useState<Date>(new Date());

  const dateRange = useDateRangeFormat(startDate, endDate);
  const { data: totals, isLoading } = useTotals(dateRange);

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Custom Date Range</h2>

      <div className="flex gap-4 mb-4">
        <div>
          <label htmlFor="start-date" className="block text-sm font-medium mb-1">
            Start Date
          </label>
          <input
            id="start-date"
            type="date"
            value={startDate.toISOString().split("T")[0]}
            onChange={(e) => setStartDate(new Date(e.target.value))}
            className="border rounded px-2 py-1"
          />
        </div>
        <div>
          <label htmlFor="end-date" className="block text-sm font-medium mb-1">
            End Date
          </label>
          <input
            id="end-date"
            type="date"
            value={endDate.toISOString().split("T")[0]}
            onChange={(e) => setEndDate(new Date(e.target.value))}
            className="border rounded px-2 py-1"
          />
        </div>
      </div>

      {isLoading && <div>Loading...</div>}
      {!isLoading && totals && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-600">Income</p>
            <p className="text-xl font-bold">${totals.total_income.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-600">Expenses</p>
            <p className="text-xl font-bold">${totals.total_expenses.toLocaleString()}</p>
          </div>
        </div>
      )}
      {!isLoading && !totals && <div>No data for selected range</div>}
    </div>
  );
};

// Export all examples
export default {
  TotalsExample,
  MonthlyDataExample,
  InsightsExample,
  TopCategoriesExample,
  CompleteDashboard,
  CustomDateRangeExample,
};
