import { memo, type ReactNode } from 'react'
import { motion } from 'motion/react'

import { DURATION, EASING } from '@/constants/animations'
import { useMotionStore } from '@/store/motionStore'

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
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')

  return (
    <motion.header
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }}
      className="flex flex-col gap-4 border-b border-[var(--hairline-2)] pb-5 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-6"
    >
      <div className="min-w-0 lg:flex-[1_1_20rem]">
        <h1 className="text-page-title text-balance text-foreground [overflow-wrap:anywhere]">{title}</h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="flex min-w-0 w-full max-w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-[0_1_auto] [&>*]:max-w-full">
          {action}
        </div>
      )}
    </motion.header>
  )
})

export default PageHeader
