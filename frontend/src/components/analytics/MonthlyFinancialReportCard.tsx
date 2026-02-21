import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ClipboardCheck } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'

type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

const GRADE_COLORS: Record<Grade, string> = {
  A: rawColors.ios.green,
  B: rawColors.ios.blue,
  C: rawColors.ios.yellow,
  D: rawColors.ios.orange,
  F: rawColors.ios.red,
}

const GRADE_POINTS: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 }

function gradeSavingsRate(rate: number): Grade {
  if (rate >= 30) return 'A'
  if (rate >= 20) return 'B'
  if (rate >= 10) return 'C'
  if (rate >= 0) return 'D'
  return 'F'
}

function gradeConsistency(cv: number): Grade {
  if (cv < 50) return 'A'
  if (cv < 80) return 'B'
  if (cv < 120) return 'C'
  if (cv < 160) return 'D'
  return 'F'
}

function gradeBudgetAdherence(change: number): Grade {
  if (change <= -10) return 'A'
  if (change <= 0) return 'B'
  if (change <= 10) return 'C'
  if (change <= 25) return 'D'
  return 'F'
}

function gradeIncomeGrowth(growth: number): Grade {
  if (growth >= 10) return 'A'
  if (growth >= 0) return 'B'
  if (growth >= -5) return 'C'
  if (growth >= -15) return 'D'
  return 'F'
}

function computeOverallGrade(grades: Grade[]): Grade {
  const avg = grades.reduce((sum, g) => sum + GRADE_POINTS[g], 0) / grades.length
  if (avg >= 3.5) return 'A'
  if (avg >= 2.5) return 'B'
  if (avg >= 1.5) return 'C'
  if (avg >= 0.5) return 'D'
  return 'F'
}

function formatChangeDetail(value: number, suffix: string): string {
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}% ${suffix}`
}

function computeCV(dailyValues: number[]): { mean: number; cv: number } {
  const mean = dailyValues.length > 0 ? dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length : 0
  const stddev = Math.sqrt(
    dailyValues.length > 0 ? dailyValues.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyValues.length : 0,
  )
  const cv = mean > 0 ? (stddev / mean) * 100 : 0
  return { mean, cv }
}

function computePrevMonth(selectedMonth: string): string {
  const [y, m] = selectedMonth.split('-').map(Number)
  const prevDate = new Date(y, m - 2, 1)
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
}

function computeGrowth(current: number, previous: number): number {
  return previous > 0 ? ((current - previous) / previous) * 100 : 0
}

export default function MonthlyFinancialReportCard() {
  const { data: transactions = [] } = useTransactions()

  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    for (const tx of transactions) {
      months.add(tx.date.substring(0, 7))
    }
    return [...months].sort((a, b) => b.localeCompare(a))
  }, [transactions])

  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (availableMonths.length > 0) return availableMonths[0]
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const report = useMemo(() => {
    if (!selectedMonth || transactions.length === 0) return null

    const monthTxs = transactions.filter((t) => t.date.startsWith(selectedMonth))
    const income = monthTxs.filter((t) => t.type === 'Income').reduce((s, t) => s + Math.abs(t.amount), 0)
    const expenses = monthTxs.filter((t) => t.type === 'Expense').reduce((s, t) => s + Math.abs(t.amount), 0)

    const prevMonth = computePrevMonth(selectedMonth)
    const hasPrevMonth = availableMonths.includes(prevMonth)

    const prevTxs = hasPrevMonth ? transactions.filter((t) => t.date.startsWith(prevMonth)) : []
    const prevIncome = prevTxs.filter((t) => t.type === 'Income').reduce((s, t) => s + Math.abs(t.amount), 0)
    const prevExpenses = prevTxs.filter((t) => t.type === 'Expense').reduce((s, t) => s + Math.abs(t.amount), 0)

    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0
    const savingsGrade = gradeSavingsRate(savingsRate)

    const dailyExpenses: Record<string, number> = {}
    for (const tx of monthTxs.filter((t) => t.type === 'Expense')) {
      dailyExpenses[tx.date.substring(0, 10)] = (dailyExpenses[tx.date.substring(0, 10)] || 0) + Math.abs(tx.amount)
    }
    const { mean, cv } = computeCV(Object.values(dailyExpenses))
    const consistencyGrade = gradeConsistency(cv)

    const expenseChange = hasPrevMonth ? computeGrowth(expenses, prevExpenses) : 0
    const budgetGrade: Grade | 'N/A' = hasPrevMonth ? gradeBudgetAdherence(expenseChange) : 'N/A'

    const incomeGrowth = hasPrevMonth ? computeGrowth(income, prevIncome) : 0
    const incomeGrade: Grade | 'N/A' = hasPrevMonth ? gradeIncomeGrowth(incomeGrowth) : 'N/A'

    const validGrades = [savingsGrade, consistencyGrade]
    if (budgetGrade !== 'N/A') validGrades.push(budgetGrade)
    if (incomeGrade !== 'N/A') validGrades.push(incomeGrade)

    const budgetDetail = hasPrevMonth ? formatChangeDetail(expenseChange, 'vs last month') : 'N/A'
    const incomeDetail = hasPrevMonth ? formatChangeDetail(incomeGrowth, 'growth') : 'N/A'

    return {
      overall: computeOverallGrade(validGrades),
      categories: [
        {
          name: 'Savings Rate',
          grade: savingsGrade,
          detail: `${savingsRate.toFixed(1)}% saved`,
          subtext: `Income: ${formatCurrency(income)} | Expenses: ${formatCurrency(expenses)}`,
        },
        {
          name: 'Spending Consistency',
          grade: consistencyGrade,
          detail: `CV: ${cv.toFixed(0)}%`,
          subtext: `Daily avg: ${formatCurrency(mean)}`,
        },
        {
          name: 'Budget Adherence',
          grade: budgetGrade,
          detail: budgetDetail,
          subtext: hasPrevMonth ? `Last month: ${formatCurrency(prevExpenses)}` : 'No previous month data',
        },
        {
          name: 'Income Growth',
          grade: incomeGrade,
          detail: incomeDetail,
          subtext: hasPrevMonth ? `Last month: ${formatCurrency(prevIncome)}` : 'No previous month data',
        },
      ],
    }
  }, [transactions, selectedMonth, availableMonths])

  const monthLabel = selectedMonth
    ? new Date(`${selectedMonth}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : ''

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-ios-purple" />
          <h3 className="text-lg font-semibold text-white">Monthly Report Card</h3>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-3 py-1.5 bg-surface-dropdown/80 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-ios-purple/50"
        >
          {availableMonths.map((m) => (
            <option key={m} value={m} className="bg-surface-dropdown text-foreground">
              {new Date(`${m}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </option>
          ))}
        </select>
      </div>

      {report ? (
        <>
          {/* Overall Grade */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center text-2xl sm:text-3xl md:text-4xl font-bold text-white shadow-lg"
              style={{
                backgroundColor: `${GRADE_COLORS[report.overall]}20`,
                boxShadow: `0 8px 32px ${GRADE_COLORS[report.overall]}30`,
                border: `2px solid ${GRADE_COLORS[report.overall]}40`,
              }}
            >
              {report.overall}
            </div>
            <p className="text-sm font-medium mt-3" style={{ color: GRADE_COLORS[report.overall] }}>
              {monthLabel}
            </p>
            <p className="text-xs text-text-tertiary mt-1">Overall Financial Grade</p>
          </div>

          {/* Grade Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.categories.map((cat) => {
              const isNA = cat.grade === 'N/A'
              const color = isNA ? rawColors.text.tertiary : GRADE_COLORS[cat.grade as Grade]

              return (
                <div
                  key={cat.name}
                  className="p-4 rounded-xl bg-white/5 border border-border"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{cat.name}</p>
                    <span
                      className="text-2xl font-bold"
                      style={{ color }}
                    >
                      {cat.grade}
                    </span>
                  </div>
                  <p className="text-xs mt-2" style={{ color }}>
                    {cat.detail}
                  </p>
                  <p className="text-xs text-text-quaternary mt-1">{cat.subtext}</p>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          No transaction data available
        </div>
      )}
    </motion.div>
  )
}
