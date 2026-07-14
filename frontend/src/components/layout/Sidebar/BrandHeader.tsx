import { Landmark } from 'lucide-react'

export default function BrandHeader() {
  return (
    <div className="flex min-h-14 items-center gap-2.5 border-b border-[var(--hairline-2)] px-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
        <Landmark className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-4 text-foreground">
          Ledger Sync
        </p>
        <p className="truncate text-[10px] leading-4 text-text-tertiary">
          Personal finance workspace
        </p>
      </div>
    </div>
  )
}
