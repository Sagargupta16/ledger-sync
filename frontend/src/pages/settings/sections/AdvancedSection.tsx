/**
 * Advanced section - anomaly detection, recurring transactions,
 * credit card limits, excluded accounts.
 */

import { Shield } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { Section } from '../sectionPrimitives'
import AnomalyDetectionSubsection from './AnomalyDetectionSubsection'
import CreditCardLimitsSubsection from './CreditCardLimitsSubsection'
import ExcludedAccountsSubsection from './ExcludedAccountsSubsection'

interface Props {
  index: number
  localPrefs: LocalPrefs
  accounts: string[]
  creditCardAccounts: string[]
  excludedAccounts: string[]
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function AdvancedSection({
  index,
  localPrefs,
  accounts,
  creditCardAccounts,
  excludedAccounts,
  updateLocalPref,
}: Readonly<Props>) {
  return (
    <Section
      index={index}
      icon={Shield}
      title="Advanced"
      description="Anomaly detection, credit card limits, excluded accounts"
      defaultCollapsed={true}
    >
      <AnomalyDetectionSubsection localPrefs={localPrefs} updateLocalPref={updateLocalPref} />

      <CreditCardLimitsSubsection
        localPrefs={localPrefs}
        creditCardAccounts={creditCardAccounts}
        updateLocalPref={updateLocalPref}
      />

      <ExcludedAccountsSubsection
        accounts={accounts}
        excludedAccounts={excludedAccounts}
        updateLocalPref={updateLocalPref}
      />
    </Section>
  )
}
