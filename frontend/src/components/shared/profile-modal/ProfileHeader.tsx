import { Shield, X } from 'lucide-react'

import { rawColors } from '@/constants/colors'

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
    <div
      className="relative px-6 pt-6 pb-5"
      style={{
        background: `linear-gradient(135deg, ${rawColors.app.purple}20, ${rawColors.app.indigo}12, transparent)`,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-11 h-11 sm:w-8 sm:h-8 rounded-lg bg-transparent hover:bg-white/[0.06] flex items-center justify-center transition-colors duration-150 ease-out"
      >
        <X size={16} className="text-text-tertiary hover:text-white" />
      </button>

      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${rawColors.app.purple}, ${rawColors.app.pink})`,
            boxShadow: `0 8px 24px ${rawColors.app.purple}40`,
          }}
        >
          <span className="text-white font-bold text-xl">{initials}</span>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white truncate">{displayName}</h2>
          <p className="text-sm text-muted-foreground truncate">{email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-xs text-muted-foreground">
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
