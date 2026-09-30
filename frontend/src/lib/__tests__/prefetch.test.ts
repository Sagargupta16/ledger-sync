/**
 * Guards that every prefetched query key matches the key its consumer reads.
 *
 * `staleTime` is Infinity and every `analyticsV2Keys` factory folds its filter
 * values into the key, so a prefetch whose params differ from the call site by
 * one field warms a cache slot nothing ever reads: the round-trip is paid for
 * AND the page still shows a spinner. That failure is invisible at runtime --
 * the app works, just slowly -- which is exactly the kind of regression a test
 * has to catch.
 *
 * The pairs below are the call-site params, transcribed from each consumer. If a
 * consumer changes its filters, the matching `prefetch.ts` entry has to change
 * too, and this test fails until it does.
 */

import { describe, expect, it } from 'vitest'

import { RECURRING_COMMITMENTS_PARAMS } from '@/hooks/api/recurringCommitmentsParams'
import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { dataHealthKeys } from '@/hooks/api/useDataHealthQuery'

describe('prefetch key alignment', () => {
  it('recurring commitments: dashboard, sidebar, notifications, bill calendar share one key', () => {
    // DashboardPage.tsx, Sidebar.tsx, NotificationCenter.tsx, useBillCalendar.ts
    // and prefetch.ts all pass RECURRING_COMMITMENTS_PARAMS (active_only +
    // min_confidence: 0 + pattern_kind), so one prefetch serves them.
    expect(RECURRING_COMMITMENTS_PARAMS).toEqual({
      active_only: true,
      min_confidence: 0,
      pattern_kind: 'commitment',
    })
    expect(
      analyticsV2Keys.recurringTransactions(RECURRING_COMMITMENTS_PARAMS),
    ).toEqual(['analyticsV2', 'recurring-transactions', true, 0, 'commitment'])
  })

  it('omitting min_confidence is a DIFFERENT key', () => {
    // The backend defaults min_confidence to 50, so an omitted value is both a
    // different key and a different (confidence-filtered) list. Note 0 vs
    // undefined, not 0 vs null: the factory spreads `filters?.field`, so an
    // absent filter lands as undefined. `JSON.stringify` renders those slots as
    // null, which is a trap when eyeballing keys in a console.
    const aligned = analyticsV2Keys.recurringTransactions({
      active_only: true,
      min_confidence: 0,
      pattern_kind: 'commitment',
    })
    const omitted = analyticsV2Keys.recurringTransactions({
      active_only: true,
      pattern_kind: 'commitment',
    })

    expect(omitted).toEqual(['analyticsV2', 'recurring-transactions', true, undefined, 'commitment'])
    expect(aligned).not.toEqual(omitted)
  })

  it('recurring page includes inactive rows', () => {
    // SubscriptionTrackerPage.tsx
    expect(
      analyticsV2Keys.recurringTransactions({ active_only: false, min_confidence: 0 }),
    ).toEqual(['analyticsV2', 'recurring-transactions', false, 0, undefined])
  })

  it('merchants: Merchants page and the dashboard card share one key', () => {
    // useMerchantIntel.ts and TopMerchants.tsx both use MIN_TRANSACTIONS=2,
    // ROW_LIMIT=200. If either constant moves, this fails.
    expect(analyticsV2Keys.merchantIntelligence({ min_transactions: 2, limit: 200 })).toEqual([
      'analyticsV2',
      'merchant-intelligence',
      2,
      undefined,
      200,
    ])
  })

  it('goals: Overview and the Goals page share one key', () => {
    // OverviewPage.tsx uses no params; useGoalsState.ts passes include_achieved:
    // true. The backend defaults include_achieved to true, so both requests
    // return the same rows and the factory folds the default into the key.
    expect(analyticsV2Keys.goals()).toEqual(['analyticsV2', 'goals', undefined, true])
    expect(analyticsV2Keys.goals({ include_achieved: true })).toEqual(analyticsV2Keys.goals())
    expect(analyticsV2Keys.goals({ include_achieved: false })).not.toEqual(analyticsV2Keys.goals())
  })

  it('data health is keyed with no params, so one prefetch serves every reader', () => {
    // StaleAnalyticsAlert.tsx (global layout) and the Data Health page.
    expect(dataHealthKeys.summary()).toEqual(['analyticsV2', 'data-health'])
  })

  it('an omitted filter really does change the key', () => {
    // The premise of this whole file: if folding were lossy, a mismatched
    // prefetch would still hit and none of the assertions above would matter.
    expect(analyticsV2Keys.netWorth({ limit: 100 })).not.toEqual(analyticsV2Keys.netWorth())
    expect(
      analyticsV2Keys.merchantIntelligence({ min_transactions: 2 }),
    ).not.toEqual(analyticsV2Keys.merchantIntelligence({ min_transactions: 2, limit: 200 }))
  })
})
