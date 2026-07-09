/**
 * Salary Structure section -- FY salary grid, RSU grants, and growth assumptions.
 */

import { useCallback, useMemo, useState } from 'react'

import { Banknote } from 'lucide-react'

import { selectDisplayCurrency, usePreferencesStore } from '@/store/preferencesStore'
import type { GrowthAssumptions, RsuGrant, SalaryComponents } from '@/types/salary'
import { DEFAULT_SALARY_COMPONENTS } from '@/types/salary'

import { Section } from '../sectionPrimitives'
import { GrowthAssumptionsForm } from './salary/GrowthAssumptionsForm'
import { RsuGrants } from './salary/RsuGrants'
import { SalaryFieldsGrid } from './salary/SalaryFieldsGrid'
import { currentFYLabel, nextFY, parseBareStartYear } from './salary/fyHelpers'
import { useRsuGrants } from './salary/useRsuGrants'

export interface SalaryStructureSectionProps {
  index: number
  localSalaryStructure: Record<string, SalaryComponents>
  updateSalaryStructure: (structure: Record<string, SalaryComponents>) => void
  localRsuGrants: RsuGrant[]
  updateRsuGrants: (grants: RsuGrant[]) => void
  localGrowthAssumptions: GrowthAssumptions
  updateGrowthAssumptions: (assumptions: GrowthAssumptions) => void
  defaultCollapsed?: boolean
}

export default function SalaryStructureSection({
  index,
  localSalaryStructure,
  updateSalaryStructure,
  localRsuGrants,
  updateRsuGrants,
  localGrowthAssumptions,
  updateGrowthAssumptions,
  defaultCollapsed = true,
}: Readonly<SalaryStructureSectionProps>) {
  const fyKeys = useMemo(
    () =>
      Object.keys(localSalaryStructure).sort(
        (a, b) => parseBareStartYear(a) - parseBareStartYear(b),
      ),
    [localSalaryStructure],
  )
  const [selectedFY, setSelectedFY] = useState(() => {
    const cur = currentFYLabel()
    return fyKeys.includes(cur) ? cur : fyKeys[0] ?? cur
  })

  const currentSalary = useMemo<SalaryComponents>(
    () => localSalaryStructure[selectedFY] ?? { ...DEFAULT_SALARY_COMPONENTS },
    [localSalaryStructure, selectedFY],
  )

  const updateField = useCallback(
    (field: keyof SalaryComponents, raw: string) => {
      const value = raw === '' ? 0 : Number(raw)
      if (Number.isNaN(value)) return
      const updated = { ...localSalaryStructure }
      const isNullableField = field === 'hra_annual' || field === 'nps_monthly'
      const fieldValue = isNullableField && raw === '' ? null : value
      updated[selectedFY] = {
        ...(updated[selectedFY] ?? { ...DEFAULT_SALARY_COMPONENTS }),
        [field]: fieldValue,
      }
      updateSalaryStructure(updated)
    },
    [localSalaryStructure, selectedFY, updateSalaryStructure],
  )

  const addFY = useCallback(() => {
    const next = fyKeys.length > 0 ? nextFY(fyKeys[fyKeys.length - 1]) : currentFYLabel()
    if (localSalaryStructure[next]) return
    const lastSalary =
      fyKeys.length > 0 ? localSalaryStructure[fyKeys[fyKeys.length - 1]] : undefined
    updateSalaryStructure({
      ...localSalaryStructure,
      [next]: lastSalary ? { ...lastSalary } : { ...DEFAULT_SALARY_COMPONENTS },
    })
    setSelectedFY(next)
  }, [fyKeys, localSalaryStructure, updateSalaryStructure])

  const goNext = useCallback(() => {
    const idx = fyKeys.indexOf(selectedFY)
    if (idx < fyKeys.length - 1) setSelectedFY(fyKeys[idx + 1])
  }, [fyKeys, selectedFY])

  const goPrev = useCallback(() => {
    const idx = fyKeys.indexOf(selectedFY)
    if (idx > 0) setSelectedFY(fyKeys[idx - 1])
  }, [fyKeys, selectedFY])

  const annualCTC = useMemo(() => {
    const s = currentSalary
    const base = Number(s.base_salary_annual) || 0
    const hra = Number(s.hra_annual) || 0
    const epf = (Number(s.epf_monthly) || 0) * 12
    const nps = (Number(s.nps_monthly) || 0) * 12
    return (
      base +
      hra +
      (Number(s.bonus_annual) || 0) +
      epf +
      nps +
      (Number(s.special_allowance_annual) || 0) +
      (Number(s.other_taxable_annual) || 0)
    )
  }, [currentSalary])

  const displayCurrency = usePreferencesStore(selectDisplayCurrency)
  const {
    fetchingPriceFor,
    addGrant,
    removeGrant,
    updateGrant,
    addVesting,
    updateVesting,
    removeVesting,
    sortGrantVestings,
    fetchStockPrice,
  } = useRsuGrants(localRsuGrants, updateRsuGrants, displayCurrency)

  const updateGrowth = useCallback(
    (field: keyof GrowthAssumptions, raw: string | boolean) => {
      let value: number | boolean
      if (typeof raw === 'boolean') {
        value = raw
      } else {
        value = raw === '' ? 0 : Number(raw)
        if (Number.isNaN(value)) return
      }
      updateGrowthAssumptions({ ...localGrowthAssumptions, [field]: value })
    },
    [localGrowthAssumptions, updateGrowthAssumptions],
  )

  const fyIdx = fyKeys.indexOf(selectedFY)

  return (
    <Section
      index={index}
      icon={Banknote}
      title="Income & Salary Structure"
      description="Salary breakdown, RSU grants, and growth projections"
      defaultCollapsed={defaultCollapsed}
    >
      <SalaryFieldsGrid
        fyKeys={fyKeys}
        selectedFY={selectedFY}
        fyIdx={fyIdx}
        currentSalary={currentSalary}
        annualCTC={annualCTC}
        onPrev={goPrev}
        onNext={goNext}
        onAddFY={addFY}
        onUpdateField={updateField}
      />

      <div className="border-t border-border" />

      <RsuGrants
        grants={localRsuGrants}
        fetchingPriceFor={fetchingPriceFor}
        onAddGrant={addGrant}
        onRemoveGrant={removeGrant}
        onUpdateGrant={updateGrant}
        onAddVesting={addVesting}
        onUpdateVesting={updateVesting}
        onRemoveVesting={removeVesting}
        onSortVestings={sortGrantVestings}
        onFetchStockPrice={fetchStockPrice}
      />

      <div className="border-t border-border" />

      <GrowthAssumptionsForm growth={localGrowthAssumptions} onUpdate={updateGrowth} />
    </Section>
  )
}
