import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Receipt, Calculator, TrendingUp, ChevronLeft, ChevronRight, IndianRupee } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'

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
  standardDeduction: number = 0
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
  
  // Professional Tax (₹2,400 annual in most states)
  const professionalTax = 2400
  
  // Total tax including cess and professional tax
  const totalTax = tax + cess + professionalTax

  return { tax, slabBreakdown, cess, professionalTax, totalTax }
}

// Reverse calculate gross income from net income (after tax)
function calculateGrossFromNet(
  netIncome: number, 
  slabs: TaxSlab[], 
  standardDeduction: number = 0,
  maxIterations: number = 10
): number {
  // Use iterative approach to find gross income
  let grossIncome = netIncome
  
  for (let i = 0; i < maxIterations; i++) {
    const { totalTax } = calculateTax(grossIncome, slabs, standardDeduction)
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

  // Group transactions by Financial Year
  const transactionsByFY = useMemo(() => {
    const grouped: Record<string, { 
      income: number
      expense: number
      taxableIncome: number
      transactions: typeof allTransactions 
    }> = {}

    for (const tx of allTransactions) {
      const fy = getFYFromDate(tx.date)
      if (!grouped[fy]) {
        grouped[fy] = { income: 0, expense: 0, taxableIncome: 0, transactions: [] }
      }
      grouped[fy].transactions.push(tx)

      if (tx.type === 'Income') {
        grouped[fy].income += tx.amount
        
        // Check if this is employment income (taxable)
        const employmentCategories = ['salary', 'stipend', 'rsu', 'bonus', 'employment']
        const category = tx.category?.toLowerCase() || ''
        const subCategory = tx.sub_category?.toLowerCase() || ''
        
        if (employmentCategories.some(emp => 
          category.includes(emp) || subCategory.includes(emp)
        )) {
          grouped[fy].taxableIncome += tx.amount
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
  const income = currentFYData?.income || 0
  const expense = currentFYData?.expense || 0
  const netTaxableIncome = currentFYData?.taxableIncome || 0 // This is AFTER tax
  const netIncome = income - expense

  // Determine which tax slabs to use
  const fyYear = selectedFY ? parseInt(selectedFY.split(' ')[1].split('-')[0]) : 0
  const isNewRegime = fyYear >= 2025
  const taxSlabs = isNewRegime ? TAX_SLABS_NEW : TAX_SLABS_OLD

  // Standard deduction based on FY
  const standardDeduction = fyYear >= 2024 ? 75000 : 50000

  // Since income is already post-tax, calculate gross income and tax already paid
  const grossTaxableIncome = calculateGrossFromNet(netTaxableIncome, taxSlabs, standardDeduction)
  const { tax: baseTax, slabBreakdown, cess, professionalTax, totalTax: taxAlreadyPaid } = calculateTax(grossTaxableIncome, taxSlabs, standardDeduction)

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

            <div className="text-center">
              <h2 className="text-3xl font-bold text-white">{selectedFY || 'Select FY'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isNewRegime ? 'New Tax Regime (2025-26 onwards)' : 'Old Tax Regime (Before 2025-26)'}
              </p>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
                <p className="text-sm text-muted-foreground">Total Income</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : `₹${income.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                </p>
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
              <div className="p-3 bg-red-500/20 rounded-xl shadow-lg shadow-red-500/30">
                <Receipt className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Expense</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : `₹${expense.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                </p>
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
              <div className="p-3 bg-blue-500/20 rounded-xl shadow-lg shadow-blue-500/30">
                <IndianRupee className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Taxable Income (Net)</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : `₹${netTaxableIncome.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">After tax deduction</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/20 rounded-xl shadow-lg shadow-green-500/30">
                <IndianRupee className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gross Income (Estimated)</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : `₹${grossTaxableIncome.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Before tax deduction</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
                <Calculator className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tax Already Paid</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : `₹${taxAlreadyPaid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
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
          transition={{ delay: 0.5 }}
          className="glass rounded-xl border border-white/10 p-6 shadow-lg"
        >
          <h3 className="text-xl font-semibold text-white mb-4">
            {isNewRegime ? 'Tax Slabs (FY 2025-26 Onwards)' : 'Tax Slabs (Before FY 2025-26)'}
          </h3>
          
          {/* Standard Deduction Info */}
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-400">
              ℹ️ Standard Deduction: <span className="font-semibold">₹{standardDeduction.toLocaleString('en-IN')}</span>
              {fyYear >= 2024 ? ' (from FY 2024-25)' : ' (before FY 2024-25)'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tax calculated on: ₹{(grossTaxableIncome - standardDeduction).toLocaleString('en-IN')} (Gross - Standard Deduction)
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
                  const breakdown = slabBreakdown.find(b => b.slab === slab)
                  const taxAmount = breakdown?.taxAmount || 0
                  const isApplicable = grossTaxableIncome > slab.lower

                  return (
                    <tr
                      key={index}
                      className={`border-b border-white/5 ${isApplicable ? 'bg-primary/5' : ''}`}
                    >
                      <td className="py-3 px-4 text-white">
                        ₹{slab.lower.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-white">
                        {slab.upper === Infinity
                          ? 'Above'
                          : `₹${slab.upper.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                      </td>
                      <td className="py-3 px-4 text-right text-white font-semibold">{slab.rate.toFixed(2)}%</td>
                      <td className="py-3 px-4 text-right font-bold text-primary">
                        {isApplicable ? `₹${taxAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '₹0.00'}
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t border-white/10">
                  <td colSpan={3} className="py-3 px-4 text-right font-semibold text-white">
                    Tax on Base:
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-white">
                    ₹{baseTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="border-b border-white/5">
                  <td colSpan={3} className="py-3 px-4 text-right text-sm text-gray-400">
                    + Health & Education Cess (4%):
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-gray-300">
                    ₹{cess.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="border-b border-white/5">
                  <td colSpan={3} className="py-3 px-4 text-right text-sm text-gray-400">
                    + Professional Tax:
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-gray-300">
                    ₹{professionalTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="border-t-2 border-primary/30">
                  <td colSpan={3} className="py-4 px-4 text-right text-lg font-bold text-white">
                    Total Tax Already Paid:
                  </td>
                  <td className="py-4 px-4 text-right text-2xl font-bold text-primary">
                    ₹{taxAlreadyPaid.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
                {grossTaxableIncome > 0 ? ((taxAlreadyPaid / grossTaxableIncome) * 100).toFixed(2) : '0.00'}%
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-gray-400 mb-2">Gross Taxable Income</p>
              <p className="text-2xl font-bold text-blue-400">
                ₹{grossTaxableIncome.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-gray-400 mb-2">Net Received (After Tax)</p>
              <p className="text-2xl font-bold text-green-400">
                ₹{netTaxableIncome.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-gray-400 mb-2">Net Savings</p>
              <p className="text-2xl font-bold text-purple-400">
                ₹{(income - expense).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
