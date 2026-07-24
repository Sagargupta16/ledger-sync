import ErrorState from '@/components/shared/ErrorState'
import { PageContainer, PageHeader } from '@/components/ui'

interface PageErrorStateProps {
  readonly title: string
  readonly subtitle?: string
  readonly message?: string
  readonly onRetry?: () => void
}

export default function PageErrorState({
  title,
  subtitle,
  message = 'We could not load this financial data. Your saved records are unchanged. Try again.',
  onRetry,
}: PageErrorStateProps) {
  return (
    <PageContainer>
      <PageHeader title={title} subtitle={subtitle} />
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
