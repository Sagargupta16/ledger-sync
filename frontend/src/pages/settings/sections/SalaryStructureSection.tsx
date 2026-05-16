/**
 * Salary Structure section -- FY salary grid, RSU grants, and growth assumptions.
 */

import { useCallback, useMemo, useState } from 'react'

import { Banknote } from 'lucide-react'

import { preferencesService } from '@/services/api/preferences'
import { selectDisplayCurrency, usePreferencesStore } from '@/store/preferencesStore'
import type {
  GrowthAssumptions,
  RsuGrant,
  RsuVesting,
  SalaryComponents,
} from '@/types/salary'
import { DEFAULT_SALARY_COMPONENTS } from '@/types/salary'

import { Section } from '../sectionPrimitives'
import { GrowthAssumptionsForm } from './salary/GrowthAssumptionsForm'
import { RsuGrants } from './salary/RsuGrants'
import { SalaryFieldsGrid } from './salary/SalaryFieldsGrid'
import { currentFYLabel, nextFY, parseBareStartYear } from './salary/fyHelpers'

export interface SalaryStructureSectionProps {
  index: number
  localSalaryStructure: Record<string, SalaryComponents>
  updateSalaryStructure: (structure: Record<string, SalaryComponents>) => void
  localRsuGrants: RsuGrant[]
  updateRsuGrants: (grants: RsuGrant[]) => void
  localGrowthAssumptions: GrowthAssumptions
  updateGrowthAssumptions: (assumptions: GrowthAssumptions) => void
}

export default function SalaryStructureSection({
  index,
  localSalaryStructure,
  updateSalaryStructure,
  localRsuGrants,
  updateRsuGrants,
  localGrowthAssumptions,
  updateGrowthAssumptions,
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

  const addGrant = useCallback(() => {
    const grant: RsuGrant = {
      id: crypto.randomUUID(),
      stock_name: '',
      stock_price: 0,
      grant_date: null,
      notes: null,
      vestings: [],
    }
    updateRsuGrants([...localRsuGrants, grant])
  }, [localRsuGrants, updateRsuGrants])

  const removeGrant = useCallback(
    (id: string) => updateRsuGrants(localRsuGrants.filter((g) => g.id !== id)),
    [localRsuGrants, updateRsuGrants],
  )

  const updateGrant = useCallback(
    (id: string, patch: Partial<RsuGrant>) => {
      updateRsuGrants(localRsuGrants.map((g) => (g.id === id ? { ...g, ...patch } : g)))
    },
    [localRsuGrants, updateRsuGrants],
  )

  const addVesting = useCallback(
    (grantId: string) => {
      updateGrant(grantId, {
        vestings: [
          ...(localRsuGrants.find((g) => g.id === grantId)?.vestings ?? []),
          { date: '', quantity: 0 },
        ],
      })
    },
    [localRsuGrants, updateGrant],
  )

  const updateVesting = useCallback(
    (grantId: string, vestIdx: number, patch: Partial<RsuVesting>) => {
      const grant = localRsuGrants.find((g) => g.id === grantId)
      if (!grant) return
      const vestings = grant.vestings.map((v, i) => (i === vestIdx ? { ...v, ...patch } : v))
      updateGrant(grantId, { vestings })
    },
    [localRsuGrants, updateGrant],
  )

  const removeVesting = useCallback(
    (grantId: string, vestIdx: number) => {
      const grant = localRsuGrants.find((g) => g.id === grantId)
      if (!grant) return
      updateGrant(grantId, { vestings: grant.vestings.filter((_, i) => i !== vestIdx) })
    },
    [localRsuGrants, updateGrant],
  )

  const [fetchingPriceFor, setFetchingPriceFor] = useState<string | null>(null)
  const displayCurrency = usePreferencesStore(selectDisplayCurrency)

  const fetchStockPrice = useCallback(
    async (grant: RsuGrant) => {
      if (!grant.stock_name.trim()) return
      setFetchingPriceFor(grant.id)
      try {
        const result = await preferencesService.getStockPrice(grant.stock_name.trim())
        let price = result.price

        if (result.currency && result.currency !== displayCurrency) {
          const rates = await preferencesService.getExchangeRates(result.currency)
          const rate = rates.rates[displayCurrency]
          if (rate) {
            price = Math.round(price * rate * 100) / 100
          }
        }

        updateGrant(grant.id, { stock_price: price })
      } catch {
        /* user can still enter manually */
      } finally {
        setFetchingPriceFor(null)
      }
    },
    [updateGrant, displayCurrency],
  )

  const rsuTotals = useMemo(() => {
    let shares = 0
    let value = 0
    for (const g of localRsuGrants) {
      for (const v of g.vestings) {
        shares += v.quantity
        value += v.quantity * g.stock_price
      }
    }
    return { shares, value }
  }, [localRsuGrants])

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
        rsuTotals={rsuTotals}
        onAddGrant={addGrant}
        onRemoveGrant={removeGrant}
        onUpdateGrant={updateGrant}
        onAddVesting={addVesting}
        onUpdateVesting={updateVesting}
        onRemoveVesting={removeVesting}
        onFetchStockPrice={fetchStockPrice}
      />

      <div className="border-t border-border" />

      <GrowthAssumptionsForm growth={localGrowthAssumptions} onUpdate={updateGrowth} />
    </Section>
  )
}
