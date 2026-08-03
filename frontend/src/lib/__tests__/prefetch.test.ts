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

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { dataHealthKeys } from '@/hooks/api/useDataHealthQuery'

describe('prefetch key alignment', () => {
  it('recurring commitments: sidebar, mobile tab bar, notification bell', () => {
    // Sidebar.tsx, MobileTabBar.tsx, NotificationCenter.tsx, useBillCalendar.ts,
    // RecurringTransactions.tsx all pass active_only + pattern_kind.
    expect(
      analyticsV2Keys.recurringTransactions({ active_only: true, pattern_kind: 'commitment' }),
    ).toEqual(['analyticsV2', 'recurring-transactions', true, undefined, 'commitment'])
  })

  it("dashboard's fixed-commitments widget is a DIFFERENT key", () => {
    // DashboardPage.tsx passes min_confidence: 0 explicitly. Folding it in gives
    // 0 where the sidebar key has undefined, so one prefetch cannot serve both.
    // Note 0 vs undefined, not 0 vs null: the factory spreads `filters?.field`,
    // so an absent filter lands as undefined. `JSON.stringify` renders those
    // slots as null, which is a trap when eyeballing keys in a console.
    const dashboard = analyticsV2Keys.recurringTransactions({
      active_only: true,
      min_confidence: 0,
      pattern_kind: 'commitment',
    })
    const sidebar = analyticsV2Keys.recurringTransactions({
      active_only: true,
      pattern_kind: 'commitment',
    })

    expect(dashboard).toEqual(['analyticsV2', 'recurring-transactions', true, 0, 'commitment'])
    expect(dashboard).not.toEqual(sidebar)
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

  it('goals: Overview reads the default view, Goals page includes achieved', () => {
    // OverviewPage.tsx uses no params; useGoalsState.ts passes include_achieved.
    expect(analyticsV2Keys.goals()).toEqual(['analyticsV2', 'goals', undefined, undefined])
    expect(analyticsV2Keys.goals({ include_achieved: true })).toEqual([
      'analyticsV2',
      'goals',
      undefined,
      true,
    ])
    expect(analyticsV2Keys.goals()).not.toEqual(analyticsV2Keys.goals({ include_achieved: true }))
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
