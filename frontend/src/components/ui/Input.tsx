import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: ReactNode
}

/**
 * Input component with clean, minimal styling.
 * Supports label, error state, and leading icon.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, icon, className, id, ...props },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replaceAll(/\s+/g, '-') : undefined)

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'ledger-control w-full rounded-lg px-4 py-3',
            'border border-[var(--hairline-2)] text-foreground placeholder:text-text-quaternary',
            'transition-all duration-150 ease-out',
            'focus:outline-none',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            icon && 'pl-10',
            error && 'border-app-red/50 focus:border-app-red/50 focus:shadow-[0_0_0_1px_rgba(255,87,87,0.55),0_0_0_4px_rgba(255,87,87,0.14)]',
            className
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error && inputId ? `${inputId}-error` : undefined}
          {...props}
        />
      </div>
      {error && (
        <p id={inputId ? `${inputId}-error` : undefined} className="text-xs text-app-red" role="alert">
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
 * Select component with clean, minimal styling.
 * Matches Input styling for visual consistency.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, className, id, ...props },
  ref
) {
  const selectId = id || (label ? label.toLowerCase().replaceAll(/\s+/g, '-') : undefined)

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'ledger-control w-full rounded-lg px-4 py-3',
          'border border-[var(--hairline-2)] text-foreground',
          'transition-all duration-150 ease-out',
          'focus:outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-app-red/50 focus:border-app-red/50 focus:shadow-[0_0_0_1px_rgba(255,87,87,0.55),0_0_0_4px_rgba(255,87,87,0.14)]',
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
        <p id={selectId ? `${selectId}-error` : undefined} className="text-xs text-app-red" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
