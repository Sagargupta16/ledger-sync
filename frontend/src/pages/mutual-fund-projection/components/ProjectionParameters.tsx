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
    <section
      className="ledger-panel p-4 sm:p-5"
      aria-labelledby="projection-parameters-title"
    >
      <h2 id="projection-parameters-title" className="mb-4 text-lg font-semibold">
        Projection Parameters
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            className="ledger-control min-h-11 w-full rounded-md border px-3 py-2.5 text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-10"
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
            className="ledger-control min-h-11 w-full rounded-md border px-3 py-2.5 text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-10"
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
            className="ledger-control min-h-11 w-full rounded-md border px-3 py-2.5 text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-10"
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
            className="ledger-control min-h-11 w-full rounded-md border px-3 py-2.5 text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-10"
            min="0"
            max="20"
            step="1"
          />
          <p className="text-xs text-muted-foreground mt-1">{sipGrowthLabel}</p>
        </div>
      </div>

      {children}
    </section>
  )
}
