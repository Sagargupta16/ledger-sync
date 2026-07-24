import { TrendingUp } from 'lucide-react'

import type { GrowthAssumptions } from '@/types/salary'

import { FieldLabel, Toggle } from '../../sectionPrimitives'
import { inputClass } from '../../styles'

interface GrowthAssumptionsFormProps {
  growth: GrowthAssumptions
  onUpdate: (field: keyof GrowthAssumptions, value: string | boolean) => void
}

export function GrowthAssumptionsForm({
  growth,
  onUpdate,
}: Readonly<GrowthAssumptionsFormProps>) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
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
            value={growth.base_salary_growth_pct || ''}
            onChange={(e) => onUpdate('base_salary_growth_pct', e.target.value)}
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
            value={growth.stock_price_appreciation_pct || ''}
            onChange={(e) => onUpdate('stock_price_appreciation_pct', e.target.value)}
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
            value={growth.projection_years || ''}
            onChange={(e) => onUpdate('projection_years', e.target.value)}
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
            value={growth.bonus_growth_pct || ''}
            onChange={(e) => onUpdate('bonus_growth_pct', e.target.value)}
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
            value={growth.nps_growth_pct || ''}
            onChange={(e) => onUpdate('nps_growth_pct', e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </div>
        <div className="flex items-center justify-between gap-3 self-end pb-0.5">
          <FieldLabel htmlFor="growth-epf-scales">EPF Scales With Base</FieldLabel>
          <Toggle
            id="growth-epf-scales"
            aria-label="EPF scales with base salary"
            checked={growth.epf_scales_with_base}
            onChange={(val) => onUpdate('epf_scales_with_base', val)}
          />
        </div>
      </div>
    </div>
  )
}
