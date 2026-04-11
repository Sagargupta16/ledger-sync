import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { rawColors } from '@/constants/colors'

type ActivityLevel = 'high' | 'medium' | 'low' | 'dormant'

const ACTIVITY_STYLES: Record<ActivityLevel, { color: string; bg: string; border: string }> = {
  high: { color: rawColors.app.green, bg: 'bg-app-green/10', border: 'border-app-green/20' },
  medium: { color: rawColors.app.blue, bg: 'bg-app-blue/10', border: 'border-app-blue/20' },
  low: { color: rawColors.app.yellow, bg: 'bg-app-yellow/10', border: 'border-app-yellow/20' },
  dormant: { color: rawColors.app.red, bg: 'bg-app-red/10', border: 'border-app-red/20' },
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

function classifyActivity(daysSince: number, count: number): { level: ActivityLevel; score: number } {
  if (daysSince <= 7 && count >= 10) return { level: 'high', score: 100 }
  if (daysSince <= 30 && count >= 3) return { level: 'medium', score: 65 }
  if (daysSince <= 90) return { level: 'low', score: 35 }
  return { level: 'dormant', score: 10 }
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
      const sortedDates = [...data.dates].sort((a, b) => a.localeCompare(b))
      const lastTxDate = sortedDates.at(-1) ?? ''
      if (!lastTxDate) continue
      const daysSince = Math.floor((now.getTime() - new Date(lastTxDate).getTime()) / (1000 * 60 * 60 * 24))

      let avgFreq = 0
      if (sortedDates.length > 1) {
        const firstDate = new Date(sortedDates[0])
        const lastDate = new Date(lastTxDate)
        const totalDays = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
        avgFreq = Math.round(totalDays / (sortedDates.length - 1))
      }

      const { level, score } = classifyActivity(daysSince, data.count)
      results.push({ name, count: data.count, daysSinceLastTx: daysSince, avgFrequency: avgFreq, level, score })
    }

    // Sort: high first, then medium, low, dormant
    const order: Record<ActivityLevel, number> = { high: 0, medium: 1, low: 2, dormant: 3 }
    results.sort((a, b) => order[a.level] - order[b.level] || b.count - a.count)

    return results
  }, [transactions])

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Activity className="w-5 h-5 text-app-teal" />
        <h3 className="text-lg font-semibold text-white">Account Activity</h3>
        <span className="text-xs text-text-tertiary ml-auto">{accounts.length} accounts</span>
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
              <div key={acct.name} className="p-3 rounded-xl bg-white/5 border border-border hover:bg-white/10 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate" title={acct.name}>{acct.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-text-tertiary">{acct.count} transactions</span>
                      <span className="text-xs text-text-quaternary">|</span>
                      <span className="text-xs text-text-tertiary">
                        {acct.daysSinceLastTx === 0 ? 'Today' : `${acct.daysSinceLastTx}d ago`}
                      </span>
                      {acct.avgFrequency > 0 && (
                        <>
                          <span className="text-xs text-text-quaternary">|</span>
                          <span className="text-xs text-text-tertiary">Every {acct.avgFrequency}d</span>
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
