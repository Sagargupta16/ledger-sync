interface Props {
  label: string
  sublabel: string
  value: number
  max: number
  onChange: (v: number) => void
}

export default function DeductionInput({ label, sublabel, value, max, onChange }: Readonly<Props>) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <input
        type="number"
        min={0}
        max={max}
        value={value || ''}
        onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
        placeholder="0"
        className="w-full px-3 py-1.5 text-sm bg-white/5 border border-border rounded-lg text-foreground placeholder:text-text-quaternary focus:outline-none focus:ring-1 focus:ring-app-blue/50"
      />
      <span className="text-caption text-text-quaternary mt-0.5 block">{sublabel}</span>
    </div>
  )
}
