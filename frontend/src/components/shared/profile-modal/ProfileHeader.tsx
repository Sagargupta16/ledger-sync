import { Shield, X } from 'lucide-react'

import { Button } from '@/components/ui'
interface ProfileHeaderProps {
  initials: string
  displayName: string
  email: string | undefined
  providerLabel: string
  memberSince: string | null
  onClose: () => void
}

export function ProfileHeader(props: Readonly<ProfileHeaderProps>) {
  const { initials, displayName, email, providerLabel, memberSince, onClose } = props

  return (
    <div className="relative border-b border-[var(--hairline-1)] bg-[var(--overlay-1)] px-6 pt-6 pb-5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 size-11 p-0 lg:pointer-fine:size-8 lg:pointer-fine:min-h-8 lg:pointer-fine:min-w-8"
      >
        <X size={16} className="text-text-tertiary" aria-hidden="true" />
      </Button>

      <div className="flex items-center gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-app-blue/30 bg-app-blue/15">
          <span className="ledger-figure text-lg font-semibold text-app-blue">{initials}</span>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground truncate">{displayName}</h2>
          <p className="text-sm text-muted-foreground truncate">{email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--overlay-3)] border border-[var(--hairline-2)] text-xs text-muted-foreground">
              <Shield size={10} />
              {providerLabel}
            </span>
            {memberSince && (
              <span className="text-xs text-text-tertiary">Since {memberSince}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
