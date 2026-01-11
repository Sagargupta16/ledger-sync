import { useMemo } from "react";
import {
  calculateActualCashback,
  calculateCashbackShared,
  calculateDailyAverage,
  calculateDateRange,
  calculateMonthlyAverage,
  calculateSavingsRate,
  calculateTotalCashbackEarned,
  calculateTotalExpense,
  calculateTotalIncome,
  calculateTotalReimbursements,
} from "../../../lib/calculations";
import type { DateRangeResult } from "../../../lib/calculations/time/dateRange";
import type { Transaction, TransactionOrTransfer, Transfer } from "../../../types";

type TransferData = { transferIn: number; transferOut: number };
type CashbackData = {
  totalCashbackEarned: number;
  cashbackShared: number;
  actualCashback: number;
};
type ReimbursementData = { totalReimbursements: number };
export type AdditionalKpiData = {
  highestExpense: number;
  averageExpense: number;
  totalTransactions: number;
  transferData: TransferData;
  cashbackData: CashbackData;
  reimbursementData: ReimbursementData;
};

type KPIData = { income: number; expense: number };
type KeyInsights = {
  busiestDay: string;
  mostFrequentCategory: string;
  avgTransactionValue: number;
};
type EnhancedKpiData = {
  savingsRate: number;
  dailySpendingRate: number;
  monthlyBurnRate: number;
  netWorth: number;
  netWorthPerMonth: number;
  spendingVelocity: number;
  categoryConcentration: {
    category: string;
    amount: number;
    percentage: number;
  } | null;
  dateRange: DateRangeResult;
};

export const useKPIData = (
  filteredData: Transaction[]
): { kpiData: KPIData; additionalKpiData: AdditionalKpiData } => {
  return useMemo(() => {
    if (!filteredData || filteredData.length === 0) {
      return {
        kpiData: { income: 0, expense: 0 },
        additionalKpiData: {
          highestExpense: 0,
          averageExpense: 0,
          totalTransactions: 0,
          transferData: { transferIn: 0, transferOut: 0 },
          cashbackData: {
            totalCashbackEarned: 0,
            cashbackShared: 0,
            actualCashback: 0,
          },
          reimbursementData: {
            totalReimbursements: 0,
          },
        },
      };
    }

    // Use unified calculations
    const income = calculateTotalIncome(filteredData);
    const expense = calculateTotalExpense(filteredData);

    const expenseTransactions = filteredData.filter((item) => item.type === "Expense");

    const transferData = filteredData.reduce(
      (acc: { transferIn: number; transferOut: number }, item) => {
        const amount = Math.abs(Number(item.amount) || 0);
        if (item.type === "Transfer") {
          // Identify direction from category: "Transfer: From X" = receiving (in)
          if (item.category?.includes("Transfer: From")) {
            acc.transferIn += amount;
          } else if (item.category?.includes("Transfer: To")) {
            acc.transferOut += amount;
          }
        }
        return acc;
      },
      { transferIn: 0, transferOut: 0 }
    );

    // Calculate cashback metrics
    const totalCashbackEarned = calculateTotalCashbackEarned(filteredData);
    const cashbackShared = calculateCashbackShared(filteredData);
    const actualCashback = calculateActualCashback(filteredData);

    const cashbackData = {
      totalCashbackEarned,
      cashbackShared,
      actualCashback,
    };

    // Calculate reimbursement metrics
    const totalReimbursements = calculateTotalReimbursements(filteredData);

    const reimbursementData = {
      totalReimbursements,
    };

    const additionalKpiData = {
      highestExpense: Math.max(
        0,
        ...expenseTransactions.map((item) => Math.abs(Number(item.amount) || 0))
      ),
      averageExpense: expenseTransactions.length > 0 ? expense / expenseTransactions.length : 0,
      totalTransactions: filteredData.length,
      transferData,
      cashbackData,
      reimbursementData,
    };

    return { kpiData: { income, expense }, additionalKpiData };
  }, [filteredData]);
};

export const useKeyInsights = (
  filteredData: Transaction[],
  _kpiData: KPIData,
  additionalKpiData: AdditionalKpiData
): KeyInsights => {
  return useMemo(() => {
    // Validate input
    if (!filteredData || filteredData.length === 0) {
      return {
        busiestDay: "N/A",
        mostFrequentCategory: "N/A",
        avgTransactionValue: 0,
      };
    }

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const daySpending = new Array(7).fill(0);
    const categoryCounts: Record<string, number> = {};

    const toDate = (value: string | number | Date | null | undefined): Date | null => {
      if (!value) {
        return null;
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return null;
      }
      return date;
    };

    filteredData.forEach((item) => {
      if (item.type === "Expense") {
        const amount = Math.abs(Number(item.amount) || 0);

        const date = toDate(item.date);
        if (date) {
          const dayIndex = date.getDay();
          if (dayIndex >= 0 && dayIndex < 7) {
            daySpending[dayIndex] += amount;
          }
        }
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
      }
    });

    const maxSpending = Math.max(...daySpending);
    const busiestDay = maxSpending > 0 ? days[daySpending.indexOf(maxSpending)] : "N/A";
    const mostFrequentCategory =
      Object.entries(categoryCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || "N/A";

    // Calculate more meaningful averages - absolute value of all transactions
    const totalAbsoluteValue = filteredData.reduce(
      (sum: number, t) => sum + Math.abs(Number(t.amount) || 0),
      0
    );
    const avgTransactionValue =
      additionalKpiData.totalTransactions > 0
        ? totalAbsoluteValue / additionalKpiData.totalTransactions
        : 0;

    return { busiestDay, mostFrequentCategory, avgTransactionValue };
  }, [filteredData, additionalKpiData]);
};

export const useAccountBalances = (data: TransactionOrTransfer[]) => {
  return useMemo(() => {
    // Validate input
    if (!data || data.length === 0) {
      return [];
    }

    const balances = data.reduce((acc: Record<string, { balance: number; last: number }>, tx) => {
      const amount = Math.abs(Number(tx.amount) || 0);
      const asDate = new Date(tx.date).getTime();

      const ensure = (accountName?: string | null) => {
        const key = accountName?.trim() ? accountName.trim() : "Unknown";
        if (!acc[key]) {
          acc[key] = { balance: 0, last: 0 };
        }
        return key;
      };

      const update = (accountName: string | null | undefined, delta: number) => {
        const key = ensure(accountName);
        acc[key].balance += delta;
        if (asDate && asDate > acc[key].last) {
          acc[key].last = asDate;
        }
      };

      // Apply user-requested formula: Income - Expense + Transfer-In - Transfer-Out (per account)
      if (tx.is_transfer || tx.type === "Transfer-In" || tx.type === "Transfer-Out") {
        const transfer = tx as Transfer;
        const fromAccount = transfer.from_account || transfer.account;
        const toAccount = transfer.to_account || transfer.account;

        if (tx.type === "Transfer-Out") {
          update(fromAccount, -amount);
        } else if (tx.type === "Transfer-In") {
          update(toAccount, amount);
        }
      } else {
        if (tx.type === "Income") {
          update(tx.account, amount);
        } else if (tx.type === "Expense") {
          update(tx.account, -amount);
        }
      }

      return acc;
    }, {});

    return Object.entries(balances)
      .map(([name, { balance, last }]) => ({
        name,
        balance: Number(balance) || 0,
        last_transaction: Number.isFinite(last) && last > 0 ? new Date(last).toISOString() : null,
      }))
      .sort((a, b) => b.balance - a.balance);
  }, [data]);
};

export const useEnhancedKPIData = (
  filteredData: Transaction[],
  kpiData: KPIData
): EnhancedKpiData => {
  return useMemo(() => {
    if (!filteredData || filteredData.length === 0 || !kpiData) {
      return {
        savingsRate: 0,
        dailySpendingRate: 0,
        monthlyBurnRate: 0,
        netWorth: 0,
        netWorthPerMonth: 0,
        spendingVelocity: 100,
        categoryConcentration: null,
        dateRange: {
          startDate: null,
          endDate: null,
          totalDays: 0,
          totalMonths: 0,
          totalYears: 0,
          days: 0,
          months: 0,
          years: 0,
        },
      };
    }

    const dateRange = calculateDateRange(filteredData);
    const { income, expense } = kpiData;
    const totalDays = Number(dateRange?.totalDays ?? dateRange?.days ?? 1) || 1;

    // Use unified calculations
    const savingsRate = calculateSavingsRate(income, expense);
    const dailySpendingRate = calculateDailyAverage(expense, totalDays);
    const monthlyBurnRate = calculateMonthlyAverage(expense, totalDays);
    const netWorth = income - expense;
    const netWorthPerMonth = calculateMonthlyAverage(netWorth, totalDays);

    // 5. Spending Velocity (Last 30 days vs All time)
    const last30DaysDate = new Date();
    last30DaysDate.setDate(last30DaysDate.getDate() - 30);

    const last30DaysTransactions = filteredData.filter((t) => {
      if (t.type !== "Expense") {
        return false;
      }
      const date = new Date(t.date);
      if (Number.isNaN(date.getTime())) {
        return false;
      }
      return date >= last30DaysDate;
    });
    const spending30d = last30DaysTransactions.reduce(
      (sum: number, t) => sum + (Number(t.amount) || 0),
      0
    );

    // Calculate actual days in the last period (not always 30)
    const actualDaysInPeriod = Math.min(30, dateRange.days);
    const spendingPerDay30d = actualDaysInPeriod > 0 ? spending30d / actualDaysInPeriod : 0;
    const spendingVelocity =
      dailySpendingRate > 0 ? (spendingPerDay30d / dailySpendingRate) * 100 : 100;

    // 6. Category Concentration
    const categoryTotals: Record<string, number> = {};
    filteredData.forEach((t) => {
      if (t.type === "Expense") {
        const amount = Math.abs(Number(t.amount) || 0);
        const category = t.category || "Uncategorized";
        categoryTotals[category] = (categoryTotals[category] || 0) + amount;
      }
    });

    const topCategory = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a)[0];

    const categoryConcentration =
      topCategory && expense > 0
        ? {
            category: topCategory[0],
            amount: topCategory[1],
            percentage: (topCategory[1] / expense) * 100,
          }
        : null;

    return {
      savingsRate,
      dailySpendingRate,
      monthlyBurnRate,
      netWorth,
      netWorthPerMonth,
      spendingVelocity,
      categoryConcentration,
      dateRange,
    };
  }, [filteredData, kpiData]);
};
