import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_GROWTH_ASSUMPTIONS, DEFAULT_SALARY_COMPONENTS } from '@/types/salary'

import SalaryStructureSection from '../../SalaryStructureSection'

afterEach(cleanup)

describe('salary growth choices', () => {
  it('keeps saved bonus behavior until a recurrence mode is explicitly selected', () => {
    const updateGrowth = vi.fn()
    render(
      <SalaryStructureSection
        index={0}
        localSalaryStructure={{ '2026-27': DEFAULT_SALARY_COMPONENTS }}
        updateSalaryStructure={vi.fn()}
        localRsuGrants={[]}
        updateRsuGrants={vi.fn()}
        localGrowthAssumptions={DEFAULT_GROWTH_ASSUMPTIONS}
        updateGrowthAssumptions={updateGrowth}
        defaultCollapsed={false}
      />,
    )

    const mode = screen.getByRole('combobox', { name: 'Bonus in Future Years' })
    expect(mode).toHaveValue('')
    expect(updateGrowth).not.toHaveBeenCalled()

    fireEvent.change(mode, { target: { value: 'recurring' } })
    expect(updateGrowth).toHaveBeenLastCalledWith({
      ...DEFAULT_GROWTH_ASSUMPTIONS, bonus_mode: 'recurring', bonus_growth_pct: 0,
    })

    fireEvent.change(mode, { target: { value: 'one_time' } })
    expect(updateGrowth).toHaveBeenLastCalledWith({
      ...DEFAULT_GROWTH_ASSUMPTIONS, bonus_mode: 'one_time', bonus_growth_pct: 0,
    })
  })
})
