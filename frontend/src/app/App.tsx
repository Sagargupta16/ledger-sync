import { useChartData } from "@features/charts";
import { useAccountBalances, useKeyInsights, useKPIData } from "@features/kpi";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  TimeScale,
  Title,
  Tooltip,
} from "chart.js";
import { type RefObject, Suspense, useEffect, useRef, useState } from "react";
import { Footer } from "../components/layout/Footer";
// Components
import { Header } from "../components/layout/Header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { AlertCircle, CheckCircle, Upload as UploadIcon, XCircle } from "lucide-react";
import { CustomTabs, TabContent } from "../components/ui/CustomTabs";
import { LoadingSpinner } from "../components/ui/Loading";
import { SectionSkeleton } from "../components/ui/SectionSkeleton";
// Config
import { TABS_CONFIG } from "../config/tabs";
// Hooks
import { useBackendData } from "../hooks/useBackendData";
import { useFilteredData, useUniqueValues } from "../hooks/useDataProcessor";
import {
  useError,
  useLoading,
  useSetError,
  useSetLoading,
  useSetTransactions,
  useTransactions,
} from "../store/financialStore";
import type { SortConfig, TransactionSortKey } from "../types";
import { lazyLoad } from "../utils/lazyLoad";

// Lazy load page components for better performance
const OverviewPage = lazyLoad(() => import("../pages/OverviewPage/OverviewPage"), "OverviewPage");
const IncomeExpensePage = lazyLoad(
  () => import("../pages/IncomeExpensePage/IncomeExpensePage"),
  "IncomeExpensePage"
);
const CategoryAnalysisPage = lazyLoad(
  () => import("../pages/CategoryAnalysisPage/CategoryAnalysisPage"),
  "CategoryAnalysisPage"
);
const TrendsForecastsPage = lazyLoad(
  () => import("../pages/TrendsForecastsPage/TrendsForecastsPage"),
  "TrendsForecastsPage"
);
const InvestmentPerformanceTracker = lazyLoad(
  () => import("../features/analytics/components/InvestmentPerformanceTracker"),
  "InvestmentPerformanceTracker"
);
const TaxPlanningDashboard = lazyLoad(
  () => import("../features/analytics/components/TaxPlanningDashboard"),
  "TaxPlanningDashboard"
);
const FamilyHousingManager = lazyLoad(
  () => import("../features/analytics/components/FamilyHousingManager"),
  "FamilyHousingManager"
);
const CreditCardFoodOptimizer = lazyLoad(
  () => import("../features/analytics/components/CreditCardFoodOptimizer"),
  "CreditCardFoodOptimizer"
);
const PatternsPage = lazyLoad(() => import("../pages/PatternsPage/PatternsPage"), "PatternsPage");
const TransactionsPage = lazyLoad(
  () => import("../pages/TransactionsPage/TransactionsPage"),
  "TransactionsPage"
);
const BudgetGoalsSection = lazyLoad(
  () => import("../features/budget/components/BudgetGoalsSection"),
  "BudgetGoalsSection"
);

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  TimeScale,
  Filler
);

type ChartRefKey =
  | "doughnut"
  | "bar"
  | "incomeSources"
  | "spendingByAccount"
  | "line"
  | "spendingByDay"
  | "subcategoryBreakdown"
  | "treemap"
  | "enhancedSubcategoryBreakdown"
  | "multiCategoryTimeAnalysis"
  | "netWorth"
  | "cumulativeCategoryTrend"
  | "seasonalSpendingHeatmap"
  | "yearOverYearComparison"
  | "spendingForecast"
  | "accountBalanceProgression"
  | "dayWeekSpendingPatterns";

type ChartRefMap = Record<ChartRefKey, RefObject<ChartJS | null>>;

// Utility functions outside component to reduce complexity
const isDuplicateFileError = (error: unknown): boolean => {
  const errorMessage = error instanceof Error ? error.message : "";
  return errorMessage.includes("already imported") || errorMessage.includes("409");
};

const App = () => {
  // State
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [sortConfig, setSortConfig] = useState<SortConfig<TransactionSortKey>>({
    key: "date",
    direction: "desc",
  });
  const [drilldownCategory, setDrilldownCategory] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const transactionsPerPage = 25;

  // Upload confirmation dialog state
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingInputEvent, setPendingInputEvent] =
    useState<React.ChangeEvent<HTMLInputElement> | null>(null);

  // Upload result notification state
  const [uploadNotification, setUploadNotification] = useState<{
    show: boolean;
    type: "success" | "error";
    stats?: {
      inserted: number;
      updated: number;
      deleted: number;
      unchanged: number;
      processed: number;
    };
    message?: string;
  }>({ show: false, type: "success" });

  // Chart refs for download functionality
  const chartRefs: ChartRefMap = {
    doughnut: useRef<ChartJS | null>(null),
    bar: useRef<ChartJS | null>(null),
    incomeSources: useRef<ChartJS | null>(null),
    spendingByAccount: useRef<ChartJS | null>(null),
    line: useRef<ChartJS | null>(null),
    spendingByDay: useRef<ChartJS | null>(null),
    subcategoryBreakdown: useRef<ChartJS | null>(null),
    treemap: useRef<ChartJS | null>(null),
    enhancedSubcategoryBreakdown: useRef<ChartJS | null>(null),
    multiCategoryTimeAnalysis: useRef<ChartJS | null>(null),
    netWorth: useRef<ChartJS | null>(null),
    cumulativeCategoryTrend: useRef<ChartJS | null>(null),
    seasonalSpendingHeatmap: useRef<ChartJS | null>(null),
    yearOverYearComparison: useRef<ChartJS | null>(null),
    spendingForecast: useRef<ChartJS | null>(null),
    accountBalanceProgression: useRef<ChartJS | null>(null),
    dayWeekSpendingPatterns: useRef<ChartJS | null>(null),
  };

  // Zustand store
  const transactions = useTransactions();
  const setTransactions = useSetTransactions();
  const loading = useLoading();
  const setLoading = useSetLoading();
  const error = useError();
  const setError = useSetError();

  // Load data from backend
  useBackendData();

  // Custom hooks
  const uniqueValues = useUniqueValues(transactions);

  // Default filters for data processing
  const defaultFilters = {
    searchTerm: "",
    type: "All",
    category: "All",
    account: "All",
    startDate: "",
    endDate: "",
  };

  const filteredData = useFilteredData(transactions, defaultFilters, sortConfig);
  const { kpiData, additionalKpiData } = useKPIData(filteredData);
  const keyInsights = useKeyInsights(filteredData, kpiData, additionalKpiData);
  const accountBalances = useAccountBalances(transactions);
  const chartData = useChartData(filteredData, kpiData, drilldownCategory);

  // Effects
  useEffect(() => {
    if (uniqueValues.expenseCategories.length > 0 && !drilldownCategory) {
      setDrilldownCategory(uniqueValues.expenseCategories[0]);
    }
  }, [uniqueValues.expenseCategories, drilldownCategory]);

  // Helper function to process upload response
  const processUploadResponse = async (file: File, force: boolean) => {
    const { uploadExcelFile, fetchTransactions } = await import("../services/api");

    setLoading(true);
    setError(null);

    const response = await uploadExcelFile(file, force);
    const newTransactions = await fetchTransactions();
    setTransactions(newTransactions);

    setLoading(false);

    // Show success notification with stats
    setUploadNotification({
      show: true,
      type: "success",
      stats: response.stats,
    });

    // Auto-hide after 8 seconds
    setTimeout(() => {
      setUploadNotification({ show: false, type: "success" });
    }, 8000);
  };

  // Handlers
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Store file and event, then show confirmation dialog
    setPendingFile(file);
    setPendingInputEvent(event);
    setShowUploadDialog(true);
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile || !pendingInputEvent) return;

    setShowUploadDialog(false);
    const file = pendingFile;
    const event = pendingInputEvent;

    let forceReimport = false;

    const handleError = async (error: unknown, uploadFile: (force: boolean) => Promise<void>) => {
      // Log error for debugging

      // If duplicate file error, automatically force re-import (since user already confirmed via dialog)
      if (isDuplicateFileError(error)) {
        forceReimport = true;
        await uploadFile(true);
        return true;
      }

      // Show error notification
      setUploadNotification({
        show: true,
        type: "error",
        message: error instanceof Error ? error.message : "Failed to upload file",
      });
      setError(error instanceof Error ? error.message : "Failed to upload file");
      setLoading(false);
      return false;
    };

    const uploadFile = async (force: boolean) => {
      try {
        await processUploadResponse(file, force);
      } catch (error: unknown) {
        await handleError(error, uploadFile);
      } finally {
        if (!forceReimport) {
          event.target.value = "";
        }
      }
    };

    await uploadFile(false);

    // Clear pending state
    setPendingFile(null);
    setPendingInputEvent(null);
  };

  const handleCancelUpload = () => {
    setShowUploadDialog(false);
    setPendingFile(null);
    if (pendingInputEvent) {
      pendingInputEvent.target.value = "";
    }
    setPendingInputEvent(null);
  };

  const handleSort = (key: TransactionSortKey) => {
    setSortConfig((p) => ({
      key,
      direction: p.key === key && p.direction === "asc" ? "desc" : "asc",
    }));
    setCurrentPage(1); // Reset to first page when sorting
  };

  // Loading and error states
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <LoadingSpinner size="xl" message="Loading your financial data..." />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-red-400">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-black text-gray-300 font-sans p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      <div className="relative z-10 max-w-7xl mx-auto">
        <Header onFileUpload={handleFileUpload} />

        {/* Tab Navigation */}
        <CustomTabs tabs={TABS_CONFIG} activeTab={activeTab} onChange={setActiveTab} />

        {/* Tab Content */}
        <TabContent isActive={activeTab === "overview"}>
          <Suspense fallback={<SectionSkeleton />}>
            <OverviewPage
              kpiData={kpiData}
              additionalKpiData={additionalKpiData}
              accountBalances={accountBalances}
              keyInsights={keyInsights}
              filteredData={filteredData}
            />
          </Suspense>
        </TabContent>

        <TabContent isActive={activeTab === "income-expense"}>
          <Suspense fallback={<SectionSkeleton />}>
            <IncomeExpensePage
              chartData={chartData}
              chartRefs={chartRefs}
              filteredData={filteredData}
              uniqueValues={uniqueValues}
              drilldownCategory={drilldownCategory}
              setDrilldownCategory={setDrilldownCategory}
            />
          </Suspense>
        </TabContent>

        <TabContent isActive={activeTab === "categories"}>
          <Suspense fallback={<SectionSkeleton />}>
            <CategoryAnalysisPage
              chartRefs={chartRefs}
              filteredData={filteredData}
              uniqueValues={uniqueValues}
              drilldownCategory={drilldownCategory}
              setDrilldownCategory={setDrilldownCategory}
            />
          </Suspense>
        </TabContent>

        <TabContent isActive={activeTab === "trends"}>
          <Suspense fallback={<SectionSkeleton />}>
            <TrendsForecastsPage chartRefs={chartRefs} filteredData={filteredData} />
          </Suspense>
        </TabContent>

        <TabContent isActive={activeTab === "investments"}>
          <Suspense fallback={<SectionSkeleton />}>
            <InvestmentPerformanceTracker filteredData={filteredData} accountBalances={accountBalances} />
          </Suspense>
        </TabContent>

        <TabContent isActive={activeTab === "tax-planning"}>
          <Suspense fallback={<SectionSkeleton />}>
            <TaxPlanningDashboard filteredData={filteredData} />
          </Suspense>
        </TabContent>

        <TabContent isActive={activeTab === "family-housing"}>
          <Suspense fallback={<SectionSkeleton />}>
            <FamilyHousingManager filteredData={filteredData} />
          </Suspense>
        </TabContent>

        <TabContent isActive={activeTab === "lifestyle"}>
          <Suspense fallback={<SectionSkeleton />}>
            <CreditCardFoodOptimizer filteredData={filteredData} />
          </Suspense>
        </TabContent>

        <TabContent isActive={activeTab === "budget-goals"}>
          <Suspense fallback={<SectionSkeleton />}>
            <BudgetGoalsSection
              filteredData={filteredData}
              kpiData={kpiData}
              accountBalances={accountBalances}
            />
          </Suspense>
        </TabContent>

        <TabContent isActive={activeTab === "patterns"}>
          <Suspense fallback={<SectionSkeleton />}>
            <PatternsPage filteredData={filteredData} />
          </Suspense>
        </TabContent>

        <TabContent isActive={activeTab === "transactions"}>
          <Suspense fallback={<SectionSkeleton />}>
            <TransactionsPage
              filteredData={filteredData}
              handleSort={handleSort}
              currentPage={currentPage}
              transactionsPerPage={transactionsPerPage}
            />
          </Suspense>
        </TabContent>

        <Footer />
      </div>

      {/* Upload Success/Error Notification */}
      {uploadNotification.show && (
        <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-2 max-w-md">
          <div
            className={`rounded-lg border shadow-lg p-4 ${
              uploadNotification.type === "success"
                ? "bg-green-900/95 border-green-700"
                : "bg-red-900/95 border-red-700"
            }`}
          >
            <div className="flex items-start gap-3">
              {uploadNotification.type === "success" ? (
                <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h4 className="font-semibold text-white mb-2">
                  {uploadNotification.type === "success" ? "Upload Successful!" : "Upload Failed"}
                </h4>
                {uploadNotification.type === "success" && uploadNotification.stats ? (
                  <div className="text-sm text-gray-200 space-y-1">
                    <div className="flex justify-between">
                      <span>
                        ✨ <strong>Inserted:</strong>
                      </span>
                      <span className="text-green-300 font-semibold">
                        {uploadNotification.stats.inserted}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        🔄 <strong>Updated:</strong>
                      </span>
                      <span className="text-blue-300 font-semibold">
                        {uploadNotification.stats.updated}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        🗑️ <strong>Deleted:</strong>
                      </span>
                      <span className="text-red-300 font-semibold">
                        {uploadNotification.stats.deleted}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        ⏸️ <strong>Unchanged:</strong>
                      </span>
                      <span className="text-gray-400 font-semibold">
                        {uploadNotification.stats.unchanged}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 mt-2 border-t border-green-700">
                      <span>
                        📊 <strong>Total:</strong>
                      </span>
                      <span className="text-white font-bold">
                        {uploadNotification.stats.processed}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-200">{uploadNotification.message}</p>
                )}
              </div>
              <button
                onClick={() => setUploadNotification({ show: false, type: "success" })}
                className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Confirmation Dialog */}
      <Dialog
        open={showUploadDialog}
        onOpenChange={(open) => {
          if (!open) handleCancelUpload();
        }}
      >
        <DialogContent
          className="sm:max-w-md bg-slate-900 border-slate-700"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-white">
              <AlertCircle className="h-6 w-6 text-yellow-500" />
              Confirm Excel Upload
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              You are about to upload: <strong className="text-white">{pendingFile?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <UploadIcon className="h-4 w-4" />
                This upload will:
              </h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">✨</span>
                  <span>
                    <strong className="text-white">Insert</strong> new transactions found in the
                    file
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold">🔄</span>
                  <span>
                    <strong className="text-white">Update</strong> existing transactions that have
                    changed
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">🗑️</span>
                  <span>
                    <strong className="text-white">Soft delete</strong> transactions no longer in
                    the file
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">⏸️</span>
                  <span>
                    <strong className="text-white">Skip</strong> unchanged transactions
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-sm text-yellow-200">
                <strong>Note:</strong> This operation will sync your database with the Excel file.
                Existing data may be modified.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelUpload}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmUpload}
              className="bg-blue-600 hover:bg-blue-500"
            >
              Yes, Upload & Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default App;
