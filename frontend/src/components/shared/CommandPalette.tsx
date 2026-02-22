import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  LayoutDashboard,
  Upload,
  Receipt,
  TrendingUp,
  Landmark,
  BarChart3,
  LineChart,
  ArrowRightLeft,
  Wallet,
  CircleDollarSign,
  Coins,
  Target,
  SlidersHorizontal,
  GitCompareArrows,
  CalendarDays,
  Wallet2,
  AlertTriangle,
  Goal,
  Lightbulb,
  ArrowRight,
  Command,
} from 'lucide-react'
import { ROUTES } from '@/constants'
import { rawColors } from '@/constants/colors'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import type { LucideIcon } from 'lucide-react'
import type { Transaction } from '@/types'

// ─── Page definitions with icons ────────────────────────────────────────────

interface PageEntry {
  path: string
  label: string
  icon: LucideIcon
  keywords: string[]
}

const PAGE_ENTRIES: PageEntry[] = [
  { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard, keywords: ['home', 'overview', 'summary'] },
  { path: ROUTES.UPLOAD, label: 'Upload & Sync', icon: Upload, keywords: ['import', 'csv', 'file', 'data'] },
  { path: ROUTES.TRANSACTIONS, label: 'All Transactions', icon: Receipt, keywords: ['payments', 'history', 'list'] },
  { path: ROUTES.SPENDING_ANALYSIS, label: 'Expense Analysis', icon: BarChart3, keywords: ['spending', 'categories', 'breakdown'] },
  { path: ROUTES.INCOME_ANALYSIS, label: 'Income Analysis', icon: CircleDollarSign, keywords: ['earnings', 'revenue', 'salary'] },
  { path: ROUTES.INCOME_EXPENSE_FLOW, label: 'Cash Flow', icon: ArrowRightLeft, keywords: ['money', 'flow', 'income expense'] },
  { path: ROUTES.COMPARISON, label: 'Comparison', icon: GitCompareArrows, keywords: ['compare', 'vs', 'difference', 'period'] },
  { path: ROUTES.TRENDS_FORECASTS, label: 'Trends & Forecasts', icon: LineChart, keywords: ['prediction', 'future', 'projection'] },
  { path: ROUTES.NET_WORTH, label: 'Net Worth Tracker', icon: Wallet, keywords: ['assets', 'liabilities', 'balance', 'wealth'] },
  { path: ROUTES.INVESTMENT_ANALYTICS, label: 'Investment Analytics', icon: TrendingUp, keywords: ['portfolio', 'stocks', 'returns'] },
  { path: ROUTES.MUTUAL_FUND_PROJECTION, label: 'SIP Projections', icon: Target, keywords: ['mutual fund', 'sip', 'forecast'] },
  { path: ROUTES.RETURNS_ANALYSIS, label: 'Returns Analysis', icon: Coins, keywords: ['roi', 'gains', 'performance'] },
  { path: ROUTES.TAX_PLANNING, label: 'Tax Summary', icon: Landmark, keywords: ['tax', 'deductions', '80c', 'planning'] },
  { path: ROUTES.BUDGETS, label: 'Budget Manager', icon: Wallet2, keywords: ['budget', 'plan', 'limit', 'allocation'] },
  { path: ROUTES.GOALS, label: 'Financial Goals', icon: Goal, keywords: ['savings goal', 'target', 'milestone'] },
  { path: ROUTES.INSIGHTS, label: 'Financial Insights', icon: Lightbulb, keywords: ['tips', 'recommendations', 'advice'] },
  { path: ROUTES.ANOMALIES, label: 'Anomaly Review', icon: AlertTriangle, keywords: ['unusual', 'suspicious', 'outlier'] },
  { path: ROUTES.YEAR_IN_REVIEW, label: 'Year in Review', icon: CalendarDays, keywords: ['annual', 'yearly', 'recap'] },
  { path: ROUTES.SETTINGS, label: 'Account Classification', icon: SlidersHorizontal, keywords: ['preferences', 'config', 'accounts'] },
]

// ─── Result types ───────────────────────────────────────────────────────────

interface PageResult {
  kind: 'page'
  entry: PageEntry
}

interface TransactionResult {
  kind: 'transaction'
  transaction: Transaction
}

type PaletteResult = PageResult | TransactionResult

// ─── Fuzzy match helper ─────────────────────────────────────────────────────

function fuzzyMatch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

// ─── Overlay animations ─────────────────────────────────────────────────────

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const panelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: -10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 30, stiffness: 400 } },
  exit: { opacity: 0, scale: 0.96, y: -10, transition: { duration: 0.15 } },
}

// ─── Search helpers ──────────────────────────────────────────────────────────

function searchTransactions(
  transactions: Transaction[] | undefined,
  q: string,
  limit: number = 5,
): TransactionResult[] {
  const results: TransactionResult[] = []
  if (!transactions || transactions.length === 0) return results

  for (const tx of transactions) {
    if (results.length >= limit) break
    const matchNote = tx.note && fuzzyMatch(tx.note, q)
    const matchCategory = tx.category && fuzzyMatch(tx.category, q)
    if (matchNote || matchCategory) {
      results.push({ kind: 'transaction', transaction: tx })
    }
  }
  return results
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const navigate = useNavigate()
  const { data: transactions } = useTransactions()

  // ── Open / close ──────────────────────────────────────────────────────────



  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  // ── Keyboard shortcut: Cmd+K / Ctrl+K ─────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => {
          if (prev) {
            // Closing
            setQuery('')
            setSelectedIndex(0)
            return false
          }
          // Opening
          setQuery('')
          setSelectedIndex(0)
          return true
        })
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ── Open via sidebar search button (custom event) ───────────────────────

  useEffect(() => {
    const handler = () => {
      setIsOpen(true)
      setQuery('')
      setSelectedIndex(0)
    }
    document.addEventListener('open-command-palette', handler)
    return () => document.removeEventListener('open-command-palette', handler)
  }, [])

  // ── Focus input when opened ───────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      // Small delay to allow the animation to start
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [isOpen])

  // ── Build search results (deferred to avoid blocking input on every keystroke) ──

  const deferredQuery = useDeferredValue(query)

  const results: PaletteResult[] = useMemo(() => {
    const items: PaletteResult[] = []
    const q = deferredQuery.trim()

    // If no query, show all pages
    if (!q) {
      for (const entry of PAGE_ENTRIES) {
        items.push({ kind: 'page', entry })
      }
      return items
    }

    // Search pages
    for (const entry of PAGE_ENTRIES) {
      const matchesLabel = fuzzyMatch(entry.label, q)
      const matchesKeyword = entry.keywords.some((kw) => fuzzyMatch(kw, q))
      if (matchesLabel || matchesKeyword) {
        items.push({ kind: 'page', entry })
      }
    }

    // Search transactions (top 5 matches by note or category)
    items.push(...searchTransactions(transactions, q))

    return items
  }, [deferredQuery, transactions])

  // selectedIndex is reset via the query input's onChange handler below

  // ── Execute action on selected item ───────────────────────────────────────

  const executeResult = useCallback(
    (result: PaletteResult) => {
      if (result.kind === 'page') {
        navigate(result.entry.path)
      } else {
        // Navigate to transactions page for transaction results
        navigate(ROUTES.TRANSACTIONS)
      }
      close()
    },
    [navigate, close],
  )

  // ── Keyboard navigation within the list ───────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (results[selectedIndex]) {
            executeResult(results[selectedIndex])
          }
          break
        }
        case 'Escape': {
          e.preventDefault()
          close()
          break
        }
      }
    },
    [results, selectedIndex, executeResult, close],
  )

  // ── Scroll selected item into view ────────────────────────────────────────

  useEffect(() => {
    if (!listRef.current) return
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
    selectedEl?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(0, 0, 0, 0.60)', backdropFilter: 'blur(12px)' }}
            onClick={close}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            className="relative w-full max-w-xl mx-4 rounded-2xl overflow-hidden shadow-2xl glass-strong border border-white/10"
            style={{
              boxShadow: `0 25px 60px rgba(0, 0, 0, 0.5), 0 0 80px ${rawColors.ios.blue}15`,
            }}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <Search
                size={20}
                className="flex-shrink-0"
                style={{ color: rawColors.ios.blue }}
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
                onKeyDown={handleKeyDown}
                placeholder="Search pages, transactions..."
                className="flex-1 bg-transparent text-white text-base placeholder:text-white/30 outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd
                className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium"
                style={{
                  color: rawColors.text.tertiary,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                ESC
              </kbd>
            </div>

            {/* Results list */}
            <ul
              ref={listRef}
              className="max-h-[50vh] overflow-y-auto overflow-x-hidden py-2 scrollbar-none list-none m-0 p-0"
              aria-label="Search results"
            >
              {results.length === 0 && query.trim() !== '' && (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm" style={{ color: rawColors.text.secondary }}>
                    No results for "{query}"
                  </p>
                </div>
              )}

              {/* Page results section */}
              {results.some((r) => r.kind === 'page') && (
                <div>
                  <div
                    className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: rawColors.text.tertiary }}
                  >
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
                        <li
                          key={page.path}
                          data-index={index}
                        >
                          <button
                            data-selected={isSelected}
                            className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors duration-100 cursor-pointer"
                            style={{
                              background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                            }}
                            onClick={() => executeResult(result)}
                            onMouseEnter={() => setSelectedIndex(index)}
                          >
                            <div
                              className="p-1.5 rounded-lg flex-shrink-0"
                              style={{
                                background: isSelected
                                  ? `${rawColors.ios.blue}20`
                                  : 'rgba(255, 255, 255, 0.06)',
                              }}
                            >
                              <Icon
                                size={16}
                                style={{
                                  color: isSelected ? rawColors.ios.blue : rawColors.text.secondary,
                                }}
                              />
                            </div>
                            <span
                              className="flex-1 text-sm font-medium"
                              style={{
                                color: isSelected ? '#ffffff' : rawColors.text.secondary,
                              }}
                            >
                              {page.label}
                            </span>
                            {isSelected && (
                              <ArrowRight
                                size={14}
                                style={{ color: rawColors.text.tertiary }}
                              />
                            )}
                          </button>
                        </li>
                      )
                    })}
                </div>
              )}

              {/* Transaction results section */}
              {results.some((r) => r.kind === 'transaction') && (
                <div>
                  <div
                    className="px-5 py-1.5 mt-1 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: rawColors.text.tertiary }}
                  >
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
                        iconBgColor = isIncome
                          ? `${rawColors.ios.green}20`
                          : `${rawColors.ios.red}20`
                      }

                      let iconColor = rawColors.text.secondary
                      if (isSelected) {
                        iconColor = isIncome
                          ? rawColors.ios.green
                          : rawColors.ios.red
                      }

                      return (
                        <li
                          key={tx.id}
                          data-index={index}
                        >
                          <button
                            data-selected={isSelected}
                            className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors duration-100 cursor-pointer"
                            style={{
                              background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                            }}
                            onClick={() => executeResult(result)}
                            onMouseEnter={() => setSelectedIndex(index)}
                          >
                            <div
                              className="p-1.5 rounded-lg flex-shrink-0"
                              style={{ background: iconBgColor }}
                            >
                              <Receipt
                                size={16}
                                style={{ color: iconColor }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-sm font-medium truncate"
                                style={{
                                  color: isSelected ? '#ffffff' : rawColors.text.secondary,
                                }}
                              >
                                {tx.note || tx.category}
                              </p>
                              <p
                                className="text-xs truncate"
                                style={{ color: rawColors.text.tertiary }}
                              >
                                {tx.category}
                                {tx.account ? ` \u00b7 ${tx.account}` : ''}
                              </p>
                            </div>
                            <span
                              className="text-sm font-semibold flex-shrink-0"
                              style={{
                                color: isIncome ? rawColors.ios.green : rawColors.ios.red,
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

            {/* Footer with hints */}
            <div
              className="flex items-center justify-between px-5 py-3 border-t border-white/10"
              style={{ background: 'rgba(0, 0, 0, 0.15)' }}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs" style={{ color: rawColors.text.tertiary }}>
                  <kbd
                    className="inline-flex items-center justify-center w-5 h-5 rounded"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      fontSize: '10px',
                      color: rawColors.text.tertiary,
                    }}
                  >
                    &uarr;
                  </kbd>
                  <kbd
                    className="inline-flex items-center justify-center w-5 h-5 rounded"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      fontSize: '10px',
                      color: rawColors.text.tertiary,
                    }}
                  >
                    &darr;
                  </kbd>
                  <span className="ml-1">Navigate</span>
                </span>
                <span className="flex items-center gap-1 text-xs" style={{ color: rawColors.text.tertiary }}>
                  <kbd
                    className="inline-flex items-center justify-center px-1.5 h-5 rounded"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      fontSize: '10px',
                      color: rawColors.text.tertiary,
                    }}
                  >
                    &crarr;
                  </kbd>
                  <span className="ml-1">Open</span>
                </span>
              </div>
              <span className="flex items-center gap-1 text-xs" style={{ color: rawColors.text.quaternary }}>
                <Command size={12} />
                <span>K to toggle</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
