/**
 * Income Classification section - classify income subcategories by type.
 */

import type { Dispatch, SetStateAction } from 'react'
import { DollarSign } from 'lucide-react'
import type { LocalPrefs, IncomeClassificationType } from '../types'
import { INCOME_CLASSIFICATION_TYPES, INCOME_CLASSIFICATION_KEY_MAP } from '../types'
import { Section } from '../sectionPrimitives'

interface Props {
  index: number
  allIncomeCategories: Record<string, string[]>
  localPrefs: LocalPrefs
  unclassifiedIncomeItems: string[]
  setLocalPrefs: Dispatch<SetStateAction<LocalPrefs | null>>
  setHasChanges: (v: boolean) => void
}

function getClassification(
  localPrefs: LocalPrefs,
  item: string,
): IncomeClassificationType | 'unclassified' {
  for (const classType of INCOME_CLASSIFICATION_TYPES) {
    const key = INCOME_CLASSIFICATION_KEY_MAP[classType.value]
    if ((localPrefs[key] as string[]).includes(item)) {
      return classType.value
    }
  }
  return 'unclassified'
}

export default function IncomeClassificationSection({
  index,
  allIncomeCategories,
  localPrefs,
  unclassifiedIncomeItems,
  setLocalPrefs,
  setHasChanges,
}: Readonly<Props>) {
  const handleClassify = (item: string, newType: IncomeClassificationType | 'unclassified') => {
    const updated = { ...localPrefs }
    for (const classType of INCOME_CLASSIFICATION_TYPES) {
      const key = INCOME_CLASSIFICATION_KEY_MAP[classType.value]
      updated[key] = (updated[key] as string[]).filter((c: string) => c !== item)
    }
    if (newType !== 'unclassified') {
      const targetKey = INCOME_CLASSIFICATION_KEY_MAP[newType]
      updated[targetKey] = [...(updated[targetKey] as string[]), item]
    }
    setLocalPrefs(updated)
    setHasChanges(true)
  }

  return (
    <Section
      index={index}
      icon={DollarSign}
      title="Income Classification"
      description="Classify income subcategories by type for tax and analytics"
    >
      {Object.keys(allIncomeCategories).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No income categories found. Import some transactions first.
        </p>
      ) : (
        <div className="space-y-4">
          {Object.entries(allIncomeCategories).map(([parentCat, subs]) => (
            <div key={parentCat}>
              <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                {parentCat}
              </h4>
              <div className="space-y-1">
                {subs.map((sub) => {
                  const fullKey = `${parentCat}::${sub}`
                  const currentType = getClassification(localPrefs, fullKey)

                  return (
                    <div
                      key={fullKey}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <span className="text-sm text-white flex-1 min-w-0 truncate">{sub}</span>
                      <select
                        value={currentType}
                        onChange={(e) =>
                          handleClassify(
                            fullKey,
                            e.target.value as IncomeClassificationType | 'unclassified',
                          )
                        }
                        className="px-2 py-1.5 bg-white/5 border border-border rounded-lg text-white text-xs focus:border-primary focus:outline-none w-40 sm:w-44"
                      >
                        <option value="unclassified" className="bg-background">
                          Unclassified
                        </option>
                        {INCOME_CLASSIFICATION_TYPES.map((t) => (
                          <option key={t.value} value={t.value} className="bg-background">
                            {t.label.replace(/^[^\s]+\s/, '')}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Summary */}
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
            {INCOME_CLASSIFICATION_TYPES.map((t) => {
              const key = INCOME_CLASSIFICATION_KEY_MAP[t.value]
              const count = (localPrefs[key] as string[]).length
              return (
                <span key={t.value}>
                  {count} {t.label.replace(/^[^\s]+\s/, '').toLowerCase()}
                </span>
              )
            })}
            <span>{unclassifiedIncomeItems.length} unclassified</span>
          </div>
        </div>
      )}
    </Section>
  )
}
