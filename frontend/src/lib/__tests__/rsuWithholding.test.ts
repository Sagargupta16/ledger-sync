import { describe, expect, it } from 'vitest'

import { projectFiscalYear } from '@/lib/projectionCalculator'
import { netVestingValue, valueRsuVestings, vestingPrice } from '@/lib/rsuVesting'
import { buildTdsSchedule } from '@/lib/tdsScheduleCalculator'
import { getStandardDeduction, getTaxSlabs } from '@/lib/taxCalculator'
import {
  DEFAULT_GROWTH_ASSUMPTIONS,
  DEFAULT_SALARY_COMPONENTS,
  type RsuGrant,
} from '@/types/salary'

const grant: RsuGrant = {
  id: 'rsu-tax-basis',
  stock_name: 'TEST',
  stock_price: 30_000,
  grant_date: null,
  notes: null,
  vestings: [{ date: '2025-08-15', quantity: 25, price_at_vest: 20_000 }],
}

const salary = {
  '2025-26': { ...DEFAULT_SALARY_COMPONENTS, base_salary_annual: 3_000_000, epf_monthly: 0 },
}

function project(grants: RsuGrant[]) {
  return projectFiscalYear('2025-26', salary, grants, DEFAULT_GROWTH_ASSUMPTIONS, 4)
}

function schedule(grants: RsuGrant[]) {
  return buildTdsSchedule({
    regularMonthlyIncome: 250_000,
    extraByMonth: {},
    rsuVestingEvents: valueRsuVestings(grants, { fyStartMonth: 4 }),
    fyStartYear: 2025,
    fyStartMonth: 4,
    isNewRegime: true,
    slabs: getTaxSlabs(2025, 'new'),
    standardDeduction: getStandardDeduction(2025),
  })
}

describe('RSU withholding and tax basis', () => {
  it.each([undefined, null, 0, 17.2, 17.200123, 25])(
    'keeps gross projections and TDS unchanged for actual received units %s',
    (netQuantity) => {
      const actualGrant: RsuGrant = {
        ...grant,
        vestings: [{ ...grant.vestings[0], net_quantity: netQuantity }],
      }
      const fiscal = valueRsuVestings([actualGrant], {
        fyStartMonth: 4, stockAppreciationPct: 10, baseStartYear: 2025, today: '2026-04-01',
      }).filter((event) => event.fy === '2025-26')

      expect(fiscal.reduce((sum, event) => sum + event.grossQuantity, 0)).toBe(25)
      expect(fiscal.reduce((sum, event) => sum + event.grossValue, 0)).toBe(500_000)
      const actualProjection = project([actualGrant])
      const baselineProjection = project([grant])
      expect(actualProjection.rsuIncome).toBe(baselineProjection.rsuIncome)
      expect(actualProjection.grossTaxable).toBe(baselineProjection.grossTaxable)
      expect(actualProjection.totalTax).toBe(baselineProjection.totalTax)
      expect(schedule([actualGrant]).map((row) => row.monthlyTds))
        .toEqual(schedule([grant]).map((row) => row.monthlyTds))
    },
  )

  it('subtracts tax once from gross compensation, not again from after-tax units', () => {
    const base = project([])
    const withRsu = project([grant])
    const rows = schedule([grant])
    const baselineRows = schedule([])
    const vesting = grant.vestings[0]

    // A 500,000 gross vest at a 30% marginal rate plus cess leaves 344,000.
    expect(netVestingValue(vesting, vestingPrice(grant, vesting, '2026-04-01'))).toBe(344_000)
    expect(withRsu.totalTax - base.totalTax).toBeCloseTo(156_000, 2)
    expect(withRsu.netCompensation - base.netCompensation).toBeCloseTo(344_000, 2)
    expect(withRsu.cashTakeHome).toBeCloseTo(base.cashTakeHome, 2)
    expect(rows[4].netCompensation - baselineRows[4].netCompensation).toBeCloseTo(344_000, 2)
    expect(rows[4].cashTakeHome).toBeCloseTo(baselineRows[4].cashTakeHome, 2)
    expect(rows[11].cumulativeTds - baselineRows[11].cumulativeTds).toBeCloseTo(156_000, 2)
  })
})
