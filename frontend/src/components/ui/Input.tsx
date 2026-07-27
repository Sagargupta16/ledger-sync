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
            'ledger-control min-h-11 w-full rounded-md px-3 py-2 lg:pointer-fine:min-h-10',
            'border border-[var(--hairline-2)] text-foreground placeholder:text-text-quaternary',
            'transition-all duration-150 ease-out',
            'focus:outline-none',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            icon && 'pl-10',
            error && 'border-app-red/50 focus:border-app-red/50 focus:shadow-[0_0_0_1px_var(--focus-ring-error),0_0_0_4px_var(--focus-ring-error-soft)]',
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

interface SelectOption {
  value: string
  label: string
}

interface SelectOptionGroup {
  label: string
  options: SelectOption[]
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: SelectOption[]
  /**
   * Optional `<optgroup>` blocks rendered after `options`. Use when a long list
   * has a secondary tier the user rarely wants (e.g. transfer routing labels
   * behind real spending categories) so it stays reachable without burying the
   * common choices.
   */
  groups?: SelectOptionGroup[]
}

/**
 * Select component with clean, minimal styling.
 * Matches Input styling for visual consistency.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, groups, className, id, ...props },
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
          'ledger-control min-h-11 w-full rounded-md px-3 py-2 lg:pointer-fine:min-h-10',
          'border border-[var(--hairline-2)] text-foreground',
          'transition-all duration-150 ease-out',
          'focus:outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-app-red/50 focus:border-app-red/50 focus:shadow-[0_0_0_1px_var(--focus-ring-error),0_0_0_4px_var(--focus-ring-error-soft)]',
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
        {groups?.map((group) =>
          group.options.length > 0 ? (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          ) : null
        )}
      </select>
      {error && (
        <p id={selectId ? `${selectId}-error` : undefined} className="text-xs text-app-red" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
