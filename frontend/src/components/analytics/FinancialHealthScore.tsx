import { motion } from 'framer-motion'
import { Shield, TrendingUp, AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useInvestmentAccountStore } from '@/store/investmentAccountStore'
import { formatCurrencyCompact } from '@/lib/formatters'

interface HealthMetric {
  name: string
  score: number
  weight: number
  status: 'excellent' | 'good' | 'fair' | 'poor'
  description: string
  details?: string[]
}

// Categories that indicate debt/EMI payments
const DEBT_CATEGORIES = ['EMI', 'Loan', 'Credit Card Payment', 'Mortgage', 'Personal Loan', 'Car Loan', 'Home Loan']

// Categories that indicate discretionary spending
const DISCRETIONARY_CATEGORIES = ['Entertainment', 'Shopping', 'Dining', 'Travel', 'Leisure', 'Recreation', 'Gifts', 'Subscriptions', 'Personal Care']

// Categories that indicate essential spending
const ESSENTIAL_CATEGORIES = ['Rent', 'Utilities', 'Groceries', 'Healthcare', 'Insurance', 'Education', 'Transportation', 'Fuel', 'Medicine']

// Investment account name patterns (to_account must contain these for transfers TO be investments)
const INVESTMENT_ACCOUNT_PATTERNS = ['mutual fund', 'mf', 'grow', 'zerodha', 'kuvera', 'coin', 'smallcase', 'stocks', 'demat', 'ppf', 'nps', 'elss', 'epf']

// Investment note/category keywords
const INVESTMENT_NOTE_KEYWORDS = ['sip', 'mutual fund', 'investment', 'ppf', 'nps', 'elss', 'epf']

export default function FinancialHealthScore() {
  const { data: transactions = [], isLoading } = useTransactions()
  const [showDetails, setShowDetails] = useState(false)
  const isInvestmentAccount = useInvestmentAccountStore((state) => state.isInvestmentAccount)

  // Comprehensive analysis from transaction data for last 24 months
  const analysisData = useMemo(() => {
    if (!transactions.length) return null

    const now = new Date()
    const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), 1)

    // Filter transactions from last 24 months
    const recentTransactions = transactions.filter((tx) => new Date(tx.date) >= twoYearsAgo)

    if (recentTransactions.length < 10) return null

    // Helper to check if transaction is investment-related
    // ONLY count transfers TO investment accounts, not FROM them (withdrawals)
    const isInvestmentTransaction = (tx: typeof transactions[0]): boolean => {
      // Must be a Transfer type
      if (tx.type !== 'Transfer') return false
      
      // Must have a to_account (where money is going)
      if (!tx.to_account) return false
      
      const toAccount = tx.to_account.toLowerCase()
      const note = (tx.note || '').toLowerCase()
      const category = (tx.category || '').toLowerCase()
      
      // Check if to_account is marked as investment in settings
      if (isInvestmentAccount(tx.to_account)) {
        return true
      }
      
      // Check if to_account name matches investment patterns
      if (INVESTMENT_ACCOUNT_PATTERNS.some(pattern => toAccount.includes(pattern))) {
        return true
      }
      
      // Check if note contains investment keywords (like "SIP", "mutual fund")
      if (INVESTMENT_NOTE_KEYWORDS.some(keyword => note.includes(keyword))) {
        return true
      }
      
      // Check category for investment keywords
      if (INVESTMENT_NOTE_KEYWORDS.some(keyword => category.includes(keyword))) {
        return true
      }
      
      return false
    }

    // Helper to check if this is a WITHDRAWAL from an investment account
    const isInvestmentWithdrawal = (tx: typeof transactions[0]): boolean => {
      // Must be a Transfer type with a from_account
      if (tx.type !== 'Transfer') return false
      if (!tx.from_account) return false
      
      const fromAccount = tx.from_account.toLowerCase()
      
      // Check if from_account is marked as investment in settings
      if (isInvestmentAccount(tx.from_account)) {
        // But make sure to_account is NOT also an investment account (internal rebalancing)
        if (tx.to_account && (isInvestmentAccount(tx.to_account) || 
            INVESTMENT_ACCOUNT_PATTERNS.some(pattern => tx.to_account!.toLowerCase().includes(pattern)))) {
          return false // This is rebalancing between investment accounts, not withdrawal
        }
        return true
      }
      
      // Check if from_account name matches investment patterns
      if (INVESTMENT_ACCOUNT_PATTERNS.some(pattern => fromAccount.includes(pattern))) {
        // But make sure to_account is NOT also an investment account
        if (tx.to_account && (isInvestmentAccount(tx.to_account) || 
            INVESTMENT_ACCOUNT_PATTERNS.some(pattern => tx.to_account!.toLowerCase().includes(pattern)))) {
          return false
        }
        return true
      }
      
      return false
    }

    // Group by month
    const monthlyData: Record<string, { 
      income: number
      expense: number
      debt: number
      investmentInflow: number
      investmentOutflow: number
      discretionary: number
      essential: number
      categories: Record<string, number>
    }> = {}
    
    recentTransactions.forEach((tx) => {
      const month = tx.date.slice(0, 7)
      if (!monthlyData[month]) {
        monthlyData[month] = { 
          income: 0, 
          expense: 0, 
          debt: 0, 
          investmentInflow: 0,
          investmentOutflow: 0,
          discretionary: 0,
          essential: 0,
          categories: {}
        }
      }
      
      const amount = Math.abs(tx.amount)
      const category = tx.category || 'Other'
      
      // Check for investment inflow (money going TO investment accounts)
      if (isInvestmentTransaction(tx)) {
        monthlyData[month].investmentInflow += amount
      } 
      // Check for investment outflow (money coming FROM investment accounts)
      else if (isInvestmentWithdrawal(tx)) {
        monthlyData[month].investmentOutflow += amount
      }
      else if (tx.type === 'Income') {
        monthlyData[month].income += amount
      } else if (tx.type === 'Expense') {
        monthlyData[month].expense += amount
        monthlyData[month].categories[category] = (monthlyData[month].categories[category] || 0) + amount
        
        // Categorize spending
        if (DEBT_CATEGORIES.some(c => category.toLowerCase().includes(c.toLowerCase()))) {
          monthlyData[month].debt += amount
        }
        if (DISCRETIONARY_CATEGORIES.some(c => category.toLowerCase().includes(c.toLowerCase()))) {
          monthlyData[month].discretionary += amount
        }
        if (ESSENTIAL_CATEGORIES.some(c => category.toLowerCase().includes(c.toLowerCase()))) {
          monthlyData[month].essential += amount
        }
      }
      // Transfer type that's not investment is ignored (internal transfers)
    })

    const months = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b))

    // Remove current month if it's incomplete (less than 15 days in)
    const today = new Date()
    const currentMonth = today.toISOString().slice(0, 7)
    if (today.getDate() < 15 && months.includes(currentMonth)) {
      months.pop()
      delete monthlyData[currentMonth]
    }

    if (months.length < 3) return null

    const monthlyValues = months.map(m => monthlyData[m])
    
    // ===== CASHFLOW STRENGTH (25%) =====
    // Measures: income vs expenses, surplus months
    const surplusMonths = monthlyValues.filter(m => m.income > m.expense).length
    const surplusRatio = surplusMonths / months.length
    const totalIncome = monthlyValues.reduce((sum, m) => sum + m.income, 0)
    const totalExpense = monthlyValues.reduce((sum, m) => sum + m.expense, 0)
    const avgMonthlyIncome = totalIncome / months.length
    const avgMonthlyExpense = totalExpense / months.length
    const cashflowMargin = avgMonthlyIncome > 0 ? ((avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome) * 100 : 0
    
    // ===== SAVINGS TREND (20%) =====
    // Measures: monthly savings percentage, consistency, trend direction
    const monthlySavingsRates = monthlyValues.map(m => m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : 0)
    const avgSavingsRate = monthlySavingsRates.reduce((a, b) => a + b, 0) / monthlySavingsRates.length
    
    // Savings consistency (coefficient of variation inverted)
    const savingsVariance = monthlySavingsRates.reduce((sum, r) => sum + Math.pow(r - avgSavingsRate, 2), 0) / monthlySavingsRates.length
    const savingsStdDev = Math.sqrt(savingsVariance)
    const savingsConsistency = Math.abs(avgSavingsRate) > 0 ? Math.max(0, 100 - (savingsStdDev / Math.abs(avgSavingsRate)) * 50) : 0
    
    // Savings trend (compare first half vs second half)
    const halfPoint = Math.floor(months.length / 2)
    const firstHalfSavings = monthlySavingsRates.slice(0, halfPoint)
    const secondHalfSavings = monthlySavingsRates.slice(halfPoint)
    const firstHalfAvgSavings = firstHalfSavings.reduce((a, b) => a + b, 0) / (firstHalfSavings.length || 1)
    const secondHalfAvgSavings = secondHalfSavings.reduce((a, b) => a + b, 0) / (secondHalfSavings.length || 1)
    const savingsTrendPositive = secondHalfAvgSavings >= firstHalfAvgSavings
    
    // ===== DEBT STRESS (20%) =====
    // Measures: EMI-to-income ratio, debt payment consistency
    const totalDebt = monthlyValues.reduce((sum, m) => sum + m.debt, 0)
    const avgMonthlyDebt = totalDebt / months.length
    const debtToIncomeRatio = avgMonthlyIncome > 0 ? (avgMonthlyDebt / avgMonthlyIncome) * 100 : 0
    
    // Credit card behavior (if expenses spike vs income)
    const monthsWithHighSpending = monthlyValues.filter(m => m.expense > m.income * 1.2).length
    const overspendingFrequency = monthsWithHighSpending / months.length
    
    // ===== EXPENSE DISCIPLINE (15%) =====
    // Measures: fixed vs discretionary, lifestyle creep, spending volatility
    const totalDiscretionary = monthlyValues.reduce((sum, m) => sum + m.discretionary, 0)
    const discretionaryRatio = totalExpense > 0 ? (totalDiscretionary / totalExpense) * 100 : 0
    
    // Spending consistency (lower volatility = better)
    const monthlyExpenses = monthlyValues.map(m => m.expense)
    const expenseVariance = monthlyExpenses.reduce((sum, e) => sum + Math.pow(e - avgMonthlyExpense, 2), 0) / months.length
    const expenseStdDev = Math.sqrt(expenseVariance)
    const spendingVolatility = avgMonthlyExpense > 0 ? (expenseStdDev / avgMonthlyExpense) * 100 : 0
    
    // Lifestyle inflation (expense growth over time)
    const firstHalfExpenses = monthlyExpenses.slice(0, halfPoint)
    const secondHalfExpenses = monthlyExpenses.slice(halfPoint)
    const firstHalfAvgExpense = firstHalfExpenses.reduce((a, b) => a + b, 0) / (firstHalfExpenses.length || 1)
    const secondHalfAvgExpense = secondHalfExpenses.reduce((a, b) => a + b, 0) / (secondHalfExpenses.length || 1)
    const lifestyleInflation = firstHalfAvgExpense > 0 ? ((secondHalfAvgExpense - firstHalfAvgExpense) / firstHalfAvgExpense) * 100 : 0
    
    // ===== SAVINGS BUFFER (10%) =====
    // Measures: consistent positive savings (we can't know actual account balances from transactions)
    // Focus on savings behavior rather than claiming a specific fund amount
    const positiveSavingsMonths = monthlySavingsRates.filter(r => r > 0).length
    const positiveSavingsRatio = positiveSavingsMonths / months.length
    const avgPositiveSavingsRate = monthlySavingsRates.filter(r => r > 0).reduce((a, b) => a + b, 0) / (positiveSavingsMonths || 1)
    
    // ===== INVESTMENT BEHAVIOR (10%) =====
    // Calculate NET investment = Inflows - Outflows (so withdrawals reduce the ratio)
    const monthlyNetInvestments = monthlyValues.map(m => m.investmentInflow - m.investmentOutflow)
    const totalInvestmentInflow = monthlyValues.reduce((sum, m) => sum + m.investmentInflow, 0)
    const totalInvestmentOutflow = monthlyValues.reduce((sum, m) => sum + m.investmentOutflow, 0)
    const totalNetInvestment = totalInvestmentInflow - totalInvestmentOutflow
    
    // Investment regularity (months with positive NET investment)
    const monthsWithNetInvestments = monthlyNetInvestments.filter(net => net > 0).length
    const investmentRegularity = monthsWithNetInvestments / months.length
    
    // Net investment to income ratio
    const netInvestmentToIncomeRatio = totalIncome > 0 ? (totalNetInvestment / totalIncome) * 100 : 0
    
    // Investment consistency (based on inflows, as that shows discipline)
    const avgMonthlyInflow = totalInvestmentInflow / months.length
    const inflowVariance = avgMonthlyInflow > 0 
      ? monthlyValues.map(m => m.investmentInflow).reduce((sum, i) => sum + Math.pow(i - avgMonthlyInflow, 2), 0) / months.length
      : 0
    const investmentConsistency = avgMonthlyInflow > 0 ? Math.max(0, 100 - (Math.sqrt(inflowVariance) / avgMonthlyInflow) * 50) : 0
    
    // ===== INCOME QUALITY =====
    // Multiple income sources, income stability
    const incomeVariance = monthlyValues.reduce((sum, m) => sum + Math.pow(m.income - avgMonthlyIncome, 2), 0) / months.length
    const incomeStdDev = Math.sqrt(incomeVariance)
    const incomeStability = avgMonthlyIncome > 0 ? Math.max(0, 100 - (incomeStdDev / avgMonthlyIncome) * 50) : 0
    
    // Income growth
    const firstHalfIncomes = monthlyValues.slice(0, halfPoint).map(m => m.income)
    const secondHalfIncomes = monthlyValues.slice(halfPoint).map(m => m.income)
    const firstHalfAvgIncome = firstHalfIncomes.reduce((a, b) => a + b, 0) / (firstHalfIncomes.length || 1)
    const secondHalfAvgIncome = secondHalfIncomes.reduce((a, b) => a + b, 0) / (secondHalfIncomes.length || 1)
    const incomeGrowth = firstHalfAvgIncome > 0 ? ((secondHalfAvgIncome - firstHalfAvgIncome) / firstHalfAvgIncome) * 100 : 0

    return {
      monthsAnalyzed: months.length,
      // Cashflow
      cashflowMargin,
      surplusRatio,
      avgMonthlyIncome,
      avgMonthlyExpense,
      // Savings
      avgSavingsRate,
      savingsConsistency,
      savingsTrendPositive,
      // Debt
      debtToIncomeRatio,
      overspendingFrequency,
      avgMonthlyDebt,
      // Expense Discipline
      discretionaryRatio,
      spendingVolatility,
      lifestyleInflation,
      // Savings Buffer
      positiveSavingsRatio,
      avgPositiveSavingsRate,
      // Investment
      investmentRegularity,
      netInvestmentToIncomeRatio,
      investmentConsistency,
      totalNetInvestment,
      totalInvestmentInflow,
      totalInvestmentOutflow,
      // Income Quality
      incomeStability,
      incomeGrowth,
    }
  }, [transactions, isInvestmentAccount])

  // Calculate individual health metrics with comprehensive factors
  const calculateMetrics = (): HealthMetric[] => {
    if (!analysisData) return []

    const metrics: HealthMetric[] = []

    // 1. CASHFLOW STRENGTH (25%)
    let cashflowScore = 0
    let cashflowStatus: HealthMetric['status'] = 'poor'
    const cashflowDetails: string[] = []
    
    // Score based on cashflow margin (0-50 points)
    if (analysisData.cashflowMargin >= 30) cashflowScore += 50
    else if (analysisData.cashflowMargin >= 20) cashflowScore += 40
    else if (analysisData.cashflowMargin >= 10) cashflowScore += 30
    else if (analysisData.cashflowMargin >= 0) cashflowScore += 15
    else cashflowScore += 0
    
    // Score based on surplus months (0-50 points)
    cashflowScore += analysisData.surplusRatio * 50
    
    if (cashflowScore >= 80) cashflowStatus = 'excellent'
    else if (cashflowScore >= 60) cashflowStatus = 'good'
    else if (cashflowScore >= 40) cashflowStatus = 'fair'
    
    cashflowDetails.push(`Avg margin: ${analysisData.cashflowMargin.toFixed(1)}%`)
    cashflowDetails.push(`${Math.round(analysisData.surplusRatio * 100)}% months with surplus`)
    
    metrics.push({
      name: 'Cashflow Strength',
      score: cashflowScore,
      weight: 25,
      status: cashflowStatus,
      description: analysisData.cashflowMargin >= 20 ? 'Healthy surplus' : analysisData.cashflowMargin >= 0 ? 'Breaking even' : 'Deficit spending',
      details: cashflowDetails,
    })

    // 2. SAVINGS TREND (20%)
    let savingsScore = 0
    let savingsStatus: HealthMetric['status'] = 'poor'
    const savingsDetails: string[] = []
    
    // Score based on savings rate (0-50 points)
    if (analysisData.avgSavingsRate >= 30) savingsScore += 50
    else if (analysisData.avgSavingsRate >= 20) savingsScore += 40
    else if (analysisData.avgSavingsRate >= 10) savingsScore += 25
    else if (analysisData.avgSavingsRate >= 0) savingsScore += 10
    else savingsScore += 0
    
    // Score based on consistency (0-30 points)
    savingsScore += (analysisData.savingsConsistency / 100) * 30
    
    // Score based on trend (0-20 points)
    if (analysisData.savingsTrendPositive) savingsScore += 20
    else savingsScore += 5
    
    if (savingsScore >= 80) savingsStatus = 'excellent'
    else if (savingsScore >= 60) savingsStatus = 'good'
    else if (savingsScore >= 40) savingsStatus = 'fair'
    
    savingsDetails.push(`Avg savings rate: ${analysisData.avgSavingsRate.toFixed(1)}%`)
    savingsDetails.push(`Trend: ${analysisData.savingsTrendPositive ? 'Improving' : 'Declining'}`)
    
    metrics.push({
      name: 'Savings Trend',
      score: savingsScore,
      weight: 20,
      status: savingsStatus,
      description: `${analysisData.avgSavingsRate.toFixed(1)}% avg savings rate`,
      details: savingsDetails,
    })

    // 3. DEBT STRESS (20%) - Lower debt = higher score
    let debtScore = 100
    let debtStatus: HealthMetric['status'] = 'excellent'
    const debtDetails: string[] = []
    
    // Penalty based on debt-to-income ratio
    if (analysisData.debtToIncomeRatio > 50) debtScore -= 60
    else if (analysisData.debtToIncomeRatio > 40) debtScore -= 45
    else if (analysisData.debtToIncomeRatio > 30) debtScore -= 30
    else if (analysisData.debtToIncomeRatio > 20) debtScore -= 15
    else if (analysisData.debtToIncomeRatio > 10) debtScore -= 5
    
    // Penalty for overspending frequency
    debtScore -= analysisData.overspendingFrequency * 40
    
    debtScore = Math.max(0, Math.min(100, debtScore))
    
    if (debtScore >= 80) debtStatus = 'excellent'
    else if (debtScore >= 60) debtStatus = 'good'
    else if (debtScore >= 40) debtStatus = 'fair'
    else debtStatus = 'poor'
    
    debtDetails.push(`Debt-to-income: ${analysisData.debtToIncomeRatio.toFixed(1)}%`)
    debtDetails.push(`Overspending: ${Math.round(analysisData.overspendingFrequency * 100)}% of months`)
    
    metrics.push({
      name: 'Debt Management',
      score: debtScore,
      weight: 20,
      status: debtStatus,
      description: analysisData.debtToIncomeRatio < 20 ? 'Low debt burden' : analysisData.debtToIncomeRatio < 40 ? 'Moderate debt' : 'High debt burden',
      details: debtDetails,
    })

    // 4. EXPENSE DISCIPLINE (15%)
    let disciplineScore = 100
    let disciplineStatus: HealthMetric['status'] = 'excellent'
    const disciplineDetails: string[] = []
    
    // Penalty for high discretionary spending
    if (analysisData.discretionaryRatio > 40) disciplineScore -= 25
    else if (analysisData.discretionaryRatio > 30) disciplineScore -= 15
    else if (analysisData.discretionaryRatio > 20) disciplineScore -= 5
    
    // Penalty for spending volatility
    if (analysisData.spendingVolatility > 50) disciplineScore -= 25
    else if (analysisData.spendingVolatility > 30) disciplineScore -= 15
    else if (analysisData.spendingVolatility > 20) disciplineScore -= 5
    
    // Penalty for lifestyle inflation
    if (analysisData.lifestyleInflation > 30) disciplineScore -= 30
    else if (analysisData.lifestyleInflation > 15) disciplineScore -= 15
    else if (analysisData.lifestyleInflation > 5) disciplineScore -= 5
    else if (analysisData.lifestyleInflation < -5) disciplineScore += 10 // Bonus for reducing expenses
    
    disciplineScore = Math.max(0, Math.min(100, disciplineScore))
    
    if (disciplineScore >= 80) disciplineStatus = 'excellent'
    else if (disciplineScore >= 60) disciplineStatus = 'good'
    else if (disciplineScore >= 40) disciplineStatus = 'fair'
    else disciplineStatus = 'poor'
    
    disciplineDetails.push(`Discretionary: ${analysisData.discretionaryRatio.toFixed(1)}% of expenses`)
    disciplineDetails.push(`Lifestyle change: ${analysisData.lifestyleInflation > 0 ? '+' : ''}${analysisData.lifestyleInflation.toFixed(1)}%`)
    
    metrics.push({
      name: 'Expense Discipline',
      score: disciplineScore,
      weight: 15,
      status: disciplineStatus,
      description: disciplineScore >= 70 ? 'Well controlled' : disciplineScore >= 50 ? 'Moderate control' : 'Needs attention',
      details: disciplineDetails,
    })

    // 5. SAVINGS BUFFER (10%)
    let savingsBufferScore = 0
    let savingsBufferStatus: HealthMetric['status'] = 'poor'
    const savingsBufferDetails: string[] = []
    
    // Score based on how consistently you're saving (positive savings months)
    // 50 points for frequency of positive savings months
    savingsBufferScore += analysisData.positiveSavingsRatio * 50
    
    // 50 points for average savings rate when saving
    if (analysisData.avgPositiveSavingsRate >= 25) savingsBufferScore += 50
    else if (analysisData.avgPositiveSavingsRate >= 20) savingsBufferScore += 40
    else if (analysisData.avgPositiveSavingsRate >= 15) savingsBufferScore += 30
    else if (analysisData.avgPositiveSavingsRate >= 10) savingsBufferScore += 20
    else if (analysisData.avgPositiveSavingsRate >= 5) savingsBufferScore += 10
    
    savingsBufferScore = Math.min(100, savingsBufferScore)
    
    if (savingsBufferScore >= 80) savingsBufferStatus = 'excellent'
    else if (savingsBufferScore >= 60) savingsBufferStatus = 'good'
    else if (savingsBufferScore >= 40) savingsBufferStatus = 'fair'
    
    savingsBufferDetails.push(`${Math.round(analysisData.positiveSavingsRatio * 100)}% months with positive savings`)
    savingsBufferDetails.push(`Avg savings rate: ${analysisData.avgPositiveSavingsRate.toFixed(1)}% when saving`)
    
    metrics.push({
      name: 'Savings Buffer',
      score: savingsBufferScore,
      weight: 10,
      status: savingsBufferStatus,
      description: savingsBufferScore >= 70 ? 'Building reserves' : savingsBufferScore >= 40 ? 'Some savings' : 'Improve savings habit',
      details: savingsBufferDetails,
    })

    // 6. INVESTMENT BEHAVIOR (10%)
    let investmentScore = 0
    let investmentStatus: HealthMetric['status'] = 'poor'
    const investmentDetails: string[] = []
    
    // Score based on investment regularity (0-40 points)
    investmentScore += analysisData.investmentRegularity * 40
    
    // Score based on NET investment-to-income ratio (0-40 points)
    // This is net = inflows - outflows, so withdrawals reduce the ratio
    const netRatio = analysisData.netInvestmentToIncomeRatio
    if (netRatio >= 20) investmentScore += 40
    else if (netRatio >= 15) investmentScore += 30
    else if (netRatio >= 10) investmentScore += 20
    else if (netRatio >= 5) investmentScore += 10
    else if (netRatio >= 0) investmentScore += 5 // At least not negative
    
    // Score based on consistency (0-20 points)
    investmentScore += (analysisData.investmentConsistency / 100) * 20
    
    investmentScore = Math.min(100, investmentScore)
    
    if (investmentScore >= 80) investmentStatus = 'excellent'
    else if (investmentScore >= 60) investmentStatus = 'good'
    else if (investmentScore >= 40) investmentStatus = 'fair'
    
    investmentDetails.push(`${Math.round(analysisData.investmentRegularity * 100)}% months with net investments`)
    investmentDetails.push(`${netRatio.toFixed(1)}% of income (net invested)`)
    if (analysisData.totalInvestmentOutflow > 0) {
      investmentDetails.push(`Withdrawals: ${formatCurrencyCompact(analysisData.totalInvestmentOutflow)}`)
    }
    
    metrics.push({
      name: 'Investment Behavior',
      score: investmentScore,
      weight: 10,
      status: investmentStatus,
      description: netRatio >= 15 ? 'Strong investor' : netRatio >= 5 ? 'Regular investing' : netRatio >= 0 ? 'Some investing' : 'Net withdrawal',
      details: investmentDetails,
    })

    return metrics
  }

  const metrics = calculateMetrics()
  const overallScore = metrics.reduce((sum, m) => sum + (m.score * m.weight) / 100, 0)

  const getOverallStatus = (score: number) => {
    if (score >= 80) return { label: 'Excellent', color: 'text-green-500', bgColor: 'bg-green-500' }
    if (score >= 60) return { label: 'Good', color: 'text-blue-500', bgColor: 'bg-blue-500' }
    if (score >= 40) return { label: 'Fair', color: 'text-yellow-500', bgColor: 'bg-yellow-500' }
    return { label: 'Needs Work', color: 'text-red-500', bgColor: 'bg-red-500' }
  }

  const status = getOverallStatus(overallScore)

  // Generate one-line summary
  const getSummary = () => {
    if (overallScore >= 80) return "Excellent financial health! Strong cashflow, good savings, and disciplined spending."
    if (overallScore >= 65) return "Good financial health with room for improvement in savings or expense management."
    if (overallScore >= 50) return "Fair financial health. Focus on building emergency fund and reducing discretionary spending."
    if (overallScore >= 35) return "Financial health needs attention. Prioritize debt management and expense control."
    return "Financial health requires immediate action. Create a budget and reduce non-essential expenses."
  }

  const getStatusIcon = (metricStatus: HealthMetric['status']) => {
    switch (metricStatus) {
      case 'excellent':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'good':
        return <TrendingUp className="w-4 h-4 text-blue-500" />
      case 'fair':
        return <Info className="w-4 h-4 text-yellow-500" />
      case 'poor':
        return <AlertTriangle className="w-4 h-4 text-red-500" />
    }
  }

  const getStatusColor = (metricStatus: HealthMetric['status']) => {
    switch (metricStatus) {
      case 'excellent':
        return 'bg-green-500'
      case 'good':
        return 'bg-blue-500'
      case 'fair':
        return 'bg-yellow-500'
      case 'poor':
        return 'bg-red-500'
    }
  }

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="h-32 bg-muted rounded" />
      </div>
    )
  }

  if (!analysisData || metrics.length === 0) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h3 className="text-lg font-semibold mb-2">Financial Health Score</h3>
        <p className="text-muted-foreground">Need more transaction data to calculate health score.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${status.bgColor}/20`}>
            <Shield className={`w-6 h-6 ${status.color}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Financial Health Score</h3>
            <p className="text-sm text-muted-foreground">Based on last {analysisData.monthsAnalyzed} months</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-bold ${status.color}`}>{Math.round(overallScore)}</p>
          <p className={`text-sm ${status.color}`}>{status.label}</p>
        </div>
      </div>

      {/* Circular Progress */}
      <div className="flex justify-center mb-4">
        <div className="relative w-28 h-28">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="8" fill="none" className="text-muted/20" />
            <circle
              cx="56"
              cy="56"
              r="48"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${(overallScore / 100) * 301} 301`}
              strokeLinecap="round"
              className={status.color}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${status.color}`}>{Math.round(overallScore)}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-center text-muted-foreground mb-6 px-4">{getSummary()}</p>

      {/* Metrics Breakdown */}
      <div className="space-y-3">
        {metrics.map((metric) => (
          <div key={metric.name} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {getStatusIcon(metric.status)}
                <span>{metric.name}</span>
                <span className="text-xs text-muted-foreground">({metric.weight}%)</span>
              </div>
              <span className="text-muted-foreground">{metric.description}</span>
            </div>
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className={`h-full ${getStatusColor(metric.status)} rounded-full transition-all`}
                style={{ width: `${metric.score}%` }}
              />
            </div>
            {/* Details (collapsible) */}
            {showDetails && metric.details && (
              <div className="pl-6 pt-1 text-xs text-muted-foreground space-y-0.5">
                {metric.details.map((detail, i) => (
                  <p key={i}>• {detail}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Show Details Toggle */}
      <button 
        onClick={() => setShowDetails(!showDetails)}
        className="w-full mt-4 pt-4 border-t border-white/10 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
      >
        {showDetails ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Hide Details
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Show Details
          </>
        )}
      </button>
    </motion.div>
  )
}
