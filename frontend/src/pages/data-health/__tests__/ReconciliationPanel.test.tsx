import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ReconciliationSummary } from '@/services/api/analyticsV2DataHealth'

import ReconciliationPanel from '../components/ReconciliationPanel'

const BASE: ReconciliationSummary = {
  state: 'reconciled',
  accounts_matched: 3,
  accounts_mismatched: 0,
  accounts_changed: 1,
  alerts_missing: 0,
  score_pct: 100,
}

describe('ReconciliationPanel', () => {
  it('says the ledger agrees and shows the score', () => {
    render(<ReconciliationPanel reconciliation={BASE} />)

    expect(screen.getByText('Ledger agrees with the bank')).toBeInTheDocument()
    expect(screen.getByText('100% of checked accounts match')).toBeInTheDocument()
  })

  it('tells the user what to do when attention is needed', () => {
    render(
      <ReconciliationPanel
        reconciliation={{
          ...BASE,
          state: 'attention',
          accounts_mismatched: 1,
          alerts_missing: 2,
          score_pct: 75,
        }}
      />,
    )

    expect(screen.getByText('Ledger needs attention')).toBeInTheDocument()
    expect(screen.getByText(/Record a fresh balance check/)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('omits the score when nothing has been checked', () => {
    render(
      <ReconciliationPanel
        reconciliation={{ ...BASE, state: 'unchecked', accounts_matched: 0, score_pct: null }}
      />,
    )

    expect(screen.getByText('Not checked yet')).toBeInTheDocument()
    expect(screen.queryByText(/of checked accounts match/)).not.toBeInTheDocument()
  })
})
