import {
  EnhancedSubcategoryBreakdownChart,
  MultiCategoryTimeAnalysisChart,
  TreemapChart,
} from "@features/analytics";
import type { Transaction } from "../../types";

/**
 * Category Analysis Section - Deep dive into spending categories
 */
export const CategoryAnalysisPage = ({
  chartRefs,
  filteredData,
  uniqueValues,
  drilldownCategory,
  setDrilldownCategory,
}: {
  chartRefs: Record<string, React.RefObject<unknown>>;
  filteredData: Transaction[];
  uniqueValues: { expenseCategories: string[] };
  drilldownCategory: string;
  setDrilldownCategory: (category: string) => void;
}) => {
  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Treemap Chart */}
      <TreemapChart filteredData={filteredData} chartRef={chartRefs.treemap as React.RefObject<any>} />

      {/* Time-based Category Analysis */}
      <div className="bg-gray-800/50 rounded-2xl p-6">
        <h2 className="text-2xl font-bold text-white mb-6">Time-based Category Analysis</h2>
        <div className="grid grid-cols-1 gap-6">
          {/* Enhanced Subcategory Breakdown */}
          <EnhancedSubcategoryBreakdownChart
            filteredData={filteredData}
            chartRef={chartRefs.enhancedSubcategoryBreakdown}
            categories={uniqueValues.expenseCategories}
            selectedCategory={drilldownCategory}
            onCategoryChange={setDrilldownCategory}
          />

          {/* Multi-Category Time Analysis */}
          <MultiCategoryTimeAnalysisChart
            filteredData={filteredData}
            chartRef={chartRefs.multiCategoryTimeAnalysis as React.RefObject<any>}
          />
        </div>
      </div>
    </div>
  );
};
