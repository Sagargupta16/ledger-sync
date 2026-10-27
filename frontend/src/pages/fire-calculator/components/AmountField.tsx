import { Input } from '@/components/ui'
import { BASE_CURRENCY } from '@/constants/currencies'
import { formatCurrency } from '@/lib/formatters'

interface AmountFieldProps {
  readonly id: string
  readonly label: string
  /** Base-currency (INR) amount; 0 shows as an empty field with a 0 placeholder. */
  readonly value: number
  /** Short note after the formatted echo, such as where the default came from. */
  readonly hint?: string
  readonly onChange: (value: number) => void
}

/**
 * A whole-unit amount entered in the base currency, like the budget limits, with
 * its value echoed underneath in the display currency.
 */
export default function AmountField({ id, label, value, hint, onChange }: AmountFieldProps) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {label} ({BASE_CURRENCY})
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1000}
        value={value === 0 ? '' : value}
        placeholder="0"
        aria-describedby={`${id}-echo`}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(Math.max(0, Math.round(next)))
        }}
        className="font-mono tabular-nums"
      />
      <p id={`${id}-echo`} className="mt-1 text-xs text-text-tertiary [overflow-wrap:anywhere]">
        {formatCurrency(value)}
        {hint ? ` · ${hint}` : ''}
      </p>
    </div>
  )
}
