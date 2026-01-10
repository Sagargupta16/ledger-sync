/**
 * Calculations API Service
 * Fetches calculated data from backend instead of computing locally
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Date range parameters for API calls
 */
interface DateRange {
  start_date?: string; // ISO format YYYY-MM-DD
  end_date?: string; // ISO format YYYY-MM-DD
}

/**
 * Build query string from date range
 */
function buildQueryString(params: DateRange): string {
  const query = new URLSearchParams();
  if (params.start_date) query.append("start_date", params.start_date);
  if (params.end_date) query.append("end_date", params.end_date);
  return query.toString();
}

/**
 * Totals Response
 */
export interface TotalsResponse {
  total_income: number;
  total_expenses: number;
  net_savings: number;
  savings_rate: number;
  transaction_count: number;
}

/**
 * Monthly Data
 */
export interface MonthlyData {
  [monthKey: string]: {
    income: number;
    expense: number;
    net_savings: number;
    transactions: number;
  };
}

/**
 * Yearly Data
 */
export interface YearlyData {
  [year: string]: {
    income: number;
    expense: number;
    net_savings: number;
    transactions: number;
    months: number[];
  };
}

/**
 * Category Breakdown
 */
export interface CategoryBreakdown {
  categories: {
    [category: string]: {
      total: number;
      count: number;
      percentage: number;
      subcategories: {
        [subcategory: string]: number;
      };
    };
  };
  total: number;
}

/**
 * Account Balance
 */
export interface AccountBalances {
  accounts: {
    [account: string]: {
      balance: number;
      transactions: number;
      last_transaction: string | null;
    };
  };
  statistics: {
    total_accounts: number;
    total_balance: number;
    average_balance: number;
    positive_accounts: number;
    negative_accounts: number;
  };
}

/**
 * Financial Insights
 */
export interface FinancialInsights {
  top_expense_category: {
    category: string;
    amount: number;
    percentage: number;
  };
  most_frequent_category: {
    category: string;
    count: number;
  };
  average_daily_expense: number;
  average_monthly_expense: number;
  savings_rate: number;
  largest_transaction: {
    amount: number;
    category: string;
    date: string;
  } | null;
  unusual_spending: Array<{
    category: string;
    amount: number;
    average_amount: number;
    deviation: number;
    date: string;
  }>;
  total_income: number;
  total_expenses: number;
}

/**
 * Daily Net Worth Data
 */
export interface DailyNetWorth {
  daily_data: {
    [dateKey: string]: {
      income: number;
      expense: number;
      date: string;
    };
  };
  cumulative_data: Array<{
    date: string;
    net_worth: number;
    income: number;
    expense: number;
  }>;
}

/**
 * Top Category
 */
export interface TopCategory {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

/**
 * Calculations API Service
 */
export const calculationsApi = {
  /**
   * Get total income, expenses, and savings
   */
  async getTotals(dateRange?: DateRange): Promise<TotalsResponse> {
    const query = dateRange ? `?${buildQueryString(dateRange)}` : "";
    const response = await fetch(`${API_BASE_URL}/api/calculations/totals${query}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch totals: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get monthly aggregation
   */
  async getMonthlyAggregation(dateRange?: DateRange): Promise<MonthlyData> {
    const query = dateRange ? `?${buildQueryString(dateRange)}` : "";
    const response = await fetch(`${API_BASE_URL}/api/calculations/monthly-aggregation${query}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch monthly aggregation: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get yearly aggregation
   */
  async getYearlyAggregation(dateRange?: DateRange): Promise<YearlyData> {
    const query = dateRange ? `?${buildQueryString(dateRange)}` : "";
    const response = await fetch(`${API_BASE_URL}/api/calculations/yearly-aggregation${query}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch yearly aggregation: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get category breakdown
   */
  async getCategoryBreakdown(
    dateRange?: DateRange,
    transactionType?: "Income" | "Expense"
  ): Promise<CategoryBreakdown> {
    const params = new URLSearchParams();
    if (dateRange?.start_date) params.append("start_date", dateRange.start_date);
    if (dateRange?.end_date) params.append("end_date", dateRange.end_date);
    if (transactionType) params.append("transaction_type", transactionType);

    const query = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/api/calculations/category-breakdown${query}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch category breakdown: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get account balances
   */
  async getAccountBalances(dateRange?: DateRange): Promise<AccountBalances> {
    const query = dateRange ? `?${buildQueryString(dateRange)}` : "";
    const response = await fetch(`${API_BASE_URL}/api/calculations/account-balances${query}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch account balances: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get financial insights
   */
  async getFinancialInsights(dateRange?: DateRange): Promise<FinancialInsights> {
    const query = dateRange ? `?${buildQueryString(dateRange)}` : "";
    const response = await fetch(`${API_BASE_URL}/api/calculations/insights${query}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch financial insights: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get daily net worth data
   */
  async getDailyNetWorth(dateRange?: DateRange): Promise<DailyNetWorth> {
    const query = dateRange ? `?${buildQueryString(dateRange)}` : "";
    const response = await fetch(`${API_BASE_URL}/api/calculations/daily-net-worth${query}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch daily net worth: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Get top categories
   */
  async getTopCategories(
    dateRange?: DateRange,
    limit: number = 10,
    transactionType?: "Income" | "Expense"
  ): Promise<TopCategory[]> {
    const params = new URLSearchParams();
    if (dateRange?.start_date) params.append("start_date", dateRange.start_date);
    if (dateRange?.end_date) params.append("end_date", dateRange.end_date);
    params.append("limit", limit.toString());
    if (transactionType) params.append("transaction_type", transactionType);

    const query = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`${API_BASE_URL}/api/calculations/top-categories${query}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch top categories: ${response.statusText}`);
    }

    return response.json();
  },
};
