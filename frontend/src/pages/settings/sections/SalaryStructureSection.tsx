/**
 * Salary Structure section - FY salary grid, RSU grants, and growth assumptions.
 */

import { useState, useMemo, useCallback } from 'react'
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import { preferencesService } from '@/services/api/preferences'
import { usePreferencesStore, selectDisplayCurrency } from '@/store/preferencesStore'
import { formatCurrency } from '@/lib/formatters'
import { FY_START_MONTH } from '@/lib/taxCalculator'
import type { SalaryComponents, RsuGrant, RsuVesting, GrowthAssumptions } from '@/types/salary'
import { DEFAULT_SALARY_COMPONENTS } from '@/types/salary'
import { Section, FieldLabel, Toggle } from '../sectionPrimitives'
import { inputClass } from '../styles'

export interface SalaryStructureSectionProps {
  index: number
  localSalaryStructure: Record<string, SalaryComponents>
  updateSalaryStructure: (structure: Record<string, SalaryComponents>) => void
  localRsuGrants: RsuGrant[]
  updateRsuGrants: (grants: RsuGrant[]) => void
  localGrowthAssumptions: GrowthAssumptions
  updateGrowthAssumptions: (assumptions: GrowthAssumptions) => void
}

// ---------------------------------------------------------------------------
// FY helpers (bare "2025-26" format, not "FY 2025-26")
// ---------------------------------------------------------------------------

/** Parse start year from bare FY label like "2025-26" */
function parseBareStartYear(fy: string): number {
  return Number.parseInt(fy.split('-')[0] || '0', 10)
}

function currentFYLabel(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const startYear = month >= FY_START_MONTH ? year : year - 1
  const endYear = (startYear + 1) % 100
  return `${startYear}-${String(endYear).padStart(2, '0')}`
}

function nextFY(fy: string): string {
  const start = parseBareStartYear(fy) + 1
  const end = (start + 1) % 100
  return `${start}-${String(end).padStart(2, '0')}`
}

/** Get FY string from a date string given fiscal year start month */
function dateToFY(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  const fyStartYear = month >= FY_START_MONTH ? year : year - 1
  const endYear = (fyStartYear + 1) % 100
  return `${fyStartYear}-${String(endYear).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SalaryStructureSection({
  index,
  localSalaryStructure,
  updateSalaryStructure,
  localRsuGrants,
  updateRsuGrants,
  localGrowthAssumptions,
  updateGrowthAssumptions,
}: Readonly<SalaryStructureSectionProps>) {
  // -- FY selector state --
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

  // -- Salary field updater --
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

  // -- Add FY --
  const addFY = useCallback(() => {
    const next = fyKeys.length > 0 ? nextFY(fyKeys[fyKeys.length - 1]) : currentFYLabel()
    if (localSalaryStructure[next]) return
    const lastSalary = fyKeys.length > 0
      ? localSalaryStructure[fyKeys[fyKeys.length - 1]]
      : undefined
    updateSalaryStructure({
      ...localSalaryStructure,
      [next]: lastSalary ? { ...lastSalary } : { ...DEFAULT_SALARY_COMPONENTS },
    })
    setSelectedFY(next)
  }, [fyKeys, localSalaryStructure, updateSalaryStructure])

  // -- Navigate FY --
  const goNext = useCallback(() => {
    const idx = fyKeys.indexOf(selectedFY)
    if (idx < fyKeys.length - 1) setSelectedFY(fyKeys[idx + 1])
  }, [fyKeys, selectedFY])

  const goPrev = useCallback(() => {
    const idx = fyKeys.indexOf(selectedFY)
    if (idx > 0) setSelectedFY(fyKeys[idx - 1])
  }, [fyKeys, selectedFY])

  // -- Live summary --
  const annualCTC = useMemo(() => {
    const s = currentSalary
    const base = Number(s.base_salary_annual) || 0
    const hra = Number(s.hra_annual) || 0
    const epf = (Number(s.epf_monthly) || 0) * 12
    const nps = (Number(s.nps_monthly) || 0) * 12
    return base + hra + (Number(s.bonus_annual) || 0) + epf + nps +
      (Number(s.special_allowance_annual) || 0) + (Number(s.other_taxable_annual) || 0)
  }, [currentSalary])

  // -- RSU helpers --
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
      updateRsuGrants(
        localRsuGrants.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      )
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
      const vestings = grant.vestings.map((v, i) =>
        i === vestIdx ? { ...v, ...patch } : v,
      )
      updateGrant(grantId, { vestings })
    },
    [localRsuGrants, updateGrant],
  )

  const removeVesting = useCallback(
    (grantId: string, vestIdx: number) => {
      const grant = localRsuGrants.find((g) => g.id === grantId)
      if (!grant) return
      updateGrant(grantId, {
        vestings: grant.vestings.filter((_, i) => i !== vestIdx),
      })
    },
    [localRsuGrants, updateGrant],
  )

  // -- Fetch live stock price --
  const [fetchingPriceFor, setFetchingPriceFor] = useState<string | null>(null)
  const displayCurrency = usePreferencesStore(selectDisplayCurrency)

  const fetchStockPrice = useCallback(async (grant: RsuGrant) => {
    if (!grant.stock_name.trim()) return
    setFetchingPriceFor(grant.id)
    try {
      const result = await preferencesService.getStockPrice(grant.stock_name.trim())
      let price = result.price

      // Convert from stock currency (usually USD) to display currency
      if (result.currency && result.currency !== displayCurrency) {
        const rates = await preferencesService.getExchangeRates(result.currency)
        const rate = rates.rates[displayCurrency]
        if (rate) {
          price = Math.round(price * rate * 100) / 100
        }
      }

      updateGrant(grant.id, { stock_price: price })
    } catch {
      // Silently fail — user can still enter manually
    } finally {
      setFetchingPriceFor(null)
    }
  }, [updateGrant, displayCurrency])

  // RSU totals
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

  // -- Growth helpers --
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

  // -- Salary field definitions --
  const salaryFields: Array<{
    key: keyof SalaryComponents
    label: string
    hint: string
    nullable: boolean
  }> = [
    { key: 'base_salary_annual', label: 'Base Salary', hint: 'Annual', nullable: false },
    { key: 'hra_annual', label: 'HRA', hint: 'Annual, optional', nullable: true },
    { key: 'bonus_annual', label: 'Bonus', hint: 'Annual', nullable: false },
    { key: 'epf_monthly', label: 'EPF', hint: 'Monthly', nullable: false },
    { key: 'nps_monthly', label: 'NPS', hint: 'Monthly, optional', nullable: true },
    { key: 'special_allowance_annual', label: 'Special Allowance', hint: 'Annual', nullable: false },
    { key: 'other_taxable_annual', label: 'Other Taxable', hint: 'Annual', nullable: false },
  ]

  const fyIdx = fyKeys.indexOf(selectedFY)

  return (
    <Section
      index={index}
      icon={Banknote}
      title="Income & Salary Structure"
      description="Salary breakdown, RSU grants, and growth projections"
    >
      {/* ── A. Salary Structure (per FY) ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Salary Structure</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={fyIdx <= 0}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <span className="text-sm font-medium text-white min-w-[80px] text-center">
              {fyKeys.length > 0 ? `FY ${selectedFY}` : 'No FY'}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={fyIdx >= fyKeys.length - 1}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
            <button
              type="button"
              onClick={addFY}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add FY
            </button>
          </div>
        </div>

        {fyKeys.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {salaryFields.map((f) => (
                <div key={f.key}>
                  <FieldLabel htmlFor={`salary-${f.key}`}>
                    {f.label}{' '}
                    <span className="text-muted-foreground font-normal">({f.hint})</span>
                  </FieldLabel>
                  <input
                    id={`salary-${f.key}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="100"
                    value={currentSalary[f.key] || ''}
                    onChange={(e) => updateField(f.key, e.target.value)}
                    placeholder={f.nullable ? 'Optional' : '0'}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>

            {/* Live summary card */}
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Annual CTC (excl. RSUs)</p>
                <p className="text-lg font-semibold text-white">{formatCurrency(annualCTC)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Monthly (pre-tax)</p>
                <p className="text-lg font-semibold text-white">
                  {formatCurrency(annualCTC / 12)}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* ── B. RSU Grants ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">RSU Grants</h3>
          <button
            type="button"
            onClick={addGrant}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Grant
          </button>
        </div>

        {localRsuGrants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No RSU grants added yet. Click &quot;Add Grant&quot; to track stock-based compensation.
          </p>
        )}

        {localRsuGrants.map((grant) => (
          <div
            key={grant.id}
            className="rounded-xl bg-white/[0.03] border border-border p-4 space-y-3"
          >
            {/* Grant header */}
            <div className="flex items-start gap-3">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <FieldLabel htmlFor={`grant-stock-${grant.id}`}>Stock Name</FieldLabel>
                  <input
                    id={`grant-stock-${grant.id}`}
                    type="text"
                    value={grant.stock_name}
                    onChange={(e) => updateGrant(grant.id, { stock_name: e.target.value })}
                    placeholder="e.g. AAPL"
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={`grant-price-${grant.id}`}>Price / Share</FieldLabel>
                  <div className="flex gap-1.5">
                    <input
                      id={`grant-price-${grant.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={grant.stock_price || ''}
                      onChange={(e) =>
                        updateGrant(grant.id, {
                          stock_price: e.target.value === '' ? 0 : Number(e.target.value),
                        })
                      }
                      placeholder="0"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => fetchStockPrice(grant)}
                      disabled={!grant.stock_name.trim() || fetchingPriceFor === grant.id}
                      title={grant.stock_name.trim() ? `Fetch latest price for ${grant.stock_name}` : 'Enter stock name first'}
                      className="shrink-0 p-2 rounded-lg border border-border text-muted-foreground hover:text-white hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {fetchingPriceFor === grant.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor={`grant-notes-${grant.id}`}>Notes</FieldLabel>
                  <input
                    id={`grant-notes-${grant.id}`}
                    type="text"
                    value={grant.notes ?? ''}
                    onChange={(e) =>
                      updateGrant(grant.id, { notes: e.target.value || null })
                    }
                    placeholder="Optional"
                    className={inputClass}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeGrant(grant.id)}
                className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors mt-6"
                title="Delete grant"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Vesting table */}
            {grant.vestings.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left py-2 pr-3 font-medium">Date</th>
                      <th className="text-left py-2 pr-3 font-medium">Qty</th>
                      <th className="text-left py-2 pr-3 font-medium">Est. Value</th>
                      <th className="text-left py-2 pr-3 font-medium">FY</th>
                      <th className="py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {grant.vestings.map((v, vi) => {
                      const estValue = v.quantity * grant.stock_price
                      const fy = v.date ? dateToFY(v.date) : ''
                      return (
                        <tr key={`${grant.id}-${v.date}-${vi}`} className="border-b border-border/50">
                          <td className="py-2 pr-3">
                            <input
                              type="date"
                              value={v.date}
                              onChange={(e) =>
                                updateVesting(grant.id, vi, { date: e.target.value })
                              }
                              className={`${inputClass} max-w-[160px]`}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              value={v.quantity || ''}
                              onChange={(e) =>
                                updateVesting(grant.id, vi, {
                                  quantity: e.target.value === '' ? 0 : Number(e.target.value),
                                })
                              }
                              placeholder="0"
                              className={`${inputClass} max-w-[100px]`}
                            />
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {estValue > 0 ? formatCurrency(estValue) : '--'}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {fy ? `FY ${fy}` : '--'}
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => removeVesting(grant.id, vi)}
                              className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Remove vesting"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <button
              type="button"
              onClick={() => addVesting(grant.id)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Vesting Date
            </button>
          </div>
        ))}

        {/* RSU totals */}
        {localRsuGrants.length > 0 && rsuTotals.shares > 0 && (
          <div className="flex items-center gap-6 text-sm text-muted-foreground pt-1">
            <span>
              Total shares:{' '}
              <span className="text-white font-medium">{rsuTotals.shares.toLocaleString()}</span>
            </span>
            <span>
              Total value:{' '}
              <span className="text-white font-medium">{formatCurrency(rsuTotals.value)}</span>
            </span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* ── C. Growth Assumptions ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Growth Assumptions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <FieldLabel htmlFor="growth-base">Base Salary Growth (%/yr)</FieldLabel>
            <input
              id="growth-base"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.5"
              value={localGrowthAssumptions.base_salary_growth_pct || ''}
              onChange={(e) => updateGrowth('base_salary_growth_pct', e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="growth-stock">Stock Appreciation (%/yr)</FieldLabel>
            <input
              id="growth-stock"
              type="number"
              inputMode="decimal"
              min="-50"
              max="200"
              step="0.5"
              value={localGrowthAssumptions.stock_price_appreciation_pct || ''}
              onChange={(e) => updateGrowth('stock_price_appreciation_pct', e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="growth-horizon">Projection Horizon (years)</FieldLabel>
            <input
              id="growth-horizon"
              type="number"
              inputMode="decimal"
              min="1"
              max="30"
              step="1"
              value={localGrowthAssumptions.projection_years || ''}
              onChange={(e) => updateGrowth('projection_years', e.target.value)}
              placeholder="3"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="growth-bonus">Bonus Growth (%/yr)</FieldLabel>
            <input
              id="growth-bonus"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.5"
              value={localGrowthAssumptions.bonus_growth_pct || ''}
              onChange={(e) => updateGrowth('bonus_growth_pct', e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div>
            <FieldLabel htmlFor="growth-nps">NPS Growth (%/yr)</FieldLabel>
            <input
              id="growth-nps"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.5"
              value={localGrowthAssumptions.nps_growth_pct || ''}
              onChange={(e) => updateGrowth('nps_growth_pct', e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div className="flex items-center justify-between gap-3 self-end pb-0.5">
            <FieldLabel>EPF Scales With Base</FieldLabel>
            <Toggle
              checked={localGrowthAssumptions.epf_scales_with_base}
              onChange={(val) => updateGrowth('epf_scales_with_base', val)}
            />
          </div>
        </div>
      </div>
    </Section>
  )
}
