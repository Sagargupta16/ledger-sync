import {
  EnhancedMonthlyTrendsChart,
  EnhancedSpendingByAccountChart,
  EnhancedSubcategoryBreakdownChart,
  EnhancedTopExpenseCategoriesChart,
  EnhancedTopIncomeSourcesChart,
  IncomeVsExpenseChart,
  SpendingByDayChart,
} from "@features/analytics";
import type { Transaction } from "../../types";
import type { BubbleDataPoint, ChartData } from "chart.js";

type BarData = ChartData<"bar", (number | [number, number] | BubbleDataPoint | null)[], unknown>;
type DoughnutData = ChartData<"doughnut", number[], unknown>;

/**
 * Income & Expense Section - Core spending and earning analysis
 */
export const IncomeExpensePage = ({
  chartData,
  chartRefs,
  filteredData,
  uniqueValues,
  drilldownCategory,
  setDrilldownCategory,
}: {
  chartData: {
    doughnutChartData: unknown;
    subcategoryBreakdownData: unknown;
    spendingByDayData: unknown;
  };
  chartRefs: Record<string, React.RefObject<unknown> | undefined>;
  filteredData: Transaction[];
  uniqueValues: { expenseCategories: string[] };
  drilldownCategory: string;
  setDrilldownCategory: (category: string) => void;
}) => {
  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Income vs Expense Doughnut */}
      <IncomeVsExpenseChart data={chartData.doughnutChartData as DoughnutData} chartRef={chartRefs.doughnut as React.RefObject<any>} />

      {/* Top Expense Categories */}
      <EnhancedTopExpenseCategoriesChart
        filteredData={filteredData}
        chartRef={chartRefs.bar as React.RefObject<any>}
      />

      {/* Top Income Sources */}
      <EnhancedTopIncomeSourcesChart
        filteredData={filteredData}
        chartRef={chartRefs.incomeSources as React.RefObject<any>}
      />

      {/* Spending by Account */}
      <EnhancedSpendingByAccountChart
        filteredData={filteredData}
        chartRef={chartRefs.spendingByAccount as React.RefObject<any>}
      />

      {/* Monthly Trends */}
      <EnhancedMonthlyTrendsChart
        filteredData={filteredData}
        chartRef={chartRefs.line as React.RefObject<any>}
      />

      {/* Detailed Analysis Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by Day */}
        <SpendingByDayChart
          data={chartData.spendingByDayData as BarData}
          chartRef={chartRefs.spendingByDay}
        />

        {/* Subcategory Breakdown */}
        <EnhancedSubcategoryBreakdownChart
          filteredData={filteredData}
          chartRef={chartRefs.subcategoryBreakdown}
          categories={uniqueValues.expenseCategories}
          selectedCategory={drilldownCategory}
          onCategoryChange={setDrilldownCategory}
        />
      </div>
    </div>
  );
};
