import type { User } from '@/types'

export interface ProfileDisplay {
  initials: string
  displayName: string
  memberSince: string | null
  providerLabel: string
}

/**
 * Builds a setExpanded handler for a reset row that, when opened,
 * collapses the sibling reset row and clears the shared confirm text.
 */
export function makeExclusiveResetToggle(
  setSelf: (v: boolean) => void,
  setSibling: (v: boolean) => void,
  setConfirmText: (v: string) => void,
) {
  return (v: boolean) => {
    setSelf(v)
    if (v) {
      setSibling(false)
      setConfirmText('')
    }
  }
}

export function deriveProfileDisplay(user: User | null | undefined): ProfileDisplay {
  const initials = user ? (user.full_name || user.email)[0].toUpperCase() : '?'
  const displayName = user?.full_name || user?.email.split('@')[0] || 'User'
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null
  const providerLabel = user?.auth_provider
    ? user.auth_provider.charAt(0).toUpperCase() + user.auth_provider.slice(1)
    : 'Email'

  return { initials, displayName, memberSince, providerLabel }
}
