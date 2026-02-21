/**
 * Financial Targets Tab
 *
 * Savings goal percentage, monthly investment target,
 * payday configuration, and preferred tax regime.
 */

import { Target, TrendingUp, Calendar, Landmark } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from './types'
import { formatCurrency } from '@/lib/formatters'

interface FinancialTargetsTabProps {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

const PAYDAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

export default function FinancialTargetsTab({
  localPrefs,
  updateLocalPref,
}: Readonly<FinancialTargetsTabProps>) {
  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-white">Financial Targets</h2>

      {/* Savings Goal Section */}
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
              onChange={(e) => updateLocalPref('savings_goal_percent', Number(e.target.value))}
              className="flex-1 h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
            />
            <div className="flex items-center gap-1 min-w-[5rem]">
              <input
                type="number"
                min="0"
                max="100"
                value={localPrefs.savings_goal_percent ?? 20}
                onChange={(e) => updateLocalPref('savings_goal_percent', Number(e.target.value))}
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

      {/* Monthly Investment Target Section */}
      <div className="glass rounded-lg p-5 border border-border">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Monthly Investment Target
        </h3>
        <div className="max-w-md space-y-3">
          <label htmlFor="investment-target" className="block text-sm font-medium text-foreground">
            Target Amount
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{localPrefs.currency_symbol ?? '₹'}</span>
            <input
              id="investment-target"
              type="number"
              min="0"
              step="1000"
              value={localPrefs.monthly_investment_target ?? 0}
              onChange={(e) => updateLocalPref('monthly_investment_target', Number(e.target.value))}
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

      {/* Payday Section */}
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
                {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            The day of the month your salary is credited. Used for budget cycle calculations. Default: 1st
          </p>
        </div>
      </div>

      {/* Preferred Tax Regime Section */}
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
            <label className="flex items-center gap-3 cursor-pointer">
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
                <p className="text-xs text-muted-foreground">Lower tax rates, fewer deductions (default from FY 2024-25)</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
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
                <p className="text-xs text-muted-foreground">Higher rates but allows HRA, 80C, 80D, and other deductions</p>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
