import ErrorState from '@/components/shared/ErrorState'

interface RefreshFailedNoticeProps {
  readonly onRetry: () => void
  readonly message?: string
}

/**
 * Shown above data a background refresh could not update. The figures below
 * stay on screen; see `pageStatus` in `lib/queryStatus.ts`.
 */
export default function RefreshFailedNotice({
  onRetry,
  message = 'Could not refresh. These are the figures from the last successful load.',
}: RefreshFailedNoticeProps) {
  return <ErrorState message={message} onRetry={onRetry} errorType="network" variant="inline" />
}
