interface SliderInputProps {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly unit: string
  readonly valueText?: string
  readonly onChange: (v: number) => void
}

/** A labelled range input with its value beside the label and a 44px touch row. */
export default function SliderInput({ id, label, value, min, max, step, unit, valueText, onChange }: SliderInputProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className="text-xs font-semibold text-foreground">{value}{unit}</span>
      </div>
      <div className="flex min-h-11 items-center">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuenow={value}
          aria-valuetext={valueText ?? `${value}${unit}`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="touch-slider"
        />
      </div>
    </div>
  )
}
