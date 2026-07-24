import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

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
    'border border-foreground bg-foreground text-background shadow-sm hover:bg-foreground/90',
  secondary:
    'ledger-control border text-foreground hover:text-foreground',
  ghost:
    'text-muted-foreground hover:bg-[var(--ledger-control-bg-hover)] hover:text-foreground',
  danger:
    'border border-app-red bg-app-red text-destructive-foreground shadow-sm hover:bg-app-red-vibrant',
  outline:
    'ledger-control border text-foreground hover:text-foreground',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-11 min-w-11 px-2.5 py-1 text-xs rounded-md gap-1.5 sm:min-h-8 sm:min-w-0',
  md: 'min-h-11 min-w-11 px-3.5 py-1.5 text-sm rounded-md gap-2 sm:min-h-9 sm:min-w-0',
  lg: 'min-h-11 min-w-11 px-4 py-2 text-sm rounded-lg gap-2 sm:min-w-0',
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
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={cn(
        // transition-[color,background-color,border-color,transform] keeps the
        // press scale springy without animating layout properties.
        'inline-flex items-center justify-center whitespace-nowrap font-medium transition-[color,background-color,border-color,transform] duration-150 ease-out',
        'active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!isLoading && icon && (
        <span className="shrink-0" aria-hidden="true">{icon}</span>
      )}
      {children}
    </button>
  )
})

export default Button
