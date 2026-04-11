/**
 * Financial Settings section - fiscal year, targets, tax regime, spending rules.
 */

import { Target } from 'lucide-react'
import { formatCurrency, getOrdinalSuffix } from '@/lib/formatters'
import { MONTHS } from './types'
import type { LocalPrefs, LocalPrefKey } from './types'
import { Section, FieldLabel, FieldHint } from './components'
import { inputClass, selectClass } from './styles'
import { PAYDAY_OPTIONS } from './helpers'
import SpendingRuleFields from './SpendingRuleFields'
import BudgetDefaultsSubsection from './BudgetDefaultsSubsection'

interface Props {
  index: number
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function FinancialSettingsSection({
  index,
  localPrefs,
  updateLocalPref,
}: Readonly<Props>) {
  return (
    <Section
      index={index}
      icon={Target}
      title="Financial Settings"
      description="Savings goals, investment targets, tax regime, and spending rules"
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
          <FieldLabel htmlFor="savings-goal">Savings Goal (%)</FieldLabel>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={localPrefs.savings_goal_percent ?? 20}
              onChange={(e) => updateLocalPref('savings_goal_percent', Number(e.target.value))}
              className="flex-1 h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
            />
            <input
              id="savings-goal"
              type="number"
              min="0"
              max="100"
              value={localPrefs.savings_goal_percent ?? 20}
              onChange={(e) => updateLocalPref('savings_goal_percent', Number(e.target.value))}
              className="w-16 px-2 py-2 bg-white/5 border border-border rounded-lg text-white text-sm text-center focus:border-primary focus:outline-none"
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
              min="0"
              step="1000"
              value={localPrefs.monthly_investment_target ?? 0}
              onChange={(e) => updateLocalPref('monthly_investment_target', Number(e.target.value))}
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
          <FieldLabel>Tax Regime</FieldLabel>
          <div className="flex gap-2">
            {(['new', 'old'] as const).map((regime) => (
              <label
                key={regime}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors border text-sm ${
                  (localPrefs.preferred_tax_regime ?? 'new') === regime
                    ? 'bg-primary/15 border-primary text-white font-medium'
                    : 'bg-white/5 border-border text-muted-foreground hover:text-white'
                }`}
              >
                <input
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

        {/* Spending Rule 50/30/20 */}
        <SpendingRuleFields localPrefs={localPrefs} updateLocalPref={updateLocalPref} />
      </div>

      {/* Budget Defaults */}
      <BudgetDefaultsSubsection localPrefs={localPrefs} updateLocalPref={updateLocalPref} />
    </Section>
  )
}
