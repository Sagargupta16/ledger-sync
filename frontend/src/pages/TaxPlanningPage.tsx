import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Calculator, TrendingUp, ChevronLeft, ChevronRight, IndianRupee } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/formatters'

// Tax slabs before FY 2025-26
const TAX_SLABS_OLD = [
  { lower: 0, upper: 300000, rate: 0 },
  { lower: 300000, upper: 700000, rate: 5 },
  { lower: 700000, upper: 1000000, rate: 10 },
  { lower: 1000000, upper: 1200000, rate: 15 },
  { lower: 1200000, upper: 1500000, rate: 20 },
  { lower: 1500000, upper: Infinity, rate: 30 },
]

// Tax slabs from FY 2025-26 onwards
const TAX_SLABS_NEW = [
  { lower: 0, upper: 400000, rate: 0 },
  { lower: 400000, upper: 800000, rate: 5 },
  { lower: 800000, upper: 1200000, rate: 10 },
  { lower: 1200000, upper: 1600000, rate: 15 },
  { lower: 1600000, upper: 2000000, rate: 20 },
  { lower: 2000000, upper: 2400000, rate: 25 },
  { lower: 2400000, upper: Infinity, rate: 30 },
]

interface TaxSlab {
  lower: number
  upper: number
  rate: number
}

function calculateTax(
  income: number, 
  slabs: TaxSlab[], 
  standardDeduction: number = 0,
  applyProfessionalTax: boolean = true,
  salaryMonthsCount: number = 12
): { 
  tax: number
  slabBreakdown: { slab: TaxSlab; taxAmount: number }[]
  cess: number
  professionalTax: number
  totalTax: number
} {
  // Apply standard deduction only
  const taxableIncome = Math.max(0, income - standardDeduction)
  
  let tax = 0
  const slabBreakdown: { slab: TaxSlab; taxAmount: number }[] = []

  for (const slab of slabs) {
    if (taxableIncome > slab.lower) {
      const taxableInSlab = Math.min(taxableIncome, slab.upper) - slab.lower
      const taxAmount = (taxableInSlab * slab.rate) / 100
      tax += taxAmount
      slabBreakdown.push({ slab, taxAmount })
    }
  }

  // Add 4% Health & Education Cess
  const cess = tax * 0.04
  
  // Professional Tax (₹200/month, capped at 12 months maximum)
  const professionalTax = applyProfessionalTax ? (200 * Math.min(salaryMonthsCount, 12)) : 0
  
  // Total tax including cess and professional tax
  const totalTax = tax + cess + professionalTax

  return { tax, slabBreakdown, cess, professionalTax, totalTax }
}

// Reverse calculate gross income from net income (after tax)
function calculateGrossFromNet(
  netIncome: number, 
  slabs: TaxSlab[], 
  standardDeduction: number = 0,
  applyProfessionalTax: boolean = true,
  salaryMonthsCount: number = 12,
  maxIterations: number = 10
): number {
  // If no income, return 0 immediately
  if (netIncome <= 0) {
    return 0
  }
  
  // Use iterative approach to find gross income
  let grossIncome = netIncome
  
  for (let i = 0; i < maxIterations; i++) {
    const { totalTax } = calculateTax(grossIncome, slabs, standardDeduction, applyProfessionalTax, salaryMonthsCount)
    const calculatedNet = grossIncome - totalTax
    
    // If we're close enough, return
    if (Math.abs(calculatedNet - netIncome) < 1) {
      return grossIncome
    }
    
    // Adjust gross income for next iteration
    const error = netIncome - calculatedNet
    grossIncome += error
  }
  
  return grossIncome
}

function getFYFromDate(date: string): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = d.getMonth() + 1 // 0-indexed

  // FY runs from April to March
  if (month >= 4) {
    return `FY ${year}-${(year + 1).toString().slice(-2)}`
  }
  return `FY ${year - 1}-${year.toString().slice(-2)}`
}

export default function TaxPlanningPage() {
  const { data: allTransactions = [], isLoading } = useTransactions()
  const [selectedFY, setSelectedFY] = useState<string>('')
  const [showProjection, setShowProjection] = useState(false)

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
      const fy = getFYFromDate(tx.date)
      if (!grouped[fy]) {
        grouped[fy] = {
          income: 0,
          expense: 0,
          taxableIncome: 0,
          salaryMonths: new Set(),
          transactions: [],
          incomeGroups: {
            'Salary & Stipend': { total: 0, transactions: [] },
            EPF: { total: 0, transactions: [] },
            'Other Taxable Income': { total: 0, transactions: [] },
          },
        }
      }
      grouped[fy].transactions.push(tx)

      if (tx.type === 'Income') {
        grouped[fy].income += tx.amount

        const note = tx.note?.toLowerCase() || ''
        const isSalaryOrStipend = note.includes('salary') || note.includes('stipend')
        const isEPF = note.includes('aws epf')
        const isOtherTaxable = note.includes('rsu') || note.includes('pluxee') || note.includes('aws relocation money')

        if (isSalaryOrStipend) {
            grouped[fy].taxableIncome += tx.amount
            grouped[fy].incomeGroups['Salary & Stipend'].total += tx.amount
            grouped[fy].incomeGroups['Salary & Stipend'].transactions.push(tx)
            const month = tx.date.substring(0, 7)
            grouped[fy].salaryMonths.add(month)
        } else if (isEPF) {
            const epfTaxablePortion = tx.amount / 2
            grouped[fy].taxableIncome += epfTaxablePortion
            grouped[fy].incomeGroups.EPF.total += epfTaxablePortion
            grouped[fy].incomeGroups.EPF.transactions.push(tx)
        } else if (isOtherTaxable) {
            grouped[fy].taxableIncome += tx.amount
            grouped[fy].incomeGroups['Other Taxable Income'].total += tx.amount
            grouped[fy].incomeGroups['Other Taxable Income'].transactions.push(tx)
        }
      } else if (tx.type === 'Expense') {
        grouped[fy].expense += tx.amount
      }
    }

    return grouped
  }, [allTransactions])

  // Get sorted FY list
  const fyList = useMemo(() => {
    return Object.keys(transactionsByFY).sort().reverse()
  }, [transactionsByFY])

  // Set initial FY
  if (!selectedFY && fyList.length > 0) {
    setSelectedFY(fyList[0])
  }

  // Get data for selected FY from transactions
  const currentFYData = selectedFY ? transactionsByFY[selectedFY] : null
  const income = currentFYData?.income || 0  // Total income (all types)
  const expense = currentFYData?.expense || 0
  const netTaxableIncome = currentFYData?.taxableIncome || 0  // Net received after TDS (Salary + Stipend + RSU only)
  const salaryMonthsCount = currentFYData?.salaryMonths?.size || 0  // Unique months with Salary/Stipend

  // Determine which tax slabs to use
  const fyYear = selectedFY ? parseInt(selectedFY.split(' ')[1].split('-')[0]) : 0
  const isNewRegime = fyYear >= 2025
  const taxSlabs = isNewRegime ? TAX_SLABS_NEW : TAX_SLABS_OLD

  // Standard deduction based on FY
  const standardDeduction = fyYear >= 2024 ? 75000 : 50000

  // Calculate gross income from net received (reverse calculation)
  // netTaxableIncome = what you actually received (after TDS)
  // grossTaxableIncome = what you earned before tax (before std deduction)
  const hasEmploymentIncome = netTaxableIncome > 0
  
  const grossTaxableIncome = calculateGrossFromNet(netTaxableIncome, taxSlabs, standardDeduction, hasEmploymentIncome, salaryMonthsCount)
  const {tax: baseTax, slabBreakdown, cess, professionalTax, totalTax: taxAlreadyPaid} = calculateTax(grossTaxableIncome, taxSlabs, standardDeduction, hasEmploymentIncome, salaryMonthsCount)

  // Projection calculations for remaining months
  const isCurrentFY = selectedFY === fyList[0]
  let projectedGrossTaxableIncome = grossTaxableIncome
  let projectedTaxAlreadyPaid = taxAlreadyPaid
  let projectedBaseTax = baseTax
  let projectedCess = cess
  let projectedProfessionalTax = professionalTax
  let projectedSlabBreakdown = slabBreakdown
  let remainingMonths = 0
  let lastMonthSalary = 0
  let projectedAdditionalIncome = 0
  
  if (showProjection && isCurrentFY && hasEmploymentIncome) {
    // Get current month (0-11)
    const now = new Date()
    const currentMonth = now.getMonth() // 0 = Jan, 3 = Apr
    
    // Financial year runs Apr (3) to Mar (2)
    // Calculate remaining months INCLUDING current month (since salary not received yet in current month)
    // If current month is Apr-Dec (3-11), remaining = 12 - (month - 3)
    // If current month is Jan-Mar (0-2), remaining = 3 - month
    if (currentMonth >= 3) {
      remainingMonths = 12 - (currentMonth - 3)
    } else {
      remainingMonths = 3 - currentMonth
    }
    
    // Get the last AWS Salary transaction
    const salaryTransactions = currentFYData?.transactions
      .filter(tx => {
        if (tx.type !== 'Income') return false
        const note = tx.note?.toLowerCase() || ''
        return note.includes('aws salary')
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || []
    
    if (salaryTransactions.length > 0 && remainingMonths > 0) {
      lastMonthSalary = salaryTransactions[0].amount
      projectedAdditionalIncome = lastMonthSalary * remainingMonths
      const projectedNetTotal = netTaxableIncome + projectedAdditionalIncome
      const projectedSalaryMonthsCount = salaryMonthsCount + remainingMonths
      
      projectedGrossTaxableIncome = calculateGrossFromNet(projectedNetTotal, taxSlabs, standardDeduction, true, projectedSalaryMonthsCount)
      const projectedCalc = calculateTax(projectedGrossTaxableIncome, taxSlabs, standardDeduction, true, projectedSalaryMonthsCount)
      projectedBaseTax = projectedCalc.tax
      projectedSlabBreakdown = projectedCalc.slabBreakdown
      projectedCess = projectedCalc.cess
      projectedProfessionalTax = projectedCalc.professionalTax
      projectedTaxAlreadyPaid = projectedCalc.totalTax
    }
  }

  // Navigate FY
  const currentIndex = fyList.indexOf(selectedFY)
  const goToPreviousFY = () => {
    if (currentIndex < fyList.length - 1) {
      setSelectedFY(fyList[currentIndex + 1])
    }
  }
  const goToNextFY = () => {
    if (currentIndex > 0) {
      setSelectedFY(fyList[currentIndex - 1])
    }
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Tax Planning & Calculation
          </h1>
          <p className="text-muted-foreground mt-2">
            Track income tax by Financial Year
          </p>
          
          {/* Projection Toggle */}
          {isCurrentFY && hasEmploymentIncome && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => setShowProjection(!showProjection)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  showProjection
                    ? 'bg-primary text-white shadow-lg shadow-primary/50'
                    : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                }`}
              >
                {showProjection ? '📊 Showing Projection' : '📈 Show Year-End Projection'}
              </button>
              {showProjection && remainingMonths > 0 && (
                <span className="text-sm text-muted-foreground">
                  Projecting {remainingMonths} more {remainingMonths === 1 ? 'month' : 'months'} @ {formatCurrency(lastMonthSalary)}/month
                </span>
              )}
            </div>
          )}
        </motion.div>

        {/* FY Selector */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <button
              onClick={goToPreviousFY}
              disabled={currentIndex >= fyList.length - 1}
              className="p-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-white/10"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center flex-1">
              <div className="flex items-center justify-center gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-white">{selectedFY || 'Select FY'}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isNewRegime ? 'New Tax Regime (2025-26 onwards)' : 'Old Tax Regime (Before 2025-26)'}
                  </p>
                </div>
                
                {/* Projection Toggle - only for current FY */}
                {isCurrentFY && hasEmploymentIncome && selectedFY === 'FY2025-26' && (
                  <div className="flex flex-col items-start gap-1">
                    <button
                      onClick={() => setShowProjection(!showProjection)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                        showProjection
                          ? 'bg-primary text-white shadow-lg shadow-primary/50'
                          : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                      }`}
                    >
                      {showProjection ? '📊 Showing Projection' : '📈 Show Year-End Projection'}
                    </button>
                    {showProjection && remainingMonths > 0 && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Projecting {remainingMonths} more {remainingMonths === 1 ? 'month' : 'months'} @ {formatCurrency(lastMonthSalary)}/month
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={goToNextFY}
              disabled={currentIndex <= 0}
              className="p-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-white/10"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/20 rounded-xl shadow-lg shadow-green-500/30">
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Salaried Income</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(showProjection && isCurrentFY && hasEmploymentIncome ? netTaxableIncome + projectedAdditionalIncome : netTaxableIncome)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Received after TDS</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/20 rounded-xl shadow-lg shadow-blue-500/30">
                <IndianRupee className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Taxable Income</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(showProjection && isCurrentFY && hasEmploymentIncome ? projectedGrossTaxableIncome : grossTaxableIncome)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Before standard deduction</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
                <Calculator className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tax Already Paid</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(showProjection && isCurrentFY && hasEmploymentIncome ? projectedTaxAlreadyPaid : taxAlreadyPaid)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Deducted at source</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tax Slab Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-xl font-semibold text-white mb-4">
            {isNewRegime ? 'Tax Slabs (FY 2025-26 Onwards)' : 'Tax Slabs (Before FY 2025-26)'}
          </h3>
          
          {/* Standard Deduction Info */}
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-400">
              ℹ️ Standard Deduction: <span className="font-semibold">{formatCurrency(standardDeduction)}</span>
              {fyYear >= 2024 ? ' (from FY 2024-25)' : ' (before FY 2024-25)'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tax calculated on: {formatCurrency(showProjection && isCurrentFY && hasEmploymentIncome ? projectedGrossTaxableIncome : grossTaxableIncome)} (After standard deduction)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Lower Limit</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Upper Limit</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">Tax %</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">Tax Amount</th>
                </tr>
              </thead>
              <tbody>
                {taxSlabs.map((slab, index) => {
                  const breakdown = (showProjection && isCurrentFY && hasEmploymentIncome ? projectedSlabBreakdown : slabBreakdown).find(b => b.slab === slab)
                  const taxAmount = breakdown?.taxAmount || 0
                  const relevantGrossIncome = showProjection && isCurrentFY && hasEmploymentIncome ? projectedGrossTaxableIncome : grossTaxableIncome
                  const isApplicable = relevantGrossIncome > slab.lower

                  return (
                    <tr
                      key={index}
                      className={`border-b border-white/5 ${isApplicable ? 'bg-primary/5' : ''}`}
                    >
                      <td className="py-3 px-4 text-white">
                        {formatCurrency(slab.lower)}
                      </td>
                      <td className="py-3 px-4 text-white">
                        {slab.upper === Infinity
                          ? 'Above'
                          : formatCurrency(slab.upper)}
                      </td>
                      <td className="py-3 px-4 text-right text-white font-semibold">{slab.rate.toFixed(2)}%</td>
                      <td className="py-3 px-4 text-right font-bold text-primary">
                        {isApplicable ? formatCurrency(taxAmount) : formatCurrency(0)}
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t border-white/10">
                  <td colSpan={3} className="py-3 px-4 text-right font-semibold text-white">
                    Tax on Base:
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-white">
                    {formatCurrency(showProjection && isCurrentFY && hasEmploymentIncome ? projectedBaseTax : baseTax)}
                  </td>
                </tr>
                <tr className="border-b border-white/5">
                  <td colSpan={3} className="py-3 px-4 text-right text-sm text-gray-400">
                    + Health & Education Cess (4%):
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-gray-300">
                    {formatCurrency(showProjection && isCurrentFY && hasEmploymentIncome ? projectedCess : cess)}
                  </td>
                </tr>
                <tr className="border-b border-white/5">
                  <td colSpan={3} className="py-3 px-4 text-right text-sm text-gray-400">
                    + Professional Tax:
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-gray-300">
                    {formatCurrency(showProjection && isCurrentFY && hasEmploymentIncome ? projectedProfessionalTax : professionalTax)}
                  </td>
                </tr>
                <tr className="border-t-2 border-primary/30">
                  <td colSpan={3} className="py-4 px-4 text-right text-lg font-bold text-white">
                    Total Tax Already Paid:
                  </td>
                  <td className="py-4 px-4 text-right text-2xl font-bold text-primary">
                    {formatCurrency(showProjection && isCurrentFY && hasEmploymentIncome ? projectedTaxAlreadyPaid : taxAlreadyPaid)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Tax Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Tax Summary for {selectedFY}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-gray-400 mb-2">Effective Tax Rate</p>
              <p className="text-2xl font-bold text-primary">
                {formatPercent((showProjection && isCurrentFY && hasEmploymentIncome ? projectedGrossTaxableIncome : grossTaxableIncome) > 0 ? ((showProjection && isCurrentFY && hasEmploymentIncome ? projectedTaxAlreadyPaid : taxAlreadyPaid) / (showProjection && isCurrentFY && hasEmploymentIncome ? projectedGrossTaxableIncome : grossTaxableIncome)) * 100 : 0)}
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-gray-400 mb-2">Gross Taxable Income</p>
              <p className="text-2xl font-bold text-blue-400">
                {formatCurrency(showProjection && isCurrentFY && hasEmploymentIncome ? projectedGrossTaxableIncome : grossTaxableIncome)}
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-gray-400 mb-2">Net Received (After Tax)</p>
              <p className="text-2xl font-bold text-green-400">
                {formatCurrency(showProjection && isCurrentFY && hasEmploymentIncome ? netTaxableIncome + projectedAdditionalIncome : netTaxableIncome)}
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-gray-400 mb-2">Net Savings</p>
              <p className="text-2xl font-bold text-purple-400">
                {formatCurrency((showProjection && isCurrentFY && hasEmploymentIncome ? income + projectedAdditionalIncome : income) - expense)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Salaried Taxable Income Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Salaried Taxable Income for {selectedFY}</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Date</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-300">Amount</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-300">Note</th>
                </tr>
              </thead>
              <tbody>
                {currentFYData?.incomeGroups && Object.entries(currentFYData.incomeGroups).map(([group, data]) => (
                  data.transactions.length > 0 && (
                    <>
                      <tr className="border-b border-white/10 bg-white/5">
                        <td colSpan={2} className="py-3 px-4 text-left font-bold text-white">{group}</td>
                        <td className="py-3 px-4 text-right font-bold text-white">
                          {formatCurrency(data.total)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-white">
                          {netTaxableIncome > 0 ? formatPercent((data.total / netTaxableIncome) * 100) : '0%'}
                        </td>
                      </tr>
                      {data.transactions.map((tx, index) => (
                        <tr key={index} className="border-b border-white/5">
                          <td className="py-3 px-4 text-white">{new Date(tx.date).toLocaleDateString()}</td>
                          <td className="py-3 px-4 text-right font-bold text-green-400">
                            {formatCurrency(group === 'EPF' ? tx.amount / 2 : tx.amount)}
                          </td>
                          <td className="py-3 px-4 text-white">{tx.type}</td>
                          <td className="py-3 px-4 text-white">{tx.note}</td>
                        </tr>
                      ))}
                    </>
                  )
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
