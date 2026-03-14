/**
 * Investment Account Mappings section - map investment accounts to types.
 */

import { TrendingUp } from 'lucide-react'
import { INVESTMENT_TYPES } from './types'
import type { LocalPrefs, LocalPrefKey } from './types'
import { Section, FieldHint } from './components'
import { selectClass } from './styles'

interface Props {
  index: number
  investmentAccounts: string[]
  unmappedInvestmentAccounts: string[]
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function InvestmentMappingsSection({
  index,
  investmentAccounts,
  unmappedInvestmentAccounts,
  localPrefs,
  updateLocalPref,
}: Readonly<Props>) {
  const setInvestmentMapping = (account: string, investmentType: string) => {
    if (investmentType === '') {
      const rest = Object.fromEntries(
        Object.entries(localPrefs.investment_account_mappings).filter(([k]) => k !== account),
      )
      updateLocalPref('investment_account_mappings', rest)
    } else {
      updateLocalPref('investment_account_mappings', {
        ...localPrefs.investment_account_mappings,
        [account]: investmentType,
      })
    }
  }

  if (investmentAccounts.length === 0) return null

  return (
    <Section
      index={index}
      icon={TrendingUp}
      title="Investment Account Mappings"
      description="Map investment accounts to their investment type"
    >
      <div className="space-y-3">
        {investmentAccounts.map((account) => (
          <div
            key={account}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2 border-b border-border last:border-0"
          >
            <span className="text-sm text-white flex-1 min-w-0 truncate">{account}</span>
            <select
              value={localPrefs.investment_account_mappings[account] || ''}
              onChange={(e) => setInvestmentMapping(account, e.target.value)}
              className={`${selectClass} w-full sm:w-48`}
            >
              <option value="" className="bg-background">
                Unassigned
              </option>
              {INVESTMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value} className="bg-background">
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        {unmappedInvestmentAccounts.length > 0 && (
          <FieldHint>
            {unmappedInvestmentAccounts.length} account{unmappedInvestmentAccounts.length !== 1 && 's'} not yet mapped
          </FieldHint>
        )}
      </div>
    </Section>
  )
}
