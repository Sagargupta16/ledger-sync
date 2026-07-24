import { Input } from '@/components/ui'

interface Props {
  label: string
  sublabel: string
  value: number
  max: number
  onChange: (v: number) => void
}

export default function DeductionInput({ label, sublabel, value, max, onChange }: Readonly<Props>) {
  const inputId = `deduction-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`

  return (
    <div>
      <Input
        id={inputId}
        label={label}
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        value={value || ''}
        onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
        placeholder="0"
        aria-describedby={`${inputId}-help`}
        className="text-sm"
      />
      <span id={`${inputId}-help`} className="text-caption text-text-quaternary mt-0.5 block">
        {sublabel}
      </span>
    </div>
  )
}
