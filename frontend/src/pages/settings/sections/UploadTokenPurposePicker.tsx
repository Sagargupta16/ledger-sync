/**
 * Pick what a new token may do: one radio card per scope, with how many
 * tokens of that kind are active against the per-scope limit. Same card
 * pattern as the Motion choice in Display preferences.
 */

import { useId } from 'react'

import { MAX_UPLOAD_TOKENS, type TokenScope, type UploadToken } from '@/services/api/uploadTokens'

import { FieldLegend } from '../sectionPrimitives'
import { TOKEN_PURPOSES } from './uploadTokenPurposes'

interface Props {
  value: TokenScope
  onChange: (scope: TokenScope) => void
  /** Active tokens, for the counts; undefined while loading and in demo mode. */
  tokens: UploadToken[] | undefined
}

export default function UploadTokenPurposePicker({ value, onChange, tokens }: Readonly<Props>) {
  const id = useId()

  return (
    <div>
      <FieldLegend>Purpose</FieldLegend>
      {/* Three columns only from lg, where each card is wide enough for its description. */}
      <div role="radiogroup" aria-label="Token purpose" className="grid gap-2 lg:grid-cols-3">
        {TOKEN_PURPOSES.map(({ scope, label, description, Icon }, index) => {
          const selected = value === scope
          const count = tokens?.filter((token) => token.scope === scope).length
          return (
            <label
              key={scope}
              htmlFor={`${id}-${index}`}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus-ring)] has-[:focus-visible]:ring-offset-2 ${
                selected
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-surface-hover text-muted-foreground hover:text-foreground'
              }`}
            >
              <input
                id={`${id}-${index}`}
                type="radio"
                name={`${id}-purpose`}
                value={scope}
                checked={selected}
                onChange={() => onChange(scope)}
                className="sr-only"
              />
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="mt-0.5 block text-xs text-text-tertiary">{description}</span>
                {count !== undefined && (
                  <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                    {count} of {MAX_UPLOAD_TOKENS} active
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
