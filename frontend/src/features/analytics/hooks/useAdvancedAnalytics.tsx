import { useMemo } from "react";
import { calculateDateRange } from "../../../lib/calculations";
import type { Transaction } from "../../../types";

// Stub implementations for advanced analytics (TODO: Move to backend API)
const calculateMonthlyComparison = (transactions: Transaction[]) => {
  // Group by month and calculate spending
  const monthlyData = new Map<string, number>();

  transactions
    .filter((t) => t.type === "Expense")
    .forEach((t) => {
      const month = new Date(t.date || "").toISOString().slice(0, 7);
      monthlyData.set(month, (monthlyData.get(month) || 0) + Math.abs(t.amount || 0));
    });

  const months = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  if (months.length < 2) {
    return { trend: "stable", avgGrowth: 0 };
  }

  const growthRates = [];
  for (let i = 1; i < months.length; i++) {
    const growth = ((months[i][1] - months[i - 1][1]) / months[i - 1][1]) * 100;
    growthRates.push(growth);
  }

  const avgGrowth = growthRates.reduce((sum, g) => sum + g, 0) / growthRates.length;

  let trend = "stable";
  if (avgGrowth > 5) trend = "increasing";
  else if (avgGrowth < -5) trend = "decreasing";

  return { trend, avgGrowth };
};

const calculateCategoryBudgetStatus = (
  _transactions: Transaction[],
  _budgets: Record<string, number>
) => {
  // Simplified stub - returns empty array
  return [];
};

const calculateCashFlowForecast = (transactions: Transaction[], days: number) => {
  // Calculate actual values from transactions
  const totalIncome = transactions
    .filter((t) => t.type === "Income")
    .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
  const totalExpense = transactions
    .filter((t) => t.type === "Expense")
    .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

  const dateRange = transactions.length > 0 ? calculateDateRange(transactions) : { days: 1 };
  const dailyIncome = totalIncome / dateRange.days;
  const dailyExpense = totalExpense / dateRange.days;
  const netDaily = dailyIncome - dailyExpense;
  const totalProjected = netDaily * days;
  const currentBalance = totalIncome - totalExpense;
  const forecastedBalance = currentBalance + totalProjected;

  let status: "positive" | "stable" | "warning" | "critical" = "stable";
  if (netDaily > 500) status = "positive";
  else if (netDaily < -500) status = "critical";
  else if (netDaily < 0) status = "warning";

  const daysUntilZero = netDaily < 0 ? Math.abs(currentBalance / netDaily) : Infinity;

  return {
    status,
    projection: [],
    dailyIncome,
    dailyExpense,
    netDaily,
    totalProjected,
    forecastedBalance,
    daysUntilZero,
  };
};

const detectRecurringTransactions = (transactions: Transaction[]) => {
  // Group transactions by description and amount
  const groups = new Map<string, Transaction[]>();

  transactions
    .filter((t) => t.type === "Expense")
    .forEach((t) => {
      const key = `${t.description}-${Math.round((t.amount || 0) / 100) * 100}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    });

  const recurring: Array<{
    description?: string;
    category?: string;
    amount: number;
    frequency: number;
    frequencyLabel: string;
    count: number;
    nextExpected: Date;
    isMonthly: boolean;
  }> = [];
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: recurrence detection needs detailed steps
  groups.forEach((txns, _key) => {
    if (txns.length >= 2) {
      const avgAmount = txns.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0) / txns.length;
      const sortedDates = txns.map((t) => new Date(t.date || "").getTime()).sort((a, b) => a - b);
      const lastDate = new Date(sortedDates[sortedDates.length - 1]);

      const intervals = [];
      for (let i = 1; i < sortedDates.length; i++) {
        intervals.push((sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;

      let frequencyLabel = "monthly";
      if (avgInterval < 10) frequencyLabel = "weekly";
      else if (avgInterval < 20) frequencyLabel = "bi-weekly";
      else if (avgInterval < 45) frequencyLabel = "monthly";
      else if (avgInterval < 100) frequencyLabel = "bi-monthly";
      else frequencyLabel = "quarterly";

      const nextExpected = new Date(lastDate.getTime() + avgInterval * 24 * 60 * 60 * 1000);

      recurring.push({
        description: txns[0].description,
        category: txns[0].category,
        amount: avgAmount,
        frequency: avgInterval, // Store the numeric interval in days
        frequencyLabel, // Store the string label
        count: txns.length,
        nextExpected,
        isMonthly:
          frequencyLabel === "monthly" ||
          frequencyLabel === "bi-weekly" ||
          frequencyLabel === "weekly",
      });
    }
  });

  return recurring;
};

const detectAnomalies = (transactions: Transaction[], threshold: number) => {
  if (transactions.length < 5) return [];

  const amounts = transactions.map((t) => Math.abs(t.amount || 0));
  const avg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
  const stdDev = Math.sqrt(amounts.reduce((sum, a) => sum + (a - avg) ** 2, 0) / amounts.length);

  return transactions
    .filter((t) => {
      const amount = Math.abs(t.amount || 0);
      return amount > avg + threshold * stdDev;
    })
    .map((t) => ({
      ...t,
      severity: Math.abs(t.amount || 0) > avg + 3 * stdDev ? "high" : "medium",
    }));
};

const calculateDayOfMonthPattern = (_transactions: Transaction[]) => {
  // Simplified stub - returns empty array
  return [];
};

const calculateCategoryTrends = (transactions: Transaction[]) => {
  const categoryByMonth = new Map<string, Map<string, number>>();

  transactions.forEach((t) => {
    const cat = t.category || "Uncategorized";
    const month = new Date(t.date || "").toISOString().slice(0, 7);

    if (!categoryByMonth.has(cat)) {
      categoryByMonth.set(cat, new Map());
    }
    const monthlyData = categoryByMonth.get(cat)!;
    monthlyData.set(month, (monthlyData.get(month) || 0) + Math.abs(t.amount || 0));
  });

  return Array.from(categoryByMonth.entries())
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: aggregation kept verbose for clarity
    .map(([category, monthlyData]) => {
      const months = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      const total = Array.from(monthlyData.values()).reduce((sum, v) => sum + v, 0);
      const average = total / months.length;

      // Calculate trend (percent change from first to last month)
      let trendPercent = 0;
      let direction = "stable";

      if (months.length >= 2) {
        const firstMonth = months[0][1];
        const lastMonth = months[months.length - 1][1];

        // Avoid division by zero
        if (firstMonth > 0) {
          trendPercent = ((lastMonth - firstMonth) / firstMonth) * 100;

          // Ensure it's a valid number
          if (!Number.isFinite(trendPercent)) {
            trendPercent = 0;
          }

          if (trendPercent > 10) direction = "increasing";
          else if (trendPercent < -10) direction = "decreasing";
        }
      }

      return {
        category,
        total,
        monthlyAverage: average,
        count: months.length,
        trend: trendPercent,
        direction,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
};

const calculateIncomeStability = (_transactions: Transaction[]) => {
  // Simplified stub - returns basic stability
  return { rating: "Moderate", score: 50 };
};

const calculateMonthlyHealthRatio = (_transactions: Transaction[]) => {
  // Simplified stub - returns empty array
  return [];
};

const calculateGoalProgress = (current: number, goal: number, monthlyRate: number) => {
  // Simplified stub - returns basic progress
  const percentage = goal > 0 ? (current / goal) * 100 : 0;
  return {
    current,
    goal,
    percentage,
    monthsToGoal: monthlyRate > 0 ? (goal - current) / monthlyRate : 0,
  };
};

/**
 * Custom hook for advanced financial analytics
 * Provides sophisticated insights and predictions
 */
export const useAdvancedAnalytics = (transactions: Transaction[]) => {
  // 1. Month-over-Month Spending Comparison
  const monthlyComparison = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return null;
    }
    return calculateMonthlyComparison(transactions);
  }, [transactions]);

  // 2. Category Budget Tracking
  const categoryBudgets = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return [];
    }

    // You can pass custom budgets here, or let it auto-generate suggestions
    const budgets = {
      // Example budgets (can be customized or loaded from user preferences)
      // "Food": 15000,
      // "Transport": 5000,
      // "Shopping": 10000,
    };

    return calculateCategoryBudgetStatus(transactions, budgets);
  }, [transactions]);

  // 3. Cash Flow Forecast (30 days ahead)
  const cashFlowForecast = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return null;
    }
    return calculateCashFlowForecast(transactions, 30);
  }, [transactions]);

  // 4. Recurring Transaction Detection
  const recurringTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return [];
    }
    return detectRecurringTransactions(transactions);
  }, [transactions]);

  // 5. Spending Anomaly Detection
  const anomalies = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return [];
    }
    return detectAnomalies(transactions, 2); // 2 standard deviations
  }, [transactions]);

  // 6. Day-of-Month Spending Pattern
  const dayOfMonthPattern = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return [];
    }
    return calculateDayOfMonthPattern(transactions);
  }, [transactions]);

  // 7. Category Trend Analysis
  const categoryTrends = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return [];
    }
    return calculateCategoryTrends(transactions);
  }, [transactions]);

  // 8. Income Stability Score
  const incomeStability = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return null;
    }
    return calculateIncomeStability(transactions);
  }, [transactions]);

  // 9. Monthly Health Ratio
  const monthlyHealthRatio = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return [];
    }
    return calculateMonthlyHealthRatio(transactions);
  }, [transactions]);

  // 10. Savings Goal Progress (Example: Goal of ₹100,000)
  const savingsGoalProgress = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return null;
    }

    const dateRange = calculateDateRange(transactions);
    const income = transactions
      .filter((t) => t.type === "Income")
      .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const expense = transactions
      .filter((t) => t.type === "Expense")
      .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

    const currentBalance = income - expense;
    const monthlyNetIncome = ((income - expense) / dateRange.days) * 30.44;
    const goal = 100000; // Example goal - can be customized

    return calculateGoalProgress(currentBalance, goal, monthlyNetIncome);
  }, [transactions]);

  // Summary insights - Quick overview of key findings
  const insights = useMemo(() => {
    const summary = {
      hasMonthlyGrowth: (monthlyComparison?.avgGrowth ?? 0) > 0,
      monthlyTrend: monthlyComparison?.trend || "unknown",
      recurringCount: recurringTransactions?.length || 0,
      anomalyCount: anomalies?.length || 0,
      incomeStability: incomeStability?.rating || "Unknown",
      cashFlowStatus: cashFlowForecast?.status || "unknown",
      averageMonthlyHealth:
        monthlyHealthRatio && monthlyHealthRatio.length > 0
          ? monthlyHealthRatio.reduce((sum, m) => sum + m.ratio, 0) / monthlyHealthRatio.length
          : 0,
    };

    return summary;
  }, [
    monthlyComparison,
    recurringTransactions,
    anomalies,
    incomeStability,
    cashFlowForecast,
    monthlyHealthRatio,
  ]);

  return {
    // Individual analytics
    monthlyComparison,
    categoryBudgets,
    cashFlowForecast,
    recurringTransactions,
    anomalies,
    dayOfMonthPattern,
    categoryTrends,
    incomeStability,
    monthlyHealthRatio,
    savingsGoalProgress,

    // Summary insights
    insights,
  };
};

export default useAdvancedAnalytics;
