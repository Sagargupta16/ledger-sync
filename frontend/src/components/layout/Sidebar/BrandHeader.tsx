import { PiggyBank, ChevronDown } from 'lucide-react'

export default function BrandHeader({
  user,
  onOpenProfile,
}: Readonly<{
  user: { full_name?: string | null; email: string } | null
  onOpenProfile: () => void
}>) {
  return (
    <button
      type="button"
      onClick={onOpenProfile}
      className="group/brand flex w-full items-center gap-3 border-b border-[var(--hairline-2)] px-4 py-4 transition-colors duration-150 hover:bg-[var(--overlay-2)]"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-app-blue/20 bg-app-blue/15">
        <PiggyBank className="w-5 h-5 text-app-blue" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[15px] font-semibold text-foreground truncate leading-tight">
          Ledger Sync
        </p>
        <p className="text-xs text-text-tertiary truncate leading-tight mt-0.5">
          {user?.email || 'Financial Dashboard'}
        </p>
      </div>
      <ChevronDown
        size={16}
        className="text-text-quaternary flex-shrink-0 group-hover/brand:text-muted-foreground transition-colors duration-150"
      />
    </button>
  )
}
