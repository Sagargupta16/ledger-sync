import { motion } from 'framer-motion'
import { ChevronRight, TrendingUp, Lightbulb, Receipt, ListTree } from 'lucide-react'
import { BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { formatCurrency } from '@/lib/formatters'
import {
  PageHeader,
  ChartContainer,
  CollapsibleSection,
  chartTooltipProps,
  GRID_DEFAULTS,
  xAxisDefaults,
  yAxisDefaults,
  shouldAnimate,
  BAR_RADIUS,
  ACTIVE_DOT,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import TaxSummaryCards from '@/components/analytics/TaxSummaryCards'
import TaxSlabBreakdown from '@/components/analytics/TaxSlabBreakdown'
import TaxSummaryGrid from '@/components/analytics/TaxSummaryGrid'
import EffectiveTaxRateChart from '@/components/analytics/EffectiveTaxRateChart'
import TaxableIncomeTable from '@/components/analytics/TaxableIncomeTable'
import { useTaxPlanning } from './useTaxPlanning'
import { buildYearlyTaxData } from './taxPlanningUtils'
import TaxPageActions from './components/TaxPageActions'
import TaxTip from './components/TaxTip'
import RegimeComparison from './components/RegimeComparison'
import MultiYearProjectionTable from './components/MultiYearProjectionTable'
import TdsScheduleChart from './components/TdsScheduleChart'

export default function TaxPlanningPage() {
  const {
    isLoading,
    preferredRegime,
    salaryIsNetOfTds,
    regimeOverride,
    setRegimeOverride,
    showProjection,
    setShowProjection,
    fyList,
    effectiveFY,
    currentFYLabel,
    currentFYData,
    isCurrentFY,
    hasSalaryData,
    useSalaryProjection,
    transactionsByFY,
    multiYearProjections,
    tdsSchedule,
    showTdsSchedule,
    cardOverride,
    netTaxableIncome,
    salaryMonthsCount,
    expense,
    fyYear,
    newRegimeAvailable,
    isNewRegime,
    taxSlabs,
    regimeLabel,
    standardDeduction,
    display,
    prevFYDisplay,
    canGoBack,
    canGoForward,
    goToPreviousFY,
    goToNextFY,
  } = useTaxPlanning()

  return (
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <PageHeader
          title="Income Tax"
          subtitle={`Estimate your tax liability — ${regimeLabel}`}
          action={
            <TaxPageActions
              isNewRegime={isNewRegime}
              setRegimeOverride={setRegimeOverride}
              newRegimeAvailable={newRegimeAvailable}
              isCurrentFY={isCurrentFY}
              showProjection={showProjection}
              setShowProjection={setShowProjection}
              selectedFY={effectiveFY}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              goToPreviousFY={goToPreviousFY}
              goToNextFY={goToNextFY}
              hasSalaryData={hasSalaryData}
            />
          }
        />
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="space-y-6 md:space-y-8"
        >
          {fyList.length === 0 && !isLoading ? (
            <motion.div variants={fadeUpItem}>
              <ChartEmptyState
                height={300}
                message="No transaction data available. Upload your data to see tax estimates."
              />
            </motion.div>
          ) : (
            <>
              <motion.div variants={fadeUpItem}>
                <TaxSummaryCards
                  isLoading={isLoading}
                  netTaxableIncome={display.net}
                  grossTaxableIncome={cardOverride?.taxableIncome ?? display.gross}
                  taxAlreadyPaid={cardOverride?.taxAlreadyPaid ?? display.totalTax}
                  isProjecting={useSalaryProjection}
                  prevNetTaxableIncome={prevFYDisplay?.net}
                  prevGrossTaxableIncome={prevFYDisplay?.gross}
                  prevTaxAlreadyPaid={prevFYDisplay?.totalTax}
                />
              </motion.div>

              <motion.div variants={fadeUpItem}>
                <CollapsibleSection title="Tax Slab Breakdown" icon={ListTree} defaultExpanded={false}>
                  <TaxSlabBreakdown
                    isNewRegime={isNewRegime}
                    taxSlabs={taxSlabs}
                    slabBreakdown={display.slabBreakdown}
                    grossTaxableIncome={display.gross}
                    standardDeduction={standardDeduction}
                    fyYear={fyYear}
                    baseTax={display.baseTax}
                    rebate87A={display.rebate87A}
                    surcharge={display.surcharge}
                    cess={display.cess}
                    professionalTax={display.professionalTax}
                    totalTax={display.totalTax}
                    isProjecting={useSalaryProjection}
                  />
                </CollapsibleSection>
              </motion.div>

              <motion.div variants={fadeUpItem}>
                <TaxSummaryGrid
                  selectedFY={effectiveFY}
                  grossTaxableIncome={cardOverride?.taxableIncome ?? display.gross}
                  taxAlreadyPaid={cardOverride?.taxAlreadyPaid ?? display.totalTax}
                  totalIncome={display.income}
                  totalExpense={expense}
                  isProjecting={useSalaryProjection}
                />
              </motion.div>

              {showTdsSchedule && tdsSchedule.length > 0 && (
                <motion.div variants={fadeUpItem}>
                  <TdsScheduleChart schedule={tdsSchedule} monthsPaid={salaryMonthsCount} />
                </motion.div>
              )}

              <EffectiveTaxRateChart
                taxSlabs={taxSlabs}
                isNewRegime={isNewRegime}
                fyYear={fyYear}
                standardDeduction={standardDeduction}
                currentIncome={display.gross}
              />

              {!useSalaryProjection && (
                <motion.div variants={fadeUpItem}>
                  <CollapsibleSection title="Taxable Income Detail" icon={Receipt} defaultExpanded={false}>
                    <TaxableIncomeTable
                      selectedFY={effectiveFY}
                      incomeGroups={currentFYData?.incomeGroups}
                      netTaxableIncome={netTaxableIncome}
                    />
                  </CollapsibleSection>
                </motion.div>
              )}

              <motion.div variants={fadeUpItem}>
                <CollapsibleSection
                  title="Tax Saving Suggestions"
                  icon={Lightbulb}
                  defaultExpanded={false}
                >
                  <p className="text-xs text-muted-foreground mb-4">
                    {isNewRegime
                      ? 'New Regime — Limited deductions, lower rates'
                      : 'Old Regime — Maximize deductions to reduce taxable income'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {isNewRegime ? (
                    <>
                      <TaxTip
                        title="Standard Deduction"
                        amount={standardDeduction}
                        description="Automatically applied to salaried individuals. No action needed."
                      />
                      <TaxTip
                        title="NPS — Employer Contribution"
                        amount={null}
                        description="Section 80CCD(2): Up to 14% of basic salary contributed by employer is deductible even in New Regime."
                      />
                      <TaxTip
                        title="Home Loan Interest (Let-out)"
                        amount={null}
                        description="Section 24(b): Interest on loan for let-out property is fully deductible (no limit). Self-occupied is NOT allowed in New Regime."
                      />
                      <TaxTip
                        title="Agniveer Corpus Fund"
                        amount={null}
                        description="Section 80CCH: Full deduction for contributions to the Agniveer scheme."
                      />
                      <TaxTip
                        title="Section 87A Rebate"
                        amount={fyYear >= 2025 ? 60000 : 25000}
                        description={
                          fyYear >= 2025
                            ? 'Income up to 12L: Full tax rebate (zero tax up to 12.75L after standard deduction).'
                            : 'Income up to 7L: Full tax rebate (zero tax up to 7.75L after standard deduction).'
                        }
                      />
                      <TaxTip
                        title="Consider Old Regime?"
                        amount={null}
                        description="If you have significant 80C investments (1.5L), HRA, home loan interest, or medical insurance — Old Regime may save more. Compare both."
                      />
                    </>
                  ) : (
                    <>
                      <TaxTip
                        title="Section 80C"
                        amount={150000}
                        description="PPF, ELSS, LIC, EPF, tuition fees, home loan principal. Max deduction: 1.5L."
                      />
                      <TaxTip
                        title="Section 80CCD(1B) — NPS"
                        amount={50000}
                        description="Additional 50K deduction for NPS contributions (over and above 80C)."
                      />
                      <TaxTip
                        title="Section 80D — Health Insurance"
                        amount={75000}
                        description="Self/family: 25K (50K if senior). Parents: 25K (50K if senior). Total max: 75K-1L."
                      />
                      <TaxTip
                        title="Section 24(b) — Home Loan Interest"
                        amount={200000}
                        description="Interest on self-occupied property loan: up to 2L deduction per year."
                      />
                      <TaxTip
                        title="HRA Exemption"
                        amount={null}
                        description="If you live in rented housing and receive HRA as part of salary, claim exemption under Section 10(13A)."
                      />
                      <TaxTip
                        title="Section 80E — Education Loan"
                        amount={null}
                        description="Full interest deduction on education loan for self, spouse, or children. No upper limit. Available for 8 years."
                      />
                      <TaxTip
                        title="Section 80G — Donations"
                        amount={null}
                        description="50% or 100% deduction for donations to approved charities. Keep receipts with PAN of the organization."
                      />
                      <TaxTip
                        title="Section 80TTA — Savings Interest"
                        amount={10000}
                        description="Interest from savings bank accounts: up to 10K deduction (50K for senior citizens under 80TTB)."
                      />
                    </>
                  )}
                  </div>
                </CollapsibleSection>
              </motion.div>

              {fyList.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="glass rounded-2xl border border-border p-4 md:p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 bg-app-blue/10 rounded-xl">
                      <TrendingUp className="w-5 h-5 text-app-blue" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Tax Per Year</h3>
                      <p className="text-xs text-muted-foreground">
                        Paid (red) vs projected (orange) bars on the left axis; cumulative total (blue) on the right axis
                      </p>
                    </div>
                  </div>
                  {(() => {
                    const yearlyTaxData = buildYearlyTaxData(
                      fyList,
                      transactionsByFY,
                      multiYearProjections,
                      currentFYLabel,
                      regimeOverride,
                      preferredRegime,
                      salaryIsNetOfTds,
                    )
                    if (yearlyTaxData.every((d) => d.paidTax === 0 && d.projected === 0)) {
                      return (
                        <ChartEmptyState
                          height={280}
                          message="No tax liability found across years"
                        />
                      )
                    }

                    return (
                      <ChartContainer
                        height={300}
                        ariaLabel="Tax per fiscal year -- paid versus projected, with a cumulative total trend line"
                      >
                        <BarChart
                          data={yearlyTaxData}
                          margin={{ top: 8, right: 12, bottom: 8, left: 4 }}
                        >
                          <CartesianGrid {...GRID_DEFAULTS} />
                          <XAxis {...xAxisDefaults(yearlyTaxData.length)} dataKey="fy" />
                          {/* Left axis: per-year tax bars. Right axis: cumulative
                              total -- on its own scale so the much larger running
                              sum no longer flattens the yearly bars. */}
                          <YAxis {...yAxisDefaults()} yAxisId="left" />
                          <YAxis
                            {...yAxisDefaults()}
                            yAxisId="right"
                            orientation="right"
                          />
                          <Tooltip
                            {...chartTooltipProps}
                            formatter={(value, name) => {
                              if (typeof value !== 'number' || value === 0) return ['', '']
                              const labels: Record<string, string> = {
                                paidTax: 'Tax Paid',
                                projected: 'Projected Tax',
                                cumulative: 'Cumulative',
                              }
                              return [formatCurrency(value), labels[name ?? ''] ?? name]
                            }}
                            cursor={{ fill: rawColors.chart.grid }}
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="paidTax"
                            name="paidTax"
                            stackId="tax"
                            fill={rawColors.app.red}
                            fillOpacity={0.7}
                            maxBarSize={40}
                            isAnimationActive={shouldAnimate(yearlyTaxData.length)}
                            animationDuration={600}
                            animationEasing="ease-out"
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="projected"
                            name="projected"
                            stackId="tax"
                            fill={rawColors.app.orange}
                            fillOpacity={0.5}
                            radius={BAR_RADIUS}
                            maxBarSize={40}
                            isAnimationActive={shouldAnimate(yearlyTaxData.length)}
                            animationDuration={600}
                            animationEasing="ease-out"
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="cumulative"
                            name="cumulative"
                            stroke={rawColors.app.blue}
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            dot={false}
                            activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.blue }}
                            isAnimationActive={shouldAnimate(yearlyTaxData.length)}
                            animationDuration={600}
                          />
                        </BarChart>
                      </ChartContainer>
                    )
                  })()}
                </motion.div>
              )}

              {newRegimeAvailable && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="glass rounded-2xl border border-border p-4 md:p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 bg-app-purple/20 rounded-xl">
                      <ChevronRight className="w-5 h-5 text-app-purple" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Which Regime Saves You More?</h3>
                      <p className="text-xs text-muted-foreground">
                        Based on your income of {formatCurrency(display.gross)}
                      </p>
                    </div>
                  </div>

                  <RegimeComparison
                    grossIncome={display.gross}
                    fyYear={fyYear}
                    standardDeduction={standardDeduction}
                    salaryMonthsCount={salaryMonthsCount}
                  />
                </motion.div>
              )}

              {hasSalaryData && multiYearProjections.length > 1 && (
                <motion.div variants={fadeUpItem}>
                  <MultiYearProjectionTable projections={multiYearProjections} />
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}
