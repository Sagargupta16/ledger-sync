/**
 * Financial Settings section - fiscal year, targets, tax regime, spending rules.
 */

import { Target } from 'lucide-react'
import { formatCurrency, getOrdinalSuffix } from '@/lib/formatters'
import { MONTHS } from '../types'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { Section, FieldHint, FieldLabel, FieldLegend, Toggle } from '../sectionPrimitives'
import { inputClass, selectClass } from '../styles'
import { PAYDAY_OPTIONS } from '../helpers'
import SpendingRuleFields from './SpendingRuleFields'
import BudgetDefaultsSubsection from './BudgetDefaultsSubsection'

interface Props {
  index: number
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
  defaultCollapsed?: boolean
}

export default function FinancialSettingsSection({
  index,
  localPrefs,
  updateLocalPref,
  defaultCollapsed = true,
}: Readonly<Props>) {
  return (
    <Section
      index={index}
      icon={Target}
      title="Financial Settings"
      description="Savings goals, investment targets, tax regime, and spending rules"
      defaultCollapsed={defaultCollapsed}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Fiscal Year */}
        <div>
          <FieldLabel htmlFor="fiscal-year">Fiscal Year Starts In</FieldLabel>
          <select
            id="fiscal-year"
            value={localPrefs.fiscal_year_start_month}
            onChange={(e) => updateLocalPref('fiscal_year_start_month', Number(e.target.value))}
            className={selectClass}
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value} className="bg-background">
                {m.label}
              </option>
            ))}
          </select>
          <FieldHint>Default: April (India FY)</FieldHint>
        </div>

        {/* Savings Goal */}
        <div>
          <FieldLegend>Savings Goal (%)</FieldLegend>
          <div className="flex items-center gap-3">
            <label htmlFor="savings-goal-slider" className="sr-only">
              Savings goal percentage slider
            </label>
            <input
              id="savings-goal-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={localPrefs.savings_goal_percent ?? 20}
              onChange={(e) => updateLocalPref('savings_goal_percent', Number(e.target.value))}
              className="touch-slider flex-1"
            />
            <label htmlFor="savings-goal-number" className="sr-only">
              Savings goal percentage
            </label>
            <input
              id="savings-goal-number"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              value={localPrefs.savings_goal_percent ?? 20}
              onChange={(e) => {
                const n = Number(e.target.value)
                updateLocalPref(
                  'savings_goal_percent',
                  Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0,
                )
              }}
              className="ledger-control min-h-11 w-16 rounded-lg border border-border px-2 py-2 text-center text-sm text-foreground focus:border-primary focus:outline-none sm:min-h-10"
            />
          </div>
        </div>

        {/* Monthly Investment Target */}
        <div>
          <FieldLabel htmlFor="investment-target">Investment Target / mo</FieldLabel>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {localPrefs.currency_symbol ?? '\u20B9'}
            </span>
            <input
              id="investment-target"
              type="number"
              inputMode="decimal"
              min="0"
              step="1000"
              value={localPrefs.monthly_investment_target ?? 0}
              onChange={(e) => {
                const n = Number(e.target.value)
                updateLocalPref('monthly_investment_target', Number.isFinite(n) ? Math.max(0, n) : 0)
              }}
              className={inputClass}
            />
          </div>
          {localPrefs.monthly_investment_target > 0 && (
            <FieldHint>
              <span className="text-app-green">
                Target: {formatCurrency(localPrefs.monthly_investment_target)} / month
              </span>
            </FieldHint>
          )}
        </div>

        {/* Payday */}
        <div>
          <FieldLabel htmlFor="payday">Payday</FieldLabel>
          <select
            id="payday"
            value={localPrefs.payday ?? 1}
            onChange={(e) => updateLocalPref('payday', Number(e.target.value))}
            className={selectClass}
          >
            {PAYDAY_OPTIONS.map((day) => (
              <option key={day} value={day} className="bg-background">
                {day}{getOrdinalSuffix(day)} of month
              </option>
            ))}
          </select>
        </div>

        {/* Tax Regime */}
        <div>
          <FieldLegend>Tax Regime</FieldLegend>
          <div className="flex gap-2">
            {(['new', 'old'] as const).map((regime) => (
              <label
                key={regime}
                htmlFor={`tax-regime-${regime}`}
                className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors sm:min-h-10 ${
                  (localPrefs.preferred_tax_regime ?? 'new') === regime
                    ? 'bg-primary/15 border-primary text-foreground font-medium'
                    : 'bg-[var(--overlay-2)] border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <input
                  id={`tax-regime-${regime}`}
                  type="radio"
                  name="tax-regime"
                  value={regime}
                  checked={(localPrefs.preferred_tax_regime ?? 'new') === regime}
                  onChange={(e) => updateLocalPref('preferred_tax_regime', e.target.value)}
                  className="sr-only"
                />
                {regime === 'new' ? 'New' : 'Old'} Regime
              </label>
            ))}
          </div>
          <FieldHint>
            {(localPrefs.preferred_tax_regime ?? 'new') === 'new'
              ? 'Lower rates, fewer deductions'
              : 'Higher rates, allows HRA/80C/80D deductions'}
          </FieldHint>
        </div>

        {/* TDS Schedule toggle */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <FieldLabel htmlFor="show-tds-schedule">Show TDS schedule</FieldLabel>
            <FieldHint>
              Adds a per-month tax-deducted chart to the Tax Planning page
              (needs a salary structure configured).
            </FieldHint>
          </div>
          <Toggle
            id="show-tds-schedule"
            aria-label="Show TDS schedule"
            checked={localPrefs.show_tds_schedule ?? false}
            onChange={(val) => updateLocalPref('show_tds_schedule', val)}
          />
        </div>

        {/* Salary TDS treatment */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <FieldLabel htmlFor="salary-net-of-tds">Salary recorded net of TDS</FieldLabel>
            <FieldHint>
              On (default): your recorded salary is what hit your bank (after TDS),
              so Tax Planning backs out the gross and shows the TDS already
              deducted. Off: the recorded amount is your pre-tax gross and tax is
              computed on it directly.
            </FieldHint>
          </div>
          <Toggle
            id="salary-net-of-tds"
            aria-label="Salary recorded net of TDS"
            checked={localPrefs.salary_is_net_of_tds ?? true}
            onChange={(val) => updateLocalPref('salary_is_net_of_tds', val)}
          />
        </div>

        {/* EPF withdrawal taxability */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <FieldLabel htmlFor="tax-epf-withdrawals">Tax EPF withdrawals</FieldLabel>
            <FieldHint>
              EPF withdrawals are tax-free after 5 years of continuous service
              (Section 10(12)). Leave off if your withdrawals qualify; turn on to
              count them as taxable income.
            </FieldHint>
          </div>
          <Toggle
            id="tax-epf-withdrawals"
            aria-label="Tax EPF withdrawals"
            checked={localPrefs.epf_withdrawal_taxable ?? false}
            onChange={(val) => updateLocalPref('epf_withdrawal_taxable', val)}
          />
        </div>

        {localPrefs.epf_withdrawal_taxable && (
          <div>
            <FieldLabel htmlFor="epf-taxable-percent">Taxable portion of EPF (%)</FieldLabel>
            <input
              id="epf-taxable-percent"
              type="number"
              min={0}
              max={100}
              step={1}
              value={localPrefs.epf_taxable_percent ?? 100}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10)
                const clamped = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
                updateLocalPref('epf_taxable_percent', clamped)
              }}
              className={inputClass}
            />
            <FieldHint>
              Share of each EPF inflow treated as taxable. 100% if the whole
              withdrawal is taxable (e.g. before 5 years of service).
            </FieldHint>
          </div>
        )}

        {/* Spending Rule 50/30/20 */}
        <SpendingRuleFields localPrefs={localPrefs} updateLocalPref={updateLocalPref} />
      </div>

      {/* Budget Defaults */}
      <BudgetDefaultsSubsection localPrefs={localPrefs} updateLocalPref={updateLocalPref} />
    </Section>
  )
}
