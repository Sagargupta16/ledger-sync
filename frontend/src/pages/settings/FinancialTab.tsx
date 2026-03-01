/**
 * Financial Tab (Grouped)
 *
 * Combines four sections under collapsible panels:
 * 1. Financial Targets (from FinancialTargetsTab)
 * 2. Spending Rule / 50-30-20 (from OtherSettingsTab)
 * 3. Budget Defaults (from OtherSettingsTab)
 * 4. Credit Card Limits (from OtherSettingsTab)
 */

import { Target, TrendingUp, Calendar, Landmark, PiggyBank, CreditCard } from 'lucide-react'
import CollapsibleSection from '@/components/ui/CollapsibleSection'
import { formatCurrency } from '@/lib/formatters'
import type { LocalPrefs, LocalPrefKey } from './types'

interface FinancialTabProps {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
  creditCardAccounts: string[]
}

const PAYDAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

function getOrdinalSuffix(day: number): string {
  if (day === 1 || day === 21 || day === 31) return 'st'
  if (day === 2 || day === 22) return 'nd'
  if (day === 3 || day === 23) return 'rd'
  return 'th'
}

export default function FinancialTab({
  localPrefs,
  updateLocalPref,
  creditCardAccounts,
}: Readonly<FinancialTabProps>) {
  return (
    <div className="space-y-4">
      {/* Section 1: Financial Targets */}
      <CollapsibleSection title="Financial Targets" icon={Target} defaultExpanded={true}>
        <div className="space-y-6">
          {/* Savings Goal */}
          <div className="glass rounded-lg p-5 border border-border">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Savings Goal
            </h3>
            <div className="max-w-md space-y-3">
              <label htmlFor="savings-goal" className="block text-sm font-medium text-foreground">
                Savings Goal (% of income)
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="savings-goal"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={localPrefs.savings_goal_percent ?? 20}
                  onChange={(e) =>
                    updateLocalPref('savings_goal_percent', Number(e.target.value))
                  }
                  className="flex-1 h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
                />
                <div className="flex items-center gap-1 min-w-[5rem]">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={localPrefs.savings_goal_percent ?? 20}
                    onChange={(e) =>
                      updateLocalPref('savings_goal_percent', Number(e.target.value))
                    }
                    className="w-16 px-2 py-1.5 bg-white/5 border border-border-strong rounded-lg text-white text-sm text-center focus:border-primary"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Aim to save at least this percentage of your monthly income. Default: 20%
              </p>
            </div>
          </div>

          {/* Monthly Investment Target */}
          <div className="glass rounded-lg p-5 border border-border">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Monthly Investment Target
            </h3>
            <div className="max-w-md space-y-3">
              <label
                htmlFor="investment-target"
                className="block text-sm font-medium text-foreground"
              >
                Target Amount
              </label>
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
                  onChange={(e) =>
                    updateLocalPref('monthly_investment_target', Number(e.target.value))
                  }
                  className="w-48 px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
                />
              </div>
              {localPrefs.monthly_investment_target > 0 && (
                <p className="text-xs text-ios-green">
                  Target: {formatCurrency(localPrefs.monthly_investment_target)} per month
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Set a monthly investment target to track against your actual investments.
              </p>
            </div>
          </div>

          {/* Payday */}
          <div className="glass rounded-lg p-5 border border-border">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Payday
            </h3>
            <div className="max-w-md space-y-3">
              <label htmlFor="payday" className="block text-sm font-medium text-foreground">
                Day of Month
              </label>
              <select
                id="payday"
                value={localPrefs.payday ?? 1}
                onChange={(e) => updateLocalPref('payday', Number(e.target.value))}
                className="w-40 px-4 py-2 bg-white/5 border border-border-strong rounded-lg text-white focus:border-primary"
              >
                {PAYDAY_OPTIONS.map((day) => (
                  <option key={day} value={day} className="bg-background">
                    {day}
                    {getOrdinalSuffix(day)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                The day of the month your salary is credited. Used for budget cycle calculations.
                Default: 1st
              </p>
            </div>
          </div>

          {/* Preferred Tax Regime */}
          <div className="glass rounded-lg p-5 border border-border">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-primary" />
              Preferred Tax Regime
            </h3>
            <div className="max-w-md space-y-4">
              <p className="text-sm text-muted-foreground">
                Select your preferred income tax regime for tax-related calculations.
              </p>
              <div className="flex flex-col gap-3">
                <label
                  className="flex items-center gap-3 cursor-pointer"
                  aria-label="New Regime"
                >
                  <input
                    type="radio"
                    name="tax-regime"
                    value="new"
                    checked={(localPrefs.preferred_tax_regime ?? 'new') === 'new'}
                    onChange={(e) => updateLocalPref('preferred_tax_regime', e.target.value)}
                    className="w-4 h-4 bg-white/5 border-border-strong text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-sm text-white font-medium">New Regime</span>
                    <p className="text-xs text-muted-foreground">
                      Lower tax rates, fewer deductions (default from FY 2024-25)
                    </p>
                  </div>
                </label>
                <label
                  className="flex items-center gap-3 cursor-pointer"
                  aria-label="Old Regime"
                >
                  <input
                    type="radio"
                    name="tax-regime"
                    value="old"
                    checked={(localPrefs.preferred_tax_regime ?? 'new') === 'old'}
                    onChange={(e) => updateLocalPref('preferred_tax_regime', e.target.value)}
                    className="w-4 h-4 bg-white/5 border-border-strong text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-sm text-white font-medium">Old Regime</span>
                    <p className="text-xs text-muted-foreground">
                      Higher rates but allows HRA, 80C, 80D, and other deductions
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 2: Spending Rule (50/30/20) */}
      <CollapsibleSection title="Spending Rule (50/30/20)" icon={Target} defaultExpanded={true}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label
              htmlFor="needs-target"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Needs Target (%)
            </label>
            <input
              id="needs-target"
              type="number"
              min="0"
              max="100"
              value={localPrefs.needs_target_percent}
              onChange={(e) => updateLocalPref('needs_target_percent', Number(e.target.value))}
              className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="wants-target"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Wants Target (%)
            </label>
            <input
              id="wants-target"
              type="number"
              min="0"
              max="100"
              value={localPrefs.wants_target_percent}
              onChange={(e) => updateLocalPref('wants_target_percent', Number(e.target.value))}
              className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="savings-target"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Savings Target (%)
            </label>
            <input
              id="savings-target"
              type="number"
              min="0"
              max="100"
              value={localPrefs.savings_target_percent}
              onChange={(e) => updateLocalPref('savings_target_percent', Number(e.target.value))}
              className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
        </div>
        {(() => {
          const sum =
            localPrefs.needs_target_percent +
            localPrefs.wants_target_percent +
            localPrefs.savings_target_percent
          if (sum !== 100) {
            return (
              <p className="mt-3 text-xs text-ios-yellow">
                Targets sum to {sum}% — they should add up to 100%.
              </p>
            )
          }
          return (
            <p className="mt-3 text-xs text-muted-foreground">
              Default: 50% Needs / 30% Wants / 20% Savings
            </p>
          )
        })()}
      </CollapsibleSection>

      {/* Section 3: Budget Defaults */}
      <CollapsibleSection title="Budget Defaults" icon={PiggyBank} defaultExpanded={true}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
          <div>
            <label
              htmlFor="alert-threshold"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Alert Threshold (%)
            </label>
            <input
              id="alert-threshold"
              type="number"
              min="0"
              max="100"
              value={localPrefs.default_budget_alert_threshold}
              onChange={(e) =>
                updateLocalPref('default_budget_alert_threshold', Number(e.target.value))
              }
              className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer pt-7">
            <input
              type="checkbox"
              checked={localPrefs.auto_create_budgets}
              onChange={(e) => updateLocalPref('auto_create_budgets', e.target.checked)}
              className="w-4 h-4 rounded bg-white/5 border-border-strong text-primary focus:ring-primary"
            />
            <span className="text-sm text-white">Auto-create budgets</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer pt-7">
            <input
              type="checkbox"
              checked={localPrefs.budget_rollover_enabled}
              onChange={(e) => updateLocalPref('budget_rollover_enabled', e.target.checked)}
              className="w-4 h-4 rounded bg-white/5 border-border-strong text-primary focus:ring-primary"
            />
            <span className="text-sm text-white">Budget rollover</span>
          </label>
        </div>
      </CollapsibleSection>

      {/* Section 4: Credit Card Limits */}
      <CollapsibleSection
        title="Credit Card Limits"
        icon={CreditCard}
        defaultExpanded={true}
        badge={creditCardAccounts.length || undefined}
      >
        {creditCardAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No credit card accounts found. Classify accounts as &quot;Credit Cards&quot; in the
            Account Types tab to set limits.
          </p>
        ) : (
          <div className="space-y-3">
            {creditCardAccounts.map((card) => (
              <div key={card} className="flex items-center gap-4">
                <span className="text-sm text-white min-w-48 truncate" title={card}>
                  {card.replace(' Credit Card', '')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Limit:</span>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={localPrefs.credit_card_limits[card] ?? 100000}
                    onChange={(e) => {
                      const newLimits = {
                        ...localPrefs.credit_card_limits,
                        [card]: Number(e.target.value),
                      }
                      updateLocalPref('credit_card_limits', newLimits)
                    }}
                    className="w-36 px-3 py-1.5 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground">
                    ({formatCurrency(localPrefs.credit_card_limits[card] ?? 100000)})
                  </span>
                </div>
              </div>
            ))}
            <p className="mt-2 text-xs text-muted-foreground">
              Default: {formatCurrency(100000)} per card
            </p>
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}
