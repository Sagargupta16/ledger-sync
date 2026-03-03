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
        <label htmlFor={inputId} className="block text-sm font-medium text-zinc-400">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full bg-white/[0.04] px-4 py-3 rounded-lg',
            'border border-white/[0.08] text-white placeholder:text-zinc-600',
            'transition-all duration-150 ease-out',
            'focus:border-blue-400/50 focus:outline-none focus:ring-1 focus:ring-blue-400/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            icon && 'pl-10',
            error && 'border-red-400/50 focus:border-red-400/50 focus:ring-red-400/20',
            className
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error && inputId ? `${inputId}-error` : undefined}
          {...props}
        />
      </div>
      {error && (
        <p id={inputId ? `${inputId}-error` : undefined} className="text-xs text-red-400" role="alert">
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
        <label htmlFor={selectId} className="block text-sm font-medium text-zinc-400">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'w-full bg-white/[0.04] px-4 py-3 rounded-lg',
          'border border-white/[0.08] text-white',
          'transition-all duration-150 ease-out',
          'focus:border-blue-400/50 focus:outline-none focus:ring-1 focus:ring-blue-400/20',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-red-400/50 focus:border-red-400/50 focus:ring-red-400/20',
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
        <p id={selectId ? `${selectId}-error` : undefined} className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
