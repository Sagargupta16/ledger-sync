import { motion } from 'framer-motion'

interface ProjectionParametersProps {
  sipInputValue: number
  expectedReturn: number
  projectionYears: number
  sipGrowthRate: number
  showAutoDetectedHint: boolean
  sipGrowthLabel: string
  onMonthlySIPChange: (value: number) => void
  onUserModifiedSIP: () => void
  onExpectedReturnChange: (value: number) => void
  onProjectionYearsChange: (value: number) => void
  onSipGrowthRateChange: (value: number) => void
  children?: React.ReactNode
}

export function ProjectionParameters(props: Readonly<ProjectionParametersProps>) {
  const {
    sipInputValue,
    expectedReturn,
    projectionYears,
    sipGrowthRate,
    showAutoDetectedHint,
    sipGrowthLabel,
    onMonthlySIPChange,
    onUserModifiedSIP,
    onExpectedReturnChange,
    onProjectionYearsChange,
    onSipGrowthRateChange,
    children,
  } = props

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="glass rounded-2xl border border-border p-4 sm:p-6"
    >
      <h3 className="text-lg font-semibold mb-4">Projection Parameters</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <label
            htmlFor="monthly-sip"
            className="block text-sm font-medium text-muted-foreground mb-2"
          >
            Monthly SIP ({'₹'})
          </label>
          <input
            id="monthly-sip"
            type="number"
            inputMode="decimal"
            value={sipInputValue}
            onChange={(e) => {
              onMonthlySIPChange(Number(e.target.value))
              onUserModifiedSIP()
            }}
            className="w-full bg-[var(--overlay-2)] border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-app-blue/50 focus:border-app-blue/30 transition-colors"
            min="0"
            step="1000"
          />
          {showAutoDetectedHint && (
            <p className="text-xs text-muted-foreground mt-1">Auto-detected from last SIP</p>
          )}
        </div>

        <div>
          <label
            htmlFor="expected-return"
            className="block text-sm font-medium text-muted-foreground mb-2"
          >
            Expected Return (% p.a.)
          </label>
          <input
            id="expected-return"
            type="number"
            inputMode="decimal"
            value={expectedReturn}
            onChange={(e) => onExpectedReturnChange(Number(e.target.value))}
            className="w-full bg-[var(--overlay-2)] border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-app-blue/50 focus:border-app-blue/30 transition-colors"
            min="0"
            max="50"
            step="0.5"
          />
        </div>

        <div>
          <label
            htmlFor="projection-years"
            className="block text-sm font-medium text-muted-foreground mb-2"
          >
            Projection Period (Years)
          </label>
          <input
            id="projection-years"
            type="number"
            inputMode="decimal"
            value={projectionYears}
            onChange={(e) => onProjectionYearsChange(Number(e.target.value))}
            className="w-full bg-[var(--overlay-2)] border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-app-blue/50 focus:border-app-blue/30 transition-colors"
            min="1"
            max="40"
          />
        </div>

        <div>
          <label
            htmlFor="sip-growth"
            className="block text-sm font-medium text-muted-foreground mb-2"
          >
            SIP Growth (% p.a.)
          </label>
          <input
            id="sip-growth"
            type="number"
            inputMode="decimal"
            value={sipGrowthRate}
            onChange={(e) => onSipGrowthRateChange(Number(e.target.value))}
            className="w-full bg-[var(--overlay-2)] border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-app-blue/50 focus:border-app-blue/30 transition-colors"
            min="0"
            max="20"
            step="1"
          />
          <p className="text-xs text-muted-foreground mt-1">{sipGrowthLabel}</p>
        </div>
      </div>

      {children}
    </motion.div>
  )
}
