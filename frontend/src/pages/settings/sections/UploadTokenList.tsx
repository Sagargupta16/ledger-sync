/**
 * Active access tokens of every purpose, which doubles as the list of
 * connected clients: what each may do, its dates and a revoke action. The
 * plaintext is never listed; the prefix is enough to tell tokens apart.
 */

import { useId, type ReactNode } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { formatDate } from '@/lib/formatters'
import type { UploadToken } from '@/services/api/uploadTokens'

import { purposeFor } from './uploadTokenPurposes'

interface Props {
  tokens: UploadToken[] | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  /** The token being revoked; other revokes wait until it settles. */
  revokingId: number | undefined
  revokeError: { id: number; message: string } | null
  onRevoke: (token: UploadToken) => void
}

const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
const DATE_TIME: Intl.DateTimeFormatOptions = { ...DATE, hour: 'numeric', minute: '2-digit' }

/**
 * The columns hold UTC. A timestamp without a zone designator would parse as
 * local time and shift by the viewer's offset, so it is read as UTC.
 */
function formatTimestamp(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const date = new Date(/(?:z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(date.getTime()) ? iso : formatDate(date, opts)
}

function TokenDate({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground sm:text-left">{value}</dd>
    </div>
  )
}

function PurposeBadge({ token }: Readonly<{ token: UploadToken }>) {
  const { Icon, label } = purposeFor(token.scope)
  return (
    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  )
}

export default function UploadTokenList(props: Readonly<Props>) {
  const { tokens, isLoading, isError, onRetry, revokingId, revokeError, onRevoke } = props
  const headingId = useId()

  let body: ReactNode
  if (isError && !tokens) {
    body = (
      <ErrorState
        variant="compact"
        title="Could not load access tokens"
        message="Your tokens were not changed. Check your connection and try again."
        onRetry={onRetry}
      />
    )
  } else if (isLoading || !tokens) {
    body = <Spinner size="sm" label="Loading access tokens" />
  } else if (tokens.length === 0) {
    body = (
      <EmptyState
        variant="compact"
        icon={KeyRound}
        title="No access tokens yet"
        description="Create one above, then paste it into your Shortcut, Claude Code or alert automation."
      />
    )
  } else {
    body = (
      <ul aria-labelledby={headingId} className="space-y-2">
        {tokens.map((token) => (
          <li key={token.id} className="rounded-lg border border-border bg-[var(--overlay-1)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-foreground">{token.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{token.prefix}...</p>
                <PurposeBadge token={token} />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onRevoke(token)}
                disabled={revokingId !== undefined}
                isLoading={revokingId === token.id}
                aria-label={`Revoke ${token.name}`}
                icon={<Trash2 className="size-4" />}
                className="shrink-0 text-app-red hover:bg-app-red/10 hover:text-app-red"
              >
                {revokingId === token.id ? 'Revoking...' : 'Revoke'}
              </Button>
            </div>
            <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-3 sm:gap-3">
              <TokenDate label="Created" value={formatTimestamp(token.created_at, DATE)} />
              <TokenDate
                label="Last used"
                value={token.last_used_at ? formatTimestamp(token.last_used_at, DATE_TIME) : 'Never'}
              />
              <TokenDate label="Expires" value={formatTimestamp(token.expires_at, DATE)} />
            </dl>
            {revokeError?.id === token.id && (
              <p role="alert" className="mt-2 text-sm text-app-red">
                Could not revoke this token. {revokeError.message}
              </p>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 id={headingId} className="text-sm font-medium text-foreground">Active tokens</h4>
        {tokens && (
          <span className="text-xs tabular-nums text-muted-foreground">{tokens.length} active</span>
        )}
      </div>
      {body}
    </div>
  )
}
