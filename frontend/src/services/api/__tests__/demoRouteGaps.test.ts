import { describe, expect, it, vi } from 'vitest'

/**
 * Guards the four demo-mode holes that showed a first-time visitor a broken
 * page. Every one of them was a MISSING or MISMATCHED entry in the ordered
 * DEMO_ROUTES table in `client.ts`, which ends in catch-alls -- so the failure
 * mode is always a wrong SHAPE served silently, never an error:
 *
 *  1. `/calculations/income-analysis` had no route, so Income Analysis read the
 *     `[]` catch-all and rendered zeros end to end.
 *  2. `/api/ai/usage` had no route, so the app-mode panel printed the literal
 *     text "NaN / 10 left" and the BYOK token panel threw on `usage.today`.
 *  3. `/calculations/category-monthly-history` tested `Array.isArray(months)`,
 *     but the caller sends `months.join(',')` -- a string -- so every demo
 *     sparkline and "/mo avg" figure was empty.
 *  4. `/transactions/export` had no route, so `exportToCSV()` resolved an array,
 *     `URL.createObjectURL` threw, and the user got "Export failed".
 *
 * The resolvers are typed `unknown`, so none of this was visible to tsc.
 */

vi.mock('@/store/demoStore', () => ({ isDemoMode: () => true }))

const { ROLLING_AVG_MONTHS } = await import('@/lib/chartUtils')
const { getDemoTransactions } = await import('@/lib/demo/seedDemoCache')
const { DEMO_EXPORT_COLUMNS } = await import('@/lib/demo/demoExport')
const { aiUsageService } = await import('../aiUsage')
const { apiClient } = await import('../client')

/** Drive a GET through the real demo interceptor and hand back the payload. */
async function demoGet(url: string, params?: Record<string, unknown>): Promise<unknown> {
  const response = await apiClient.get(url, { params })
  return response.data
}

type MonthlyDatum = { month: string; income: number; income_avg_3m: number | null }

describe('demo income-analysis route', () => {
  it('serves the full IncomeAnalysisData shape instead of the empty catch-all', async () => {
    const payload = (await demoGet('/api/calculations/income-analysis')) as Record<string, unknown>

    expect(Array.isArray(payload)).toBe(false)
    expect(typeof payload.total_income).toBe('number')
    expect(payload.total_income as number).toBeGreaterThan(0)
    expect(typeof payload.cashbacks_total).toBe('number')
    expect(typeof payload.peak_income).toBe('number')
    expect(typeof payload.growth_rate).toBe('number')
    expect(Array.isArray(payload.monthly_data)).toBe(true)
    // The donut needs at least one slice, otherwise the page reads as empty.
    expect(Object.keys(payload.category_breakdown as Record<string, number>).length).toBeGreaterThan(
      0,
    )
  })

  it('withholds income_avg_3m on the leading months, matching the backend', async () => {
    const { monthly_data: months } = (await demoGet('/api/calculations/income-analysis')) as {
      monthly_data: MonthlyDatum[]
    }

    expect(months.length).toBeGreaterThan(ROLLING_AVG_MONTHS)
    // Oldest-first, like the endpoint's sorted month keys.
    expect(months.map((m) => m.month).toSorted()).toEqual(months.map((m) => m.month))

    for (const leading of months.slice(0, ROLLING_AVG_MONTHS - 1)) {
      expect(
        leading.income_avg_3m,
        `${leading.month} has no full ${ROLLING_AVG_MONTHS}-month window behind it, so the average must abstain`,
      ).toBeNull()
    }

    for (let i = ROLLING_AVG_MONTHS - 1; i < months.length; i++) {
      const window = months.slice(i + 1 - ROLLING_AVG_MONTHS, i + 1)
      const expected =
        window.reduce((sum, m) => sum + m.income, 0) / ROLLING_AVG_MONTHS
      expect(months[i].income_avg_3m, `${months[i].month} rolling average`).toBeCloseTo(expected, 6)
    }
  })

  it('abstains on every point when the window is shorter than the rolling period', async () => {
    // Two calendar months of the demo ledger: no month can carry a full window.
    const all = (await demoGet('/api/calculations/income-analysis')) as {
      monthly_data: MonthlyDatum[]
    }
    const [firstMonth, secondMonth] = all.monthly_data.map((m) => m.month)

    const { monthly_data: months } = (await demoGet('/api/calculations/income-analysis', {
      start_date: `${firstMonth}-01`,
      end_date: `${secondMonth}-28`,
    })) as { monthly_data: MonthlyDatum[] }

    expect(months).toHaveLength(2)
    expect(months.map((m) => m.income_avg_3m)).toEqual([null, null])
  })

  it('honours the cashback classification list the page forwards', async () => {
    const unclassified = (await demoGet('/api/calculations/income-analysis')) as {
      cashbacks_total: number
      category_breakdown: Record<string, number>
    }
    // No list sent -> nothing matches, exactly like the endpoint (which owns no
    // preference fallback of its own).
    expect(unclassified.cashbacks_total).toBe(0)

    const classified = (await demoGet('/api/calculations/income-analysis', {
      cashback_categories: [
        'Refund & Cashbacks::Credit Card Cashbacks',
        'Refund & Cashbacks::Other Cashbacks',
        'Refund & Cashbacks::Product Refunds',
      ],
    })) as { cashbacks_total: number; category_breakdown: Record<string, number> }

    expect(classified.cashbacks_total).toBeGreaterThan(0)
    // Every matched row is an income row in that category, so the total can
    // never exceed the category's own breakdown figure.
    expect(classified.cashbacks_total).toBeLessThanOrEqual(
      classified.category_breakdown['Refund & Cashbacks'],
    )
  })
})

describe('demo ai/usage route', () => {
  it('serves the today / MTD / all-time rollups plus limits', async () => {
    const usage = (await demoGet('/api/ai/usage')) as Record<string, unknown>

    expect(Array.isArray(usage)).toBe(false)
    expect(usage.mode).toBe('app_bedrock')
    for (const key of ['today', 'month_to_date', 'all_time']) {
      const rollup = usage[key] as Record<string, number>
      expect(rollup, `${key} rollup must be an object`).toBeTypeOf('object')
      for (const field of ['input_tokens', 'output_tokens', 'total_tokens', 'cost_usd', 'call_count'])
        expect(typeof rollup[field], `${key}.${field}`).toBe('number')
      expect(rollup.total_tokens).toBe(rollup.input_tokens + rollup.output_tokens)
    }
    for (const stamp of ['as_of', 'day_start', 'month_start', 'next_reset_utc']) {
      expect(Number.isNaN(Date.parse(usage[stamp] as string)), `${stamp} must parse`).toBe(false)
    }
  })

  it('never lets the app-mode badge compute NaN', async () => {
    // Through the SERVICE, not the raw route: `aiUsageService.get()` back-fills
    // `limits` from its defaults, so a missing route still yields a readable
    // `limits.app_daily_messages` while every sibling field stays undefined.
    // That partial payload is precisely what rendered "NaN / 10 left".
    const usage = await aiUsageService.get()

    // This is the exact arithmetic in ChatPanel's UsageBadge / AppMessageBadge.
    // `Math.max(cap - undefined, 0)` is NaN -- Math.max does not clamp it --
    // which is how the literal string "NaN / 10 left" reached the screen.
    const remaining = Math.max(usage.limits.app_daily_messages - usage.messages_today, 0)
    expect(Number.isFinite(remaining)).toBe(true)
    expect(remaining).toBeGreaterThanOrEqual(0)
    expect(usage.limits.app_daily_messages).toBeGreaterThan(0)
    // BYOK caps read as "unset", not missing -- the panel branches on `null`.
    expect(usage.limits.daily).toBeNull()
    expect(usage.limits.monthly).toBeNull()
    // TokenLimitsPanel reads `usage.today.total_tokens` and
    // `usage.all_time.cost_usd` with no optional chaining, so a missing rollup
    // is a thrown render, not a bad number.
    expect(typeof usage.today.total_tokens).toBe('number')
    expect(typeof usage.month_to_date.total_tokens).toBe('number')
    expect(typeof usage.all_time.cost_usd).toBe('number')
  })
})

describe('demo category-monthly-history route', () => {
  it('parses the comma-joined months string the caller actually sends', async () => {
    const { max_date: maxDate } = (await demoGet('/api/calculations/data-date-range')) as {
      max_date: string
    }
    // Trailing three calendar months ending at the ledger's newest row, built
    // the same way `useCategoryMonthlyHistory`'s caller builds them.
    const anchor = new Date(`${maxDate.slice(0, 7)}-01T00:00:00`)
    const months = [2, 1, 0].map((back) => {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - back, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })

    const history = (await demoGet('/api/calculations/category-monthly-history', {
      // Identical to `calculations.getCategoryMonthlyHistory`: a STRING.
      months: months.join(','),
      transaction_type: 'expense',
    })) as Record<string, number[]>

    const categories = Object.keys(history)
    expect(
      categories.length,
      'no categories means every sparkline and /mo avg on Category Breakdown is empty',
    ).toBeGreaterThan(0)
    for (const category of categories) {
      expect(history[category], `${category} series length`).toHaveLength(months.length)
    }
    // At least one slot has real spend, otherwise the sparklines draw flat zero.
    expect(Object.values(history).flat().some((v) => v > 0)).toBe(true)
  })
})

describe('demo transactions/export route', () => {
  it('answers a text/csv Blob carrying the backend column set', async () => {
    const blob = (await demoGet('/api/transactions/export')) as Blob

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('text/csv')
    const text = await blob.text()
    const [header, ...rows] = text.trimEnd().split('\r\n')
    expect(header).toBe(DEMO_EXPORT_COLUMNS.join(','))
    expect(rows).toHaveLength(getDemoTransactions().length)
  })

  it('resolves ahead of the generic /transactions route despite matching it too', async () => {
    // ORDER, not just presence: '/api/transactions/export' contains
    // '/transactions', so if the export entry sits BELOW the generic one the
    // generic handler wins and answers a plain array of rows.
    const exported = await demoGet('/api/transactions/export')
    const generic = await demoGet('/api/transactions')

    expect(Array.isArray(generic), 'the generic route is the array-shaped one').toBe(true)
    expect(
      Array.isArray(exported),
      'export fell through to the generic /transactions handler -- check DEMO_ROUTES ordering',
    ).toBe(false)
    expect(exported).toBeInstanceOf(Blob)
  })

  it('applies the page filters, so the CSV matches the table it came from', async () => {
    const blob = (await demoGet('/api/transactions/export', { type: 'Income' })) as Blob
    const rows = (await blob.text()).trimEnd().split('\r\n').slice(1)

    const typeColumn = DEMO_EXPORT_COLUMNS.indexOf('type')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(getDemoTransactions().length)
    for (const row of rows) {
      expect(row.split(',')[typeColumn]).toBe('Income')
    }
  })

  it('leaves no export column blank where the real endpoint always has a value', async () => {
    const blob = (await demoGet('/api/transactions/export')) as Blob
    const rows = (await blob.text()).trimEnd().split('\r\n').slice(1)

    for (const column of ['id', 'date', 'amount', 'currency', 'type', 'source_file', 'last_seen_at']) {
      const index = DEMO_EXPORT_COLUMNS.indexOf(column as (typeof DEMO_EXPORT_COLUMNS)[number])
      const blanks = rows.filter((row) => row.split(',')[index] === '')
      expect(blanks, `${column} is empty on ${blanks.length} demo rows`).toEqual([])
    }
  })

  it('writes the tags column as parseable JSON on every row, tagged or not', async () => {
    // The backend emits `json.dumps(tags)`, so "[]" on an untagged row rather
    // than an empty cell -- a reader can json.loads every row unconditionally.
    // Trailing column, so the last field of each row is the whole cell even
    // when a multi-tag array carries a comma inside its quotes.
    const blob = (await demoGet('/api/transactions/export')) as Blob
    const rows = (await blob.text()).trimEnd().split('\r\n').slice(1)

    expect(DEMO_EXPORT_COLUMNS.at(-1)).toBe('tags')
    const parsed = rows.map((row) => {
      const cell = row.slice(row.lastIndexOf(',') + 1)
      // csv.writer quotes any field holding a comma or a quote and doubles the
      // embedded quotes; undo exactly that before parsing.
      const unquoted = cell.startsWith('"') ? cell.slice(1, -1).replaceAll('""', '"') : cell
      return JSON.parse(unquoted) as unknown
    })

    expect(parsed.every((tags) => Array.isArray(tags))).toBe(true)
    expect(parsed.some((tags) => (tags as string[]).length > 0)).toBe(true)
  })
})
