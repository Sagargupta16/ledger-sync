/**
 * Categorization Rules section - CRUD rows for auto-assigning categories
 * when a transaction note or account contains a phrase.
 */

import { Plus, Trash2, Wand2 } from 'lucide-react'

import Button from '@/components/ui/Button'
import type { LocalRule } from '../types'
import { MATCH_FIELDS } from '../types'
import { Section, Toggle, FieldLabel, FieldHint } from '../sectionPrimitives'
import { inputClass, selectClass } from '../styles'

interface Props {
  index: number
  rules: LocalRule[]
  onAddRule: () => void
  onRemoveRule: (localId: string) => void
  onUpdateRule: (localId: string, field: keyof LocalRule, value: string | boolean) => void
  onApplyRules: () => void
  applying: boolean
}

export default function CategorizationRulesSection({
  index,
  rules,
  onAddRule,
  onRemoveRule,
  onUpdateRule,
  onApplyRules,
  applying,
}: Readonly<Props>) {
  return (
    <Section
      index={index}
      icon={Wand2}
      title="Categorization Rules"
      description="Auto-assign categories when a transaction note or account contains a phrase"
      defaultCollapsed={false}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          First matching rule wins, top to bottom.
        </p>
        <Button
          id="add-categorization-rule"
          type="button"
          variant="secondary"
          size="sm"
          onClick={onAddRule}
          className="border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          Add rule
        </Button>
      </div>

      {rules.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No rules yet. Click &quot;Add rule&quot; to auto-categorize transactions on import.
        </p>
      )}

      {rules.map((rule) => (
        <div
          key={rule.localId}
          className="rounded-xl bg-[var(--overlay-1)] border border-border p-4 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="w-full sm:w-36">
              <FieldLabel htmlFor={`rule-field-${rule.localId}`}>When</FieldLabel>
              <select
                id={`rule-field-${rule.localId}`}
                value={rule.match_field}
                onChange={(e) => onUpdateRule(rule.localId, 'match_field', e.target.value)}
                className={selectClass}
                aria-label="Field to match"
              >
                {MATCH_FIELDS.map((f) => (
                  <option key={f.value} value={f.value} className="bg-background text-foreground">
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <FieldLabel htmlFor={`rule-pattern-${rule.localId}`}>Contains</FieldLabel>
              <input
                id={`rule-pattern-${rule.localId}`}
                type="text"
                value={rule.pattern}
                onChange={(e) => onUpdateRule(rule.localId, 'pattern', e.target.value)}
                placeholder="e.g. swiggy"
                maxLength={255}
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <FieldLabel htmlFor={`rule-category-${rule.localId}`}>Set category</FieldLabel>
              <input
                id={`rule-category-${rule.localId}`}
                type="text"
                value={rule.category}
                onChange={(e) => onUpdateRule(rule.localId, 'category', e.target.value)}
                placeholder="e.g. Food"
                maxLength={255}
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <FieldLabel htmlFor={`rule-subcategory-${rule.localId}`}>Subcategory (optional)</FieldLabel>
              <input
                id={`rule-subcategory-${rule.localId}`}
                type="text"
                value={rule.subcategory}
                onChange={(e) => onUpdateRule(rule.localId, 'subcategory', e.target.value)}
                placeholder="e.g. Delivery"
                maxLength={255}
                className={inputClass}
              />
            </div>
            <div className="flex items-center gap-3 pb-1.5">
              <div className="flex items-center gap-2">
                <Toggle
                  id={`rule-active-${rule.localId}`}
                  aria-label={`Enable rule ${rule.pattern || rule.localId}`}
                  checked={rule.is_active}
                  onChange={(val) => onUpdateRule(rule.localId, 'is_active', val)}
                />
                <label
                  htmlFor={`rule-active-${rule.localId}`}
                  className="text-xs text-muted-foreground"
                >
                  Active
                </label>
              </div>
              <Button
                id={`delete-rule-${rule.localId}`}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemoveRule(rule.localId)}
                title="Delete rule"
                aria-label={`Delete rule ${rule.pattern || rule.localId}`}
                className="text-app-red hover:bg-app-red/10 hover:text-app-red"
                icon={<Trash2 className="w-4 h-4" />}
              />
            </div>
          </div>
        </div>
      ))}

      <div className="pt-1">
        <Button
          id="apply-categorization-rules"
          type="button"
          variant="secondary"
          onClick={onApplyRules}
          disabled={applying}
          isLoading={applying}
        >
          {applying ? 'Applying...' : 'Apply to existing transactions'}
        </Button>
        <FieldHint>
          Rules also run automatically on every import. Applying now rewrites matching past
          transactions.
        </FieldHint>
      </div>
    </Section>
  )
}
