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
    'bg-app-blue text-foreground hover:bg-app-blue active:scale-[0.98]',
  secondary:
    'bg-[var(--overlay-3)] border border-[var(--hairline-2)] text-foreground hover:bg-[var(--overlay-5)] hover:text-foreground active:scale-[0.98]',
  ghost:
    'text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-3)] active:scale-[0.98]',
  danger:
    'bg-app-red/90 text-foreground hover:bg-app-red active:scale-[0.98]',
  outline:
    'border border-[var(--hairline-3)] text-foreground hover:bg-[var(--overlay-3)] hover:text-foreground active:scale-[0.98]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-xl gap-2',
  lg: 'px-5 py-2.5 text-base rounded-xl gap-2',
}

/**
 * Button component with consistent styling across the app.
 * Supports primary, secondary, ghost, danger, and outline variants.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, isLoading, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150 ease-out',
        'disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-blue focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
