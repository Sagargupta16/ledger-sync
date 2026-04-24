import { formatCurrency } from '@/lib/formatters'

interface Props {
  title: string
  amount: number | null
  description: string
}

export default function TaxTip({ title, amount, description }: Readonly<Props>) {
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {amount !== null && (
          <span className="text-xs font-semibold text-app-green">
            up to {formatCurrency(amount)}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
