import { motion } from 'framer-motion'
import { CreditCard, AlertTriangle, CheckCircle } from 'lucide-react'
import { useMemo } from 'react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { usePreferencesStore, selectCreditCardLimits } from '@/store/preferencesStore'

interface CreditCardAccount {
  name: string
  balance: number
  creditLimit: number
  utilization: number
  status: 'low' | 'medium' | 'high' | 'critical'
  transactions: number
}

const DEFAULT_CREDIT_LIMIT = 100000

export default function CreditCardHealth() {
  const { data: balanceData, isLoading } = useAccountBalances()
  const creditCardLimits = usePreferencesStore(selectCreditCardLimits)

  const creditCards = useMemo((): CreditCardAccount[] => {
    if (!balanceData?.accounts) return []

    const cards: CreditCardAccount[] = []

    Object.entries(balanceData.accounts).forEach(([name, data]) => {
      // Check if it's a credit card account
      if (name.toLowerCase().includes('credit')) {
        const balance = Math.abs((data as { balance: number; transactions: number }).balance)
        const creditLimit = creditCardLimits[name] || DEFAULT_CREDIT_LIMIT
        const utilization = (balance / creditLimit) * 100

        let status: CreditCardAccount['status'] = 'low'
        if (utilization > 75) status = 'critical'
        else if (utilization > 50) status = 'high'
        else if (utilization > 30) status = 'medium'

        cards.push({
          name,
          balance,
          creditLimit,
          utilization,
          status,
          transactions: (data as { balance: number; transactions: number }).transactions,
        })
      }
    })

    return cards.sort((a, b) => b.utilization - a.utilization)
  }, [balanceData, creditCardLimits])

  const totalBalance = creditCards.reduce((sum, c) => sum + c.balance, 0)
  const totalLimit = creditCards.reduce((sum, c) => sum + c.creditLimit, 0)
  const overallUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0

  const getStatusColor = (status: CreditCardAccount['status']) => {
    switch (status) {
      case 'low':
        return 'text-ios-green bg-ios-green/20 border-ios-green/30'
      case 'medium':
        return 'text-ios-blue bg-ios-blue/20 border-ios-blue/30'
      case 'high':
        return 'text-ios-yellow bg-ios-yellow/20 border-ios-yellow/30'
      case 'critical':
        return 'text-ios-red bg-ios-red/20 border-ios-red/30'
    }
  }

  const getStatusIcon = (status: CreditCardAccount['status']) => {
    switch (status) {
      case 'low':
      case 'medium':
        return <CheckCircle className="w-4 h-4" />
      case 'high':
      case 'critical':
        return <AlertTriangle className="w-4 h-4" />
    }
  }

  const getUtilizationBar = (utilization: number) => {
    let color = 'bg-ios-green'
    if (utilization > 75) color = 'bg-ios-red'
    else if (utilization > 50) color = 'bg-ios-yellow'
    else if (utilization > 30) color = 'bg-ios-blue'

    return (
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-colors duration-500`}
          style={{ width: `${Math.min(100, utilization)}%` }}
        />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-border p-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (creditCards.length === 0) {
    return (
      <div className="glass rounded-2xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-ios-purple/20 rounded-xl">
            <CreditCard className="w-6 h-6 text-ios-purple" />
          </div>
          <h3 className="text-lg font-semibold">Credit Card Health</h3>
        </div>
        <p className="text-muted-foreground">No credit card accounts found in your transactions.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${overallUtilization > 50 ? 'bg-ios-yellow/20' : 'bg-ios-green/20'}`}>
            <CreditCard className={`w-6 h-6 ${overallUtilization > 50 ? 'text-ios-yellow' : 'text-ios-green'}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Credit Card Health</h3>
            <p className="text-sm text-muted-foreground">
              {creditCards.length} cards • {formatPercent(overallUtilization)} overall utilization
            </p>
          </div>
        </div>
      </div>

      {/* Overall Utilization */}
      <div className="mb-6 p-4 rounded-xl bg-background/30 border border-border">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">Total Credit Utilization</span>
          <span className={`font-bold ${overallUtilization > 50 ? 'text-ios-yellow' : 'text-ios-green'}`}>
            {formatPercent(overallUtilization)}
          </span>
        </div>
        {getUtilizationBar(overallUtilization)}
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>Outstanding: {formatCurrency(totalBalance)}</span>
          <span>Total Limit: {formatCurrency(totalLimit)}</span>
        </div>
      </div>

      {/* Individual Cards */}
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {creditCards.map((card) => (
          <div
            key={card.name}
            className={`p-4 rounded-xl border ${getStatusColor(card.status)}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                {getStatusIcon(card.status)}
                <span className="font-medium text-sm">{card.name.replace(' Credit Card', '')}</span>
              </div>
              <span className="font-bold">{formatPercent(card.utilization)}</span>
            </div>
            {getUtilizationBar(card.utilization)}
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{formatCurrency(card.balance)} used</span>
              <span>Limit: {formatCurrency(card.creditLimit)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {creditCards.some((c) => c.status === 'critical' || c.status === 'high') && (
        <div className="mt-4 p-4 rounded-xl bg-ios-yellow/10 border border-ios-yellow/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-ios-yellow flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-ios-yellow">High Utilization Warning</p>
              <p className="text-xs text-muted-foreground mt-1">
                Credit utilization above 30% can affect your credit score. Consider paying down balances
                on high-utilization cards.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="p-2 rounded-lg bg-ios-green/10">
          <p className="text-xs font-medium text-ios-green">&lt;30%</p>
          <p className="text-caption text-muted-foreground">Excellent</p>
        </div>
        <div className="p-2 rounded-lg bg-ios-yellow/10">
          <p className="text-xs font-medium text-ios-yellow">30-50%</p>
          <p className="text-caption text-muted-foreground">Good</p>
        </div>
        <div className="p-2 rounded-lg bg-ios-red/10">
          <p className="text-xs font-medium text-ios-red">&gt;50%</p>
          <p className="text-caption text-muted-foreground">Reduce</p>
        </div>
      </div>
    </motion.div>
  )
}
