import { memo, type ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

const PageHeader = memo(function PageHeader({
  title,
  subtitle,
  action,
}: Readonly<PageHeaderProps>) {
  return (
    <header className="flex flex-col gap-3 border-b border-[var(--hairline-1)] pb-5 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
      <div className="min-w-0 lg:flex-1">
        <h1 className="text-page-title text-balance text-foreground">{title}</h1>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-pretty text-sm leading-5 text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="flex min-w-0 w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0">
          {action}
        </div>
      )}
    </header>
  )
})

export default PageHeader
