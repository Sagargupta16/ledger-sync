/**
 * Advanced section - anomaly detection, recurring transactions,
 * credit card limits, excluded accounts.
 */

import { Shield } from 'lucide-react'
import { useClosedAccounts } from '@/hooks/api/useAccountStatus'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { Section } from '../sectionPrimitives'
import AnomalyDetectionSubsection from './AnomalyDetectionSubsection'
import ClosedAccountsSubsection from './ClosedAccountsSubsection'
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
  // A closed credit card has no limit to configure.
  const { data: closedAccounts = [] } = useClosedAccounts()
  const openCreditCards = creditCardAccounts.filter((card) => !closedAccounts.includes(card))

  return (
    <Section
      index={index}
      icon={Shield}
      title="Advanced"
      description="Anomaly detection, credit card limits, closed and excluded accounts"
    >
      <AnomalyDetectionSubsection localPrefs={localPrefs} updateLocalPref={updateLocalPref} />

      <CreditCardLimitsSubsection
        localPrefs={localPrefs}
        creditCardAccounts={openCreditCards}
        updateLocalPref={updateLocalPref}
      />

      <ClosedAccountsSubsection accounts={accounts} />

      <ExcludedAccountsSubsection
        accounts={accounts}
        excludedAccounts={excludedAccounts}
        updateLocalPref={updateLocalPref}
      />
    </Section>
  )
}
