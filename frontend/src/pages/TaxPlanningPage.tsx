import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { classifyIncomeType } from '@/lib/preferencesUtils'
import { formatCurrency } from '@/lib/formatters'
import {
  FY_START_MONTH,
  calculateTax,
  calculateGrossFromNet,
  getFYFromDate,
  getTaxSlabsForFY,
  getStandardDeduction,
  parseFYStartYear,
} from '@/lib/taxCalculator'
import { PageHeader } from '@/components/ui'
import TaxSummaryCards from '@/components/analytics/TaxSummaryCards'
import TaxSlabBreakdown from '@/components/analytics/TaxSlabBreakdown'
import TaxSummaryGrid from '@/components/analytics/TaxSummaryGrid'
import TaxableIncomeTable from '@/components/analytics/TaxableIncomeTable'

/** Result of classifying an income transaction for tax grouping */
interface IncomeGroupAccumulator {
  [key: string]: {
    total: number
    transactions: Array<{ date: string; type: string; amount: number; category: string; note?: string; subcategory?: string }>
  }
}

interface FYData {
  income: number
  expense: number
  taxableIncome: number
  salaryMonths: Set<string>
  transactions: Array<{ date: string; type: string; amount: number; category: string; note?: string; subcategory?: string }>
  incomeGroups: IncomeGroupAccumulator
}

/** Classify and accumulate an income transaction into the FY group */
function classifyAndAccumulateIncome(
  tx: { date: string; type: string; amount: number; category: string; note?: string; subcategory?: string },
  fyData: FYData,
  incomeClassification: { taxable: string[]; investmentReturns: string[]; nonTaxable: string[]; other: string[] },
): void {
  const incomeType = classifyIncomeType(tx, incomeClassification)
  const note = tx.note?.toLowerCase() || ''
  const subcategory = (tx.subcategory || '').toLowerCase()

  const isEPF =
    note.includes('aws epf') ||
    note.includes('epf withdrawal') ||
    (tx.category === 'Employment Income' && tx.subcategory === 'EPF Contribution')

  if (isEPF) {
    const epfTaxablePortion = tx.amount / 2
    fyData.taxableIncome += epfTaxablePortion
    fyData.incomeGroups.EPF.total += epfTaxablePortion
    fyData.incomeGroups.EPF.transactions.push(tx)
    return
  }

  if (incomeType !== 'taxable') return

  fyData.taxableIncome += tx.amount
  const isSalaryOrStipend = subcategory === 'salary' || subcategory === 'stipend'
  const isBonus = subcategory === 'bonuses' || subcategory === 'rsus'

  if (isSalaryOrStipend) {
    fyData.incomeGroups['Salary & Stipend'].total += tx.amount
    fyData.incomeGroups['Salary & Stipend'].transactions.push(tx)
    fyData.salaryMonths.add(tx.date.substring(0, 7))
  } else if (isBonus) {
    fyData.incomeGroups['Bonus'].total += tx.amount
    fyData.incomeGroups['Bonus'].transactions.push(tx)
  } else {
    fyData.incomeGroups['Other Taxable Income'].total += tx.amount
    fyData.incomeGroups['Other Taxable Income'].transactions.push(tx)
  }
}

/** Create an empty FY data bucket */
function createEmptyFYData(): FYData {
  return {
    income: 0,
    expense: 0,
    taxableIncome: 0,
    salaryMonths: new Set(),
    transactions: [],
    incomeGroups: {
      'Salary & Stipend': { total: 0, transactions: [] },
      Bonus: { total: 0, transactions: [] },
      EPF: { total: 0, transactions: [] },
      'Other Taxable Income': { total: 0, transactions: [] },
    },
  }
}

interface ProjectionResult {
  grossTaxableIncome: number
  taxAlreadyPaid: number
  baseTax: number
  cess: number
  professionalTax: number
  slabBreakdown: Array<{ slab: string; taxableAmount: number; tax: number }>
  remainingMonths: number
  avgMonthlySalary: number
  projectedAdditionalIncome: number
}

/** Calculate year-end projection for the current FY */
function calculateProjection(
  currentFYData: FYData | null,
  netTaxableIncome: number,
  salaryMonthsCount: number,
  taxSlabs: Array<{ min: number; max: number; rate: number }>,
  standardDeduction: number,
): ProjectionResult {
  const today = new Date()
  const currentMonth = today.getMonth()
  const remainingMonths = currentMonth >= 3 ? 12 - (currentMonth - 3) : 3 - currentMonth

  const salaryStipendTxs = currentFYData?.incomeGroups?.['Salary & Stipend']?.transactions || []

  if (salaryStipendTxs.length === 0 || remainingMonths <= 0) {
    return {
      grossTaxableIncome: 0,
      taxAlreadyPaid: 0,
      baseTax: 0,
      cess: 0,
      professionalTax: 0,
      slabBreakdown: [],
      remainingMonths,
      avgMonthlySalary: 0,
      projectedAdditionalIncome: 0,
    }
  }

  const sorted = [...salaryStipendTxs].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  const recentSalaries = sorted.slice(0, Math.min(3, sorted.length))
  const totalRecentSalary = recentSalaries.reduce((sum, tx) => sum + tx.amount, 0)
  const avgMonthlySalary = totalRecentSalary / recentSalaries.length

  const projectedAdditionalIncome = avgMonthlySalary * remainingMonths
  const projectedNetTotal = netTaxableIncome + projectedAdditionalIncome
  const projectedSalaryMonthsCount = salaryMonthsCount + remainingMonths

  const grossTaxableIncome = calculateGrossFromNet(
    projectedNetTotal,
    taxSlabs,
    standardDeduction,
    true,
    projectedSalaryMonthsCount,
  )
  const projectedCalc = calculateTax(
    grossTaxableIncome,
    taxSlabs,
    standardDeduction,
    true,
    projectedSalaryMonthsCount,
  )

  return {
    grossTaxableIncome,
    taxAlreadyPaid: projectedCalc.totalTax,
    baseTax: projectedCalc.tax,
    cess: projectedCalc.cess,
    professionalTax: projectedCalc.professionalTax,
    slabBreakdown: projectedCalc.slabBreakdown,
    remainingMonths,
    avgMonthlySalary,
    projectedAdditionalIncome,
  }
}

/** Resolve actual vs projected display values */
function resolveDisplayValues(
  projection: ProjectionResult | null,
  actual: {
    grossTaxableIncome: number
    netTaxableIncome: number
    taxAlreadyPaid: number
    baseTax: number
    cess: number
    professionalTax: number
    slabBreakdown: Array<{ slab: string; taxableAmount: number; tax: number }>
    income: number
  },
) {
  if (!projection) {
    return {
      gross: actual.grossTaxableIncome,
      net: actual.netTaxableIncome,
      totalTax: actual.taxAlreadyPaid,
      baseTax: actual.baseTax,
      cess: actual.cess,
      professionalTax: actual.professionalTax,
      slabBreakdown: actual.slabBreakdown,
      income: actual.income,
    }
  }
  return {
    gross: projection.grossTaxableIncome,
    net: actual.netTaxableIncome + projection.projectedAdditionalIncome,
    totalTax: projection.taxAlreadyPaid,
    baseTax: projection.baseTax,
    cess: projection.cess,
    professionalTax: projection.professionalTax,
    slabBreakdown: projection.slabBreakdown,
    income: actual.income + projection.projectedAdditionalIncome,
  }
}

export default function TaxPlanningPage() {
  const { data: allTransactions = [], isLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const [selectedFY, setSelectedFY] = useState<string>('')
  const [showProjection, setShowProjection] = useState(false)

  // Get fiscal year start month from preferences (default to April)
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || FY_START_MONTH

  // Get income classification from preferences for tax categorization
  const incomeClassification = useMemo(
    () => ({
      taxable: preferences?.taxable_income_categories || [],
      investmentReturns: preferences?.investment_returns_categories || [],
      nonTaxable: preferences?.non_taxable_income_categories || [],
      other: preferences?.other_income_categories || [],
    }),
    [preferences],
  )

  // Group transactions by Financial Year
  const transactionsByFY = useMemo(() => {
    const grouped: Record<string, FYData> = {}

    for (const tx of allTransactions) {
      const fy = getFYFromDate(tx.date, fiscalYearStartMonth)
      if (!grouped[fy]) {
        grouped[fy] = createEmptyFYData()
      }
      grouped[fy].transactions.push(tx)

      if (tx.type === 'Income') {
        grouped[fy].income += tx.amount
        classifyAndAccumulateIncome(tx, grouped[fy], incomeClassification)
      } else if (tx.type === 'Expense') {
        grouped[fy].expense += tx.amount
      }
    }

    return grouped
  }, [allTransactions, fiscalYearStartMonth, incomeClassification])

  // Get sorted FY list
  const fyList = useMemo(() => {
    return Object.keys(transactionsByFY)
      .sort((a, b) => a.localeCompare(b))
      .reverse()
  }, [transactionsByFY])

  // Set initial FY
  if (!selectedFY && fyList.length > 0) {
    setSelectedFY(fyList[0])
  }

  // ── Derived values for selected FY ──────────────────────────────────

  const currentFYData = selectedFY ? transactionsByFY[selectedFY] : null
  const income = currentFYData?.income || 0
  const expense = currentFYData?.expense || 0
  const netTaxableIncome = currentFYData?.taxableIncome || 0
  const salaryMonthsCount = currentFYData?.salaryMonths?.size || 0

  // Determine which tax slabs to use
  const fyYear = selectedFY ? parseFYStartYear(selectedFY) : 0
  const isNewRegime = fyYear >= 2025
  const taxSlabs = getTaxSlabsForFY(fyYear)
  const standardDeduction = getStandardDeduction(fyYear)

  // Calculate gross income from net received (reverse calculation)
  const hasEmploymentIncome = netTaxableIncome > 0

  const grossTaxableIncome = calculateGrossFromNet(
    netTaxableIncome,
    taxSlabs,
    standardDeduction,
    hasEmploymentIncome,
    salaryMonthsCount,
  )
  const {
    tax: baseTax,
    slabBreakdown,
    cess,
    professionalTax,
    totalTax: taxAlreadyPaid,
  } = calculateTax(
    grossTaxableIncome,
    taxSlabs,
    standardDeduction,
    hasEmploymentIncome,
    salaryMonthsCount,
  )

  // ── Projection for remaining months ─────────────────────────────────

  const currentFYLabel = getFYFromDate(
    new Date().toISOString().split('T')[0],
    fiscalYearStartMonth,
  )
  const isCurrentFY = selectedFY === currentFYLabel
  const useProjected = showProjection && isCurrentFY && hasEmploymentIncome

  const projection = useProjected
    ? calculateProjection(currentFYData, netTaxableIncome, salaryMonthsCount, taxSlabs, standardDeduction)
    : null

  const remainingMonths = projection?.remainingMonths ?? 0
  const avgMonthlySalary = projection?.avgMonthlySalary ?? 0

  // ── Resolve "actual vs projected" display values ────────────────────

  const displayValues = resolveDisplayValues(projection, {
    grossTaxableIncome,
    netTaxableIncome,
    taxAlreadyPaid,
    baseTax,
    cess,
    professionalTax,
    slabBreakdown,
    income,
  })

  const displayGross = displayValues.gross
  const displayNet = displayValues.net
  const displayTotalTax = displayValues.totalTax
  const displayBaseTax = displayValues.baseTax
  const displayCess = displayValues.cess
  const displayProfessionalTax = displayValues.professionalTax
  const displaySlabBreakdown = displayValues.slabBreakdown
  const displayIncome = displayValues.income

  // ── FY navigation ───────────────────────────────────────────────────

  const currentIndex = fyList.indexOf(selectedFY)
  const canGoBack = currentIndex < fyList.length - 1
  const canGoForward = currentIndex > 0

  const goToPreviousFY = () => {
    if (canGoBack) setSelectedFY(fyList[currentIndex + 1])
  }
  const goToNextFY = () => {
    if (canGoForward) setSelectedFY(fyList[currentIndex - 1])
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <motion.div
        className="max-w-7xl mx-auto space-y-4 md:space-y-6"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <motion.div variants={fadeUpItem}>
          <PageHeader
            title="Tax Planning"
            subtitle={`Estimate your tax liability and plan ahead${isNewRegime ? ' — New Tax Regime (2025-26 onwards)' : ' — Old Tax Regime (Before 2025-26)'}`}
            action={
              <div className="flex items-center gap-4">
                {/* Year-End Projection Toggle — LEFT */}
                {isCurrentFY && hasEmploymentIncome && (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => setShowProjection(!showProjection)}
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        showProjection
                          ? 'bg-primary text-white shadow-lg shadow-primary/50'
                          : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-border'
                      }`}
                    >
                      {showProjection ? 'Showing Projection' : 'Year-End Projection'}
                    </button>
                    {showProjection && remainingMonths > 0 && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        +{remainingMonths} mo @ {formatCurrency(avgMonthlySalary)}/mo
                      </span>
                    )}
                  </div>
                )}

                {/* FY Navigation — RIGHT */}
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={goToPreviousFY}
                    disabled={!canGoBack}
                    className="p-2 rounded-lg glass-thin hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    whileTap={canGoBack ? { scale: 0.95 } : undefined}
                    aria-label="Previous FY"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </motion.button>

                  <span className="text-white font-medium min-w-28 text-center">
                    {selectedFY || 'Select FY'}
                  </span>

                  <motion.button
                    onClick={goToNextFY}
                    disabled={!canGoForward}
                    className="p-2 rounded-lg glass-thin hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    whileTap={canGoForward ? { scale: 0.95 } : undefined}
                    aria-label="Next FY"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            }
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <TaxSummaryCards
            isLoading={isLoading}
            netTaxableIncome={displayNet}
            grossTaxableIncome={displayGross}
            taxAlreadyPaid={displayTotalTax}
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <TaxSlabBreakdown
            isNewRegime={isNewRegime}
            taxSlabs={taxSlabs}
            slabBreakdown={displaySlabBreakdown}
            grossTaxableIncome={displayGross}
            standardDeduction={standardDeduction}
            fyYear={fyYear}
            baseTax={displayBaseTax}
            cess={displayCess}
            professionalTax={displayProfessionalTax}
            totalTax={displayTotalTax}
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <TaxSummaryGrid
            selectedFY={selectedFY}
            grossTaxableIncome={displayGross}
            taxAlreadyPaid={displayTotalTax}
            netTaxableIncome={displayNet}
            totalIncome={displayIncome}
            totalExpense={expense}
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <TaxableIncomeTable
            selectedFY={selectedFY}
            incomeGroups={currentFYData?.incomeGroups}
            netTaxableIncome={netTaxableIncome}
          />
        </motion.div>
      </motion.div>
    </div>
  )
}
