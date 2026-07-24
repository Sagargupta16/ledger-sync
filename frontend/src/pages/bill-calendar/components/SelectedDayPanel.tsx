import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

import { Button } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'

import { formatShortDate } from '../billUtils'
import type { PlacedBill } from '../types'

import BillDetailItem from './BillDetailItem'

interface SelectedDayPanelProps {
  readonly viewYear: number
  readonly viewMonth: number
  readonly selectedDay: number | null
  readonly bills: PlacedBill[]
  readonly onClose: () => void
}

export default function SelectedDayPanel({
  viewYear,
  viewMonth,
  selectedDay,
  bills,
  onClose,
}: SelectedDayPanelProps) {
  const selectedDate =
    selectedDay === null ? '' : formatShortDate(viewYear, viewMonth, selectedDay)

  return (
    <AnimatePresence mode="wait">
      {selectedDay !== null && (
        <motion.section
          key={`detail-${selectedDay}`}
          aria-live="polite"
          aria-label={`Bills for ${selectedDate}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="glass overflow-hidden rounded-2xl border border-border p-4 sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">
              Bills for {selectedDate}
            </h2>
            <div className="flex items-center gap-2">
              {bills.length > 0 && (
                <span className="rounded-full bg-app-blue/15 px-2.5 py-1 text-xs font-medium text-app-blue">
                  {bills.length} bill{bills.length === 1 ? '' : 's'}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="Close day details"
                icon={<X className="h-4 w-4" />}
                className="p-1.5"
              />
            </div>
          </div>

          {bills.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No bills expected on this day.
            </p>
          ) : (
            <div className="space-y-2">
              {bills.map((bill) => (
                <BillDetailItem key={bill.key} bill={bill} />
              ))}
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Total for this day</span>
                <span className="text-sm font-bold text-foreground">
                  {formatCurrency(bills.reduce((sum, bill) => sum + bill.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  )
}
