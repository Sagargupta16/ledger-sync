import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

import Button from '@/components/ui/Button'
import type { SalaryComponents } from '@/types/salary'
import { formatCurrency } from '@/lib/formatters'

import { FieldLabel } from '../../sectionPrimitives'
import { inputClass } from '../../styles'

interface SalaryFieldsGridProps {
  fyKeys: string[]
  selectedFY: string
  fyIdx: number
  currentSalary: SalaryComponents
  annualCTC: number
  onPrev: () => void
  onNext: () => void
  onAddFY: () => void
  onUpdateField: (field: keyof SalaryComponents, value: string) => void
}

const SALARY_FIELDS: Array<{
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

export function SalaryFieldsGrid(props: Readonly<SalaryFieldsGridProps>) {
  const {
    fyKeys,
    selectedFY,
    fyIdx,
    currentSalary,
    annualCTC,
    onPrev,
    onNext,
    onAddFY,
    onUpdateField,
  } = props

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Salary Structure</h3>
        <div className="flex items-center gap-2">
          <Button
            id="previous-salary-financial-year"
            type="button"
            variant="secondary"
            size="sm"
            onClick={onPrev}
            disabled={fyIdx <= 0}
            aria-label="Previous financial year"
            icon={<ChevronLeft className="w-4 h-4 text-foreground" />}
          />
          <span className="text-sm font-medium text-foreground min-w-[80px] text-center">
            {fyKeys.length > 0 ? `FY ${selectedFY}` : 'No FY'}
          </span>
          <Button
            id="next-salary-financial-year"
            type="button"
            variant="secondary"
            size="sm"
            onClick={onNext}
            disabled={fyIdx >= fyKeys.length - 1}
            aria-label="Next financial year"
            icon={<ChevronRight className="w-4 h-4 text-foreground" />}
          />
          <Button
            id="add-salary-financial-year"
            type="button"
            variant="secondary"
            size="sm"
            onClick={onAddFY}
            className="border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Add FY
          </Button>
        </div>
      </div>

      {fyKeys.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SALARY_FIELDS.map((f) => (
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
                  onChange={(e) => onUpdateField(f.key, e.target.value)}
                  placeholder={f.nullable ? 'Optional' : '0'}
                  className={inputClass}
                />
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Annual CTC (excl. RSUs)</p>
              <p className="text-lg font-semibold text-foreground">{formatCurrency(annualCTC)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Monthly (pre-tax)</p>
              <p className="text-lg font-semibold text-foreground">{formatCurrency(annualCTC / 12)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
