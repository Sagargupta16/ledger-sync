import { formatDate } from '@/lib/formatters'
import type { User } from '@/types'

export interface ProfileDisplay {
  initials: string
  displayName: string
  memberSince: string | null
  providerLabel: string
}

export function getProfileInitials(name?: string | null, email?: string): string {
  const source = name?.trim() || email?.split('@')[0] || 'LS'
  return source.split(/[\s._-]+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join('')
}

export function deriveProfileDisplay(user: User | null | undefined): ProfileDisplay {
  const initials = getProfileInitials(user?.full_name, user?.email)
  const displayName = user?.full_name || user?.email.split('@')[0] || 'User'
  const memberSince = user?.created_at
    ? formatDate(new Date(user.created_at), {
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
