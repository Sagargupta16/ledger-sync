import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { rawColors } from '@/constants/colors'

type ActivityLevel = 'high' | 'medium' | 'low' | 'dormant'

const ACTIVITY_STYLES: Record<ActivityLevel, { color: string; bg: string; border: string }> = {
  high: { color: rawColors.ios.green, bg: 'bg-green-500/10', border: 'border-green-500/20' },
  medium: { color: rawColors.ios.blue, bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  low: { color: rawColors.ios.yellow, bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  dormant: { color: rawColors.ios.red, bg: 'bg-red-500/10', border: 'border-red-500/20' },
}

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  dormant: 'Dormant',
}

interface AccountInfo {
  name: string
  count: number
  daysSinceLastTx: number
  avgFrequency: number
  level: ActivityLevel
  score: number
}

export default function AccountActivityScore() {
  const { data: transactions = [] } = useTransactions()

  const accounts = useMemo<AccountInfo[]>(() => {
    if (transactions.length === 0) return []

    const accountData: Record<string, { count: number; dates: Set<string> }> = {}

    for (const tx of transactions) {
      const acct = tx.account
      if (!accountData[acct]) accountData[acct] = { count: 0, dates: new Set() }
      accountData[acct].count++
      accountData[acct].dates.add(tx.date.substring(0, 10))
    }

    const now = new Date()
    const results: AccountInfo[] = []

    for (const [name, data] of Object.entries(accountData)) {
      const sortedDates = [...data.dates].sort()
      const lastTxDate = sortedDates[sortedDates.length - 1]
      const daysSince = Math.floor((now.getTime() - new Date(lastTxDate).getTime()) / (1000 * 60 * 60 * 24))

      let avgFreq = 0
      if (sortedDates.length > 1) {
        const firstDate = new Date(sortedDates[0])
        const lastDate = new Date(sortedDates[sortedDates.length - 1])
        const totalDays = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
        avgFreq = Math.round(totalDays / (sortedDates.length - 1))
      }

      let level: ActivityLevel
      let score: number
      if (daysSince <= 7 && data.count >= 10) {
        level = 'high'
        score = 100
      } else if (daysSince <= 30 && data.count >= 3) {
        level = 'medium'
        score = 65
      } else if (daysSince <= 90) {
        level = 'low'
        score = 35
      } else {
        level = 'dormant'
        score = 10
      }

      results.push({ name, count: data.count, daysSinceLastTx: daysSince, avgFrequency: avgFreq, level, score })
    }

    // Sort: high first, then medium, low, dormant
    const order: Record<ActivityLevel, number> = { high: 0, medium: 1, low: 2, dormant: 3 }
    results.sort((a, b) => order[a.level] - order[b.level] || b.count - a.count)

    return results
  }, [transactions])

  return (
    <motion.div
      className="glass rounded-2xl border border-white/10 p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Activity className="w-5 h-5 text-cyan-400" />
        <h3 className="text-lg font-semibold text-white">Account Activity</h3>
        <span className="text-xs text-gray-500 ml-auto">{accounts.length} accounts</span>
      </div>

      {accounts.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          No transaction data available
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {accounts.map((acct) => {
            const style = ACTIVITY_STYLES[acct.level]
            return (
              <div key={acct.name} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate" title={acct.name}>{acct.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">{acct.count} transactions</span>
                      <span className="text-xs text-gray-600">|</span>
                      <span className="text-xs text-gray-500">
                        {acct.daysSinceLastTx === 0 ? 'Today' : `${acct.daysSinceLastTx}d ago`}
                      </span>
                      {acct.avgFrequency > 0 && (
                        <>
                          <span className="text-xs text-gray-600">|</span>
                          <span className="text-xs text-gray-500">Every {acct.avgFrequency}d</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 text-xs rounded-full border font-medium ${style.bg} ${style.border}`} style={{ color: style.color }}>
                    {ACTIVITY_LABELS[acct.level]}
                  </span>
                </div>

                {/* Activity bar */}
                <div className="mt-2 w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${acct.score}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: style.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
