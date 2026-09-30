import type { ComponentProps, ReactNode } from 'react'

import ErrorState from '@/components/shared/ErrorState'
import { PageContainer, PageHeader } from '@/components/ui'

interface PageErrorStateProps {
  readonly title: string
  readonly subtitle?: string
  readonly message?: string
  readonly onRetry?: () => void
  /** Header action that stays usable on error (a settings or sibling-page link). */
  readonly action?: ReactNode
  /** Toolbars, panels or disclaimers that stay visible, between header and error. */
  readonly children?: ReactNode
  /** Same geometry as the page's own container. */
  readonly maxWidth?: ComponentProps<typeof PageContainer>['maxWidth']
  readonly className?: string
}

export default function PageErrorState({
  title,
  subtitle,
  message = 'We could not load this financial data. Your saved records are unchanged. Try again.',
  onRetry,
  action,
  children,
  maxWidth,
  className,
}: PageErrorStateProps) {
  return (
    <PageContainer maxWidth={maxWidth} className={className}>
      <PageHeader title={title} subtitle={subtitle} action={action} />
      {children}
      <ErrorState
        title={`Unable to load ${title}`}
        message={message}
        onRetry={onRetry}
        errorType="network"
        variant="card"
      />
    </PageContainer>
  )
}
