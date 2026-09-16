import { X } from 'lucide-react'

import { Button } from '@/components/ui'
interface ProfileIdentityProps {
  initials: string
  displayName: string
  email: string | undefined
  providerLabel: string
  memberSince: string | null
}

export function ProfileHeader({ onClose }: Readonly<{ onClose: () => void }>) {
  return (
    <header className="shrink-0 border-b border-[var(--hairline-1)] px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="profile-dialog-title" className="text-lg font-semibold tracking-tight">Profile &amp; account</h2>
          <p id="profile-dialog-description" className="mt-1 text-xs leading-5 text-muted-foreground">
            Your identity, sign-in details, and account controls.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close profile"
          className="shrink-0 p-0"
        >
          <X size={16} className="text-text-tertiary" aria-hidden="true" />
        </Button>
      </div>
    </header>
  )
}

export function ProfileIdentity({ initials, displayName, email, providerLabel, memberSince }: Readonly<ProfileIdentityProps>) {
  return (
    <div className="mb-5 border-b border-[var(--hairline-1)] pb-5">
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background" aria-hidden="true">
          <span className="text-sm font-semibold">{initials}</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{displayName}</p>
          <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{email}</p>
        </div>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-xs leading-5">
        <div>
          <dt className="text-text-tertiary">Sign-in method</dt>
          <dd className="font-medium">{providerLabel}</dd>
        </div>
        {memberSince && (
          <div>
            <dt className="text-text-tertiary">Member since</dt>
            <dd className="font-medium">{memberSince}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}
