import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Command, Search } from 'lucide-react'

import { ROUTES } from '@/constants'
import { rawColors } from '@/constants/colors'
import { transactionsService } from '@/services/api/transactions'

import { PaletteResults } from './command-palette/PaletteResults'
import {
  PAGE_ENTRIES,
  fuzzyMatch,
  overlayVariants,
  panelVariants,
  type PaletteResult,
  type TransactionResult,
} from './command-palette/paletteData'

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const navigate = useNavigate()

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => {
          if (prev) {
            setQuery('')
            setSelectedIndex(0)
            return false
          }
          setQuery('')
          setSelectedIndex(0)
          return true
        })
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const handler = () => {
      setIsOpen(true)
      setQuery('')
      setSelectedIndex(0)
    }
    document.addEventListener('open-command-palette', handler)
    return () => document.removeEventListener('open-command-palette', handler)
  }, [])

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [isOpen])

  const deferredQuery = useDeferredValue(query)
  const q = deferredQuery.trim()

  // Transaction matches come from the server-side search endpoint (note /
  // category / account, top 5) instead of filtering the full ledger in the
  // browser. Only runs while the palette is open with a non-empty query.
  const { data: txMatches = [] } = useQuery({
    queryKey: ['command-palette-search', q],
    queryFn: () => transactionsService.getTransactions({ query: q, limit: 5 }),
    enabled: isOpen && q.length > 0,
    staleTime: 60_000,
  })

  const results: PaletteResult[] = useMemo(() => {
    const items: PaletteResult[] = []

    if (!q) {
      for (const entry of PAGE_ENTRIES) {
        items.push({ kind: 'page', entry })
      }
      return items
    }

    for (const entry of PAGE_ENTRIES) {
      const matchesLabel = fuzzyMatch(entry.label, q)
      const matchesKeyword = entry.keywords.some((kw) => fuzzyMatch(kw, q))
      if (matchesLabel || matchesKeyword) {
        items.push({ kind: 'page', entry })
      }
    }

    for (const transaction of txMatches.slice(0, 5)) {
      items.push({ kind: 'transaction', transaction } as TransactionResult)
    }

    return items
  }, [q, txMatches])

  const executeResult = useCallback(
    (result: PaletteResult) => {
      if (result.kind === 'page') {
        navigate(result.entry.path)
      } else {
        navigate(ROUTES.TRANSACTIONS)
      }
      close()
    },
    [navigate, close],
  )

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

  useEffect(() => {
    if (!listRef.current) return
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
    selectedEl?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] sm:pt-[15vh] px-4"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          <motion.div
            className="relative w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl bg-[#1a1a1c]/95 backdrop-blur-lg border border-white/[0.08] flex flex-col max-h-[80vh]"
            style={{
              boxShadow: `0 25px 60px rgba(0, 0, 0, 0.5), 0 0 80px ${rawColors.app.blue}10`,
            }}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.08]">
              <Search
                size={20}
                className="flex-shrink-0"
                style={{ color: rawColors.app.blue }}
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search pages, transactions..."
                className="flex-1 bg-transparent text-white text-base placeholder:text-text-quaternary outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-white/[0.06] border border-white/[0.08] text-xs font-medium text-text-tertiary">
                ESC
              </kbd>
            </div>

            <PaletteResults
              results={results}
              query={query}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
              executeResult={executeResult}
              listRef={listRef}
            />

            <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.08] bg-black/10">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs text-text-tertiary">
                  <kbd className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/[0.06] border border-white/[0.08] text-[10px] text-text-tertiary">
                    ↑
                  </kbd>
                  <kbd className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/[0.06] border border-white/[0.08] text-[10px] text-text-tertiary">
                    ↓
                  </kbd>
                  <span className="ml-1">Navigate</span>
                </span>
                <span className="flex items-center gap-1 text-xs text-text-tertiary">
                  <kbd className="inline-flex items-center justify-center px-1.5 h-5 rounded bg-white/[0.06] border border-white/[0.08] text-[10px] text-text-tertiary">
                    ↵
                  </kbd>
                  <span className="ml-1">Open</span>
                </span>
              </div>
              <span className="flex items-center gap-1 text-xs text-text-quaternary">
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
