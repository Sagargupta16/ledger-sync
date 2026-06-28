import { ArrowRight, Receipt } from 'lucide-react'

import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import type {
  PageResult,
  PaletteResult,
  TransactionResult,
} from './paletteData'

interface PaletteResultsProps {
  results: PaletteResult[]
  query: string
  selectedIndex: number
  setSelectedIndex: (i: number) => void
  executeResult: (r: PaletteResult) => void
  listRef: React.RefObject<HTMLUListElement | null>
}

export function PaletteResults(props: Readonly<PaletteResultsProps>) {
  const { results, query, selectedIndex, setSelectedIndex, executeResult, listRef } = props

  return (
    <ul
      ref={listRef}
      className="flex-1 min-h-0 sm:max-h-[50vh] overflow-y-auto overflow-x-hidden py-2 scrollbar-none list-none m-0 p-0"
      aria-label="Search results"
    >
      {results.length === 0 && query.trim() !== '' && (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-text-tertiary">No results for "{query}"</p>
        </div>
      )}

      {results.some((r) => r.kind === 'page') && (
        <div>
          <div className="px-5 py-1.5 text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Pages
          </div>
          {results
            .map((result, index) => ({ result, index }))
            .filter(({ result }) => result.kind === 'page')
            .map(({ result, index }) => {
              const page = (result as PageResult).entry
              const Icon = page.icon
              const isSelected = index === selectedIndex

              return (
                <li key={page.path} data-index={index}>
                  <button
                    data-selected={isSelected}
                    className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors duration-150 ease-out cursor-pointer ${
                      isSelected ? 'bg-[var(--overlay-4)]' : 'hover:bg-[var(--overlay-3)]'
                    }`}
                    onClick={() => executeResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div
                      className="p-1.5 rounded-lg flex-shrink-0"
                      style={{
                        background: isSelected
                          ? `${rawColors.app.blue}20`
                          : 'rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      <Icon
                        size={16}
                        style={{
                          color: isSelected ? rawColors.app.blue : rawColors.text.secondary,
                        }}
                      />
                    </div>
                    <span
                      className={`flex-1 text-sm font-medium ${
                        isSelected ? 'text-foreground' : 'text-text-secondary'
                      }`}
                    >
                      {page.label}
                    </span>
                    {isSelected && <ArrowRight size={14} className="text-text-tertiary" />}
                  </button>
                </li>
              )
            })}
        </div>
      )}

      {results.some((r) => r.kind === 'transaction') && (
        <div>
          <div className="px-5 py-1.5 mt-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Transactions
          </div>
          {results
            .map((result, index) => ({ result, index }))
            .filter(({ result }) => result.kind === 'transaction')
            .map(({ result, index }) => {
              const tx = (result as TransactionResult).transaction
              const isSelected = index === selectedIndex
              const isIncome = tx.type === 'Income'

              let iconBgColor = 'rgba(255, 255, 255, 0.06)'
              if (isSelected) {
                iconBgColor = isIncome ? `${rawColors.app.green}20` : `${rawColors.app.red}20`
              }

              let iconColor = rawColors.text.secondary
              if (isSelected) {
                iconColor = isIncome ? rawColors.app.green : rawColors.app.red
              }

              return (
                <li key={tx.id} data-index={index}>
                  <button
                    data-selected={isSelected}
                    className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors duration-150 ease-out cursor-pointer ${
                      isSelected ? 'bg-[var(--overlay-4)]' : 'hover:bg-[var(--overlay-3)]'
                    }`}
                    onClick={() => executeResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div
                      className="p-1.5 rounded-lg flex-shrink-0"
                      style={{ background: iconBgColor }}
                    >
                      <Receipt size={16} style={{ color: iconColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          isSelected ? 'text-foreground' : 'text-text-secondary'
                        }`}
                      >
                        {tx.note || tx.category}
                      </p>
                      <p className="text-xs truncate text-text-tertiary">
                        {tx.category}
                        {tx.account ? ` · ${tx.account}` : ''}
                      </p>
                    </div>
                    <span
                      className="text-sm font-semibold flex-shrink-0"
                      style={{
                        color: isIncome ? rawColors.app.green : rawColors.app.red,
                      }}
                    >
                      {isIncome ? '+' : '-'}
                      {formatCurrency(Math.abs(tx.amount))}
                    </span>
                  </button>
                </li>
              )
            })}
        </div>
      )}
    </ul>
  )
}
