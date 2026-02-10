import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { classifyIncomeType } from '@/lib/preferencesUtils'
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
import FYNavigator from '@/components/analytics/FYNavigator'
import TaxSummaryCards from '@/components/analytics/TaxSummaryCards'
import TaxSlabBreakdown from '@/components/analytics/TaxSlabBreakdown'
import TaxSummaryGrid from '@/components/analytics/TaxSummaryGrid'
import TaxableIncomeTable from '@/components/analytics/TaxableIncomeTable'

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
    const grouped: Record<
      string,
      {
        income: number
        expense: number
        taxableIncome: number
        salaryMonths: Set<string>
        transactions: typeof allTransactions
        incomeGroups: {
          [key: string]: {
            total: number
            transactions: typeof allTransactions
          }
        }
      }
    > = {}

    for (const tx of allTransactions) {
      const fy = getFYFromDate(tx.date, fiscalYearStartMonth)
      if (!grouped[fy]) {
        grouped[fy] = {
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
      grouped[fy].transactions.push(tx)

      if (tx.type === 'Income') {
        grouped[fy].income += tx.amount

        // Use preferences-based income classification
        const incomeType = classifyIncomeType(tx, incomeClassification)
        const note = tx.note?.toLowerCase() || ''
        const subcategory = (tx.subcategory || '').toLowerCase()

        // EPF handling (special case - half taxable)
        const isEPF =
          note.includes('aws epf') ||
          note.includes('epf withdrawal') ||
          (tx.category === 'Employment Income' && tx.subcategory === 'EPF Contribution')

        // Check if it's salary or stipend specifically (subset of taxable)
        const isSalaryOrStipend = subcategory === 'salary' || subcategory === 'stipend'
        const isBonus = subcategory === 'bonuses' || subcategory === 'rsus'

        // Handle EPF separately (50% taxable rule)
        if (isEPF) {
          const epfTaxablePortion = tx.amount / 2
          grouped[fy].taxableIncome += epfTaxablePortion
          grouped[fy].incomeGroups.EPF.total += epfTaxablePortion
          grouped[fy].incomeGroups.EPF.transactions.push(tx)
        } else if (incomeType === 'taxable') {
          grouped[fy].taxableIncome += tx.amount
          if (isSalaryOrStipend) {
            grouped[fy].incomeGroups['Salary & Stipend'].total += tx.amount
            grouped[fy].incomeGroups['Salary & Stipend'].transactions.push(tx)
            const month = tx.date.substring(0, 7)
            grouped[fy].salaryMonths.add(month)
          } else if (isBonus) {
            grouped[fy].incomeGroups['Bonus'].total += tx.amount
            grouped[fy].incomeGroups['Bonus'].transactions.push(tx)
          } else {
            grouped[fy].incomeGroups['Other Taxable Income'].total += tx.amount
            grouped[fy].incomeGroups['Other Taxable Income'].transactions.push(tx)
          }
        }
        // Note: Investment income and cashback are generally not taxable as regular income
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

  const today = new Date()
  const currentFYLabel = getFYFromDate(
    today.toISOString().split('T')[0],
    fiscalYearStartMonth,
  )
  const isCurrentFY = selectedFY === currentFYLabel

  let projectedGrossTaxableIncome = grossTaxableIncome
  let projectedTaxAlreadyPaid = taxAlreadyPaid
  let projectedBaseTax = baseTax
  let projectedCess = cess
  let projectedProfessionalTax = professionalTax
  let projectedSlabBreakdown = slabBreakdown
  let remainingMonths = 0
  let avgMonthlySalary = 0
  let projectedAdditionalIncome = 0

  if (showProjection && isCurrentFY && hasEmploymentIncome) {
    const currentMonth = today.getMonth() // 0 = Jan, 3 = Apr

    // Financial year runs Apr (3) to Mar (2)
    if (currentMonth >= 3) {
      remainingMonths = 12 - (currentMonth - 3)
    } else {
      remainingMonths = 3 - currentMonth
    }

    // Get average of last 3 months salary from Salary & Stipend group
    const salaryStipendTxs =
      currentFYData?.incomeGroups?.['Salary & Stipend']?.transactions || []

    if (salaryStipendTxs.length > 0 && remainingMonths > 0) {
      const sorted = [...salaryStipendTxs].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      const recentSalaries = sorted.slice(0, Math.min(3, sorted.length))

      const totalRecentSalary = recentSalaries.reduce((sum, tx) => sum + tx.amount, 0)
      avgMonthlySalary = totalRecentSalary / recentSalaries.length

      projectedAdditionalIncome = avgMonthlySalary * remainingMonths
      const projectedNetTotal = netTaxableIncome + projectedAdditionalIncome
      const projectedSalaryMonthsCount = salaryMonthsCount + remainingMonths

      projectedGrossTaxableIncome = calculateGrossFromNet(
        projectedNetTotal,
        taxSlabs,
        standardDeduction,
        true,
        projectedSalaryMonthsCount,
      )
      const projectedCalc = calculateTax(
        projectedGrossTaxableIncome,
        taxSlabs,
        standardDeduction,
        true,
        projectedSalaryMonthsCount,
      )
      projectedBaseTax = projectedCalc.tax
      projectedSlabBreakdown = projectedCalc.slabBreakdown
      projectedCess = projectedCalc.cess
      projectedProfessionalTax = projectedCalc.professionalTax
      projectedTaxAlreadyPaid = projectedCalc.totalTax
    }
  }

  // ── Resolve "actual vs projected" display values ────────────────────

  const useProjected = showProjection && isCurrentFY && hasEmploymentIncome

  const displayGross = useProjected ? projectedGrossTaxableIncome : grossTaxableIncome
  const displayNet = useProjected
    ? netTaxableIncome + projectedAdditionalIncome
    : netTaxableIncome
  const displayTotalTax = useProjected ? projectedTaxAlreadyPaid : taxAlreadyPaid
  const displayBaseTax = useProjected ? projectedBaseTax : baseTax
  const displayCess = useProjected ? projectedCess : cess
  const displayProfessionalTax = useProjected ? projectedProfessionalTax : professionalTax
  const displaySlabBreakdown = useProjected ? projectedSlabBreakdown : slabBreakdown
  const displayIncome = useProjected ? income + projectedAdditionalIncome : income

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
    <div className="min-h-screen p-8">
      <motion.div
        className="max-w-7xl mx-auto space-y-6"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <motion.div variants={fadeUpItem}>
          <PageHeader
            title="Tax Planning"
            subtitle="Estimate your tax liability and plan ahead"
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <FYNavigator
            selectedFY={selectedFY}
            isNewRegime={isNewRegime}
            isCurrentFY={isCurrentFY}
            hasEmploymentIncome={hasEmploymentIncome}
            showProjection={showProjection}
            onToggleProjection={() => setShowProjection(!showProjection)}
            remainingMonths={remainingMonths}
            avgMonthlySalary={avgMonthlySalary}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onGoBack={goToPreviousFY}
            onGoForward={goToNextFY}
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
