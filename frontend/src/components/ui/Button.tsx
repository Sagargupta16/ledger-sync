import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { motion } from 'motion/react'

import { DURATION, EASING } from '@/constants/animations'
import { cn } from '@/lib/cn'
import { useMotionStore } from '@/store/motionStore'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  isLoading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-primary bg-primary text-primary-foreground shadow-[var(--ledger-control-shadow)] hover:border-app-blue-vibrant hover:bg-app-blue-vibrant',
  secondary:
    'ledger-control border text-foreground hover:text-foreground',
  ghost:
    'text-muted-foreground hover:bg-[var(--ledger-control-bg-hover)] hover:text-foreground',
  danger:
    'border border-app-red bg-app-red text-destructive-foreground shadow-sm hover:bg-app-red-vibrant',
  outline:
    'border border-[var(--hairline-3)] bg-transparent text-foreground hover:border-[var(--hairline-4)] hover:bg-[var(--overlay-2)]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-11 min-w-11 px-2.5 py-1 text-xs rounded-md gap-1.5 lg:pointer-fine:min-h-8 lg:pointer-fine:min-w-8',
  md: 'min-h-11 min-w-11 px-3.5 py-1.5 text-sm rounded-md gap-2 lg:pointer-fine:min-h-9 lg:pointer-fine:min-w-9',
  lg: 'min-h-11 min-w-11 px-4 py-2 text-sm rounded-lg gap-2',
}

/**
 * Button component with consistent styling across the app.
 * Supports primary, secondary, ghost, danger, and outline variants.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    type = 'button',
    icon,
    isLoading,
    className,
    children,
    disabled,
    style,
    ...props
  },
  ref
) {
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex max-w-full touch-manipulation items-center justify-center whitespace-normal text-center font-medium leading-5 tabular-nums [overflow-wrap:anywhere]',
        !reduceMotion && 'enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      style={{
        transitionProperty: 'transform, translate, scale, opacity',
        transitionDuration: 'var(--duration-fast)',
        transitionTimingFunction: 'var(--ease-cinematic)',
        ...style,
      }}
      {...props}
    >
      {(icon || isLoading) && (
        <span
          aria-hidden="true"
          className="inline-grid shrink-0 place-items-center [&>*]:[grid-area:1/1]"
        >
          {icon && (
            <motion.span
              initial={false}
              animate={{ opacity: isLoading ? 0 : 1, scale: isLoading ? 0.8 : 1 }}
              transition={{ duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }}
              className="inline-flex items-center justify-center"
            >
              {icon}
            </motion.span>
          )}
          {isLoading && (
            <motion.span
              initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }}
              className="inline-flex"
            >
              <svg
                className="size-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </motion.span>
          )}
        </span>
      )}
      {children}
    </button>
  )
})

export default Button
