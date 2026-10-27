import { ProgressBar } from '@/components/shared'
import { Input } from '@/components/ui'
import { colors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

interface Props {
  id: string
  label: string
  sublabel: string
  /** Hover text naming the section, such as "s.123 (old 80C): ...". */
  title?: string
  value: number
  max: number
  /** `max` is a legal limit, so show how much of it is still unused. */
  showHeadroom?: boolean
  disabled?: boolean
  onChange: (v: number) => void
}

export default function DeductionInput({
  id,
  label,
  sublabel,
  title,
  value,
  max,
  showHeadroom = false,
  disabled = false,
  onChange,
}: Readonly<Props>) {
  // To the paisa, so a remainder under a rupee is shown rather than read as zero.
  const left = Math.max(0, Math.round((max - value) * 100) / 100)

  return (
    <div>
      {/* Two text-sm lines (2.5rem) kept once cells sit side by side, so a wrapped
          section label does not push its input below the inputs next to it. */}
      <label
        htmlFor={id}
        className="mb-1.5 flex text-sm font-medium text-text-secondary min-[360px]:min-h-10 min-[360px]:items-end"
      >
        {label}
      </label>
      <Input
        id={id}
        title={title}
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        step="0.01"
        disabled={disabled}
        value={value || ''}
        // Whole paise: saved amounts keep two decimal places.
        onChange={(e) =>
          onChange(Math.min(max, Math.max(0, Math.round((Number(e.target.value) || 0) * 100) / 100)))}
        placeholder="0"
        aria-describedby={showHeadroom ? `${id}-help ${id}-left` : `${id}-help`}
        className="text-sm"
      />
      <span id={`${id}-help`} className="text-caption text-text-quaternary mt-0.5 block">
        {sublabel}
      </span>
      {showHeadroom && (
        <div className="mt-1.5">
          <ProgressBar
            value={value}
            max={max}
            height={4}
            color={left === 0 ? colors.app.green : colors.app.blue}
          />
          <span id={`${id}-left`} className="mt-1 block text-caption tabular-nums text-muted-foreground">
            {left === 0 ? 'Limit reached' : `${formatCurrency(left)} left`}
          </span>
        </div>
      )}
    </div>
  )
}
