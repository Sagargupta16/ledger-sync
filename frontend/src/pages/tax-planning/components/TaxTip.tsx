import { formatCurrency } from '@/lib/formatters'

interface Props {
  title: string
  amount: number | null
  description: string
}

export default function TaxTip({ title, amount, description }: Readonly<Props>) {
  return (
    <div className="rounded-lg border border-border bg-[var(--overlay-2)] p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {amount !== null && (
          <span className="whitespace-nowrap text-xs font-semibold text-app-green">
            up to {formatCurrency(amount)}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
