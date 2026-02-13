import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Gauge } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'

export default function SpendingVelocityGauge() {
  const { data: transactions = [] } = useTransactions()

  const { dailyRate, projectedTotal, prevMonthTotal, pace, daysElapsed, daysInMonth } = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const dayOfMonth = now.getDate()
    const totalDays = new Date(year, month + 1, 0).getDate()
    const currentKey = `${year}-${String(month + 1).padStart(2, '0')}`

    // Previous month
    const prevDate = new Date(year, month - 1, 1)
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

    let currentExpenses = 0
    let prevExpenses = 0

    for (const tx of transactions) {
      if (tx.type !== 'Expense') continue
      const txMonth = tx.date.substring(0, 7)
      if (txMonth === currentKey) currentExpenses += Math.abs(tx.amount)
      else if (txMonth === prevKey) prevExpenses += Math.abs(tx.amount)
    }

    const rate = dayOfMonth > 0 ? currentExpenses / dayOfMonth : 0
    const projected = rate * totalDays
    const paceVsPrev = prevExpenses > 0 ? ((projected - prevExpenses) / prevExpenses) * 100 : 0

    return {
      dailyRate: rate,
      projectedTotal: projected,
      prevMonthTotal: prevExpenses,
      pace: paceVsPrev,
      daysElapsed: dayOfMonth,
      daysInMonth: totalDays,
    }
  }, [transactions])

  // Gauge calculation
  const gaugeRatio = prevMonthTotal > 0 ? Math.min(projectedTotal / prevMonthTotal, 2) : 0
  const gaugeAngle = gaugeRatio * 180
  const gaugeColor = (() => {
    if (gaugeRatio < 1) return rawColors.ios.green
    if (gaugeRatio < 1.2) return rawColors.ios.yellow
    return rawColors.ios.red
  })()

  // SVG arc path
  const cx = 100, cy = 100, r = 80
  const startAngle = Math.PI
  const endAngle = startAngle - (gaugeAngle * Math.PI) / 180
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy + r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  const largeArc = gaugeAngle > 180 ? 1 : 0
  const arcPath = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`

  return (
    <motion.div
      className="glass rounded-2xl border border-white/10 p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Gauge className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Spending Velocity</h3>
        <span className="text-xs text-gray-500 ml-auto">Day {daysElapsed} of {daysInMonth}</span>
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-8">
        {/* Gauge */}
        <div className="flex-shrink-0">
          <svg viewBox="0 0 200 120" className="w-56 h-auto">
            {/* Background arc */}
            <path
              d={`M ${cx + r * Math.cos(Math.PI)} ${cy + r * Math.sin(Math.PI)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(0)} ${cy + r * Math.sin(0)}`}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="14"
              fill="none"
              strokeLinecap="round"
            />
            {/* Filled arc */}
            {gaugeAngle > 0 && (
              <path
                d={arcPath}
                stroke={gaugeColor}
                strokeWidth="14"
                fill="none"
                strokeLinecap="round"
              />
            )}
            {/* Center text */}
            <text x={cx} y={cy - 10} textAnchor="middle" fill="white" fontSize="22" fontWeight="bold">
              {pace >= 0 ? '+' : ''}{Math.round(pace)}%
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="#9ca3af" fontSize="11">
              vs last month
            </text>
          </svg>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 flex-1 w-full">
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-xs text-gray-500">Daily Rate</p>
            <p className="text-lg font-semibold text-white mt-1">{formatCurrency(dailyRate)}</p>
            <p className="text-xs text-gray-500 mt-0.5">per day</p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-xs text-gray-500">Projected Total</p>
            <p className="text-lg font-semibold mt-1" style={{ color: gaugeColor }}>{formatCurrency(projectedTotal)}</p>
            <p className="text-xs text-gray-500 mt-0.5">this month</p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-xs text-gray-500">Last Month Total</p>
            <p className="text-lg font-semibold text-gray-300 mt-1">{formatCurrency(prevMonthTotal)}</p>
            <p className="text-xs text-gray-500 mt-0.5">actual spend</p>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-xs text-gray-500">Pace</p>
            <p className="text-lg font-semibold mt-1" style={{ color: pace <= 0 ? rawColors.ios.green : rawColors.ios.red }}>
              {pace <= 0 ? 'Under' : 'Over'} Budget
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{Math.abs(Math.round(pace))}% {pace <= 0 ? 'slower' : 'faster'}</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
