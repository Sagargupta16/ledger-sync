import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: ReactNode
}

/**
 * iOS-style input with frosted glass effect.
 * Replaces inline input-ios class and scattered input styling.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, icon, className, id, ...props },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replaceAll(/\s+/g, '-') : undefined)

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full bg-input backdrop-blur-[20px] px-4 py-3 rounded-xl',
            'border border-border text-white placeholder-text-quaternary',
            'transition-colors duration-200',
            'focus:border-ios-blue focus:outline-none focus:ring-2 focus:ring-ios-blue/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            icon && 'pl-10',
            error && 'border-ios-red focus:border-ios-red focus:ring-ios-red/20',
            className
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error && inputId ? `${inputId}-error` : undefined}
          {...props}
        />
      </div>
      {error && (
        <p id={inputId ? `${inputId}-error` : undefined} className="text-xs text-ios-red" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})

export default Input

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Array<{ value: string; label: string }>
}

/**
 * iOS-style select with frosted glass effect.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, className, id, ...props },
  ref
) {
  const selectId = id || (label ? label.toLowerCase().replaceAll(/\s+/g, '-') : undefined)

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'w-full bg-input backdrop-blur-[20px] px-4 py-3 rounded-xl',
          'border border-border text-white',
          'transition-colors duration-200',
          'focus:border-ios-blue focus:outline-none focus:ring-2 focus:ring-ios-blue/20',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-ios-red focus:border-ios-red focus:ring-ios-red/20',
          className
        )}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error && selectId ? `${selectId}-error` : undefined}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={selectId ? `${selectId}-error` : undefined} className="text-xs text-ios-red" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
