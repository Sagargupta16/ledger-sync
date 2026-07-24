import { useState } from 'react'
import { Trash2, Pencil, Check, X, Power, PowerOff, RefreshCw, Calendar } from 'lucide-react'

import { Button, Input, Select } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'

import { FREQUENCY_OPTIONS } from '../constants'
import { toMonthlyAmount, capitalize, formatDate } from '../helpers'

export function RecurringCard({
  item,
  onUpdate,
  onDelete,
}: Readonly<{
  item: RecurringTransaction
  onUpdate: (patch: { pattern_name?: string; frequency?: string; expected_amount?: number; is_active?: boolean }) => void
  onDelete: () => void
}>) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(item.name)
  const [editFreq, setEditFreq] = useState(item.frequency ?? 'monthly')
  const [editAmt, setEditAmt] = useState(String(Math.abs(item.expected_amount)))

  const monthly = toMonthlyAmount(item.expected_amount, item.frequency)
  const isIncome = item.type === 'Income'

  const saveEdit = () => {
    const amt = Number(editAmt)
    if (!editName.trim() || Number.isNaN(amt) || amt <= 0) return
    onUpdate({ pattern_name: editName.trim(), frequency: editFreq, expected_amount: amt })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="glass space-y-3 rounded-xl border border-app-blue/30 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input
              id={`e-n-${item.id}`}
              label="Name"
              type="text"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              autoFocus
            />
          </div>
          <Select
            id={`e-f-${item.id}`}
            label="Frequency"
            value={editFreq}
            onChange={(event) => setEditFreq(event.target.value)}
            options={FREQUENCY_OPTIONS}
          />
        </div>
        <div className="w-full sm:max-w-[200px]">
          <Input
            id={`e-a-${item.id}`}
            label="Amount"
            type="number"
            min={0}
            step="any"
            value={editAmt}
            onChange={(event) => setEditAmt(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<Check className="h-3.5 w-3.5" />}
            onClick={saveEdit}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`glass rounded-xl border p-4 transition-colors duration-200 ${
      item.is_active ? 'border-border hover:border-[var(--hairline-5)]' : 'border-[var(--hairline-1)] opacity-50'
    }`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <div className={`h-8 w-2 shrink-0 rounded-full ${isIncome ? 'bg-app-green' : 'bg-app-red'}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-foreground truncate" title={item.name}>
                {item.name}
              </h3>
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${isIncome ? 'bg-app-green/10 text-app-green' : 'bg-app-red/10 text-app-red'}`}>
                {item.type}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-app-blue/10 text-app-blue">
                {capitalize(item.frequency)}
              </span>
              {!item.is_active && (
                <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--overlay-5)] text-text-tertiary">
                  Paused
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
              {item.category && <span>{item.category}</span>}
              {item.last_occurrence && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Last: {formatDate(item.last_occurrence)}
                </span>
              )}
              {item.next_expected && (
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Next: {formatDate(item.next_expected)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <div className="text-right">
            <p className={`whitespace-nowrap text-base font-bold tabular-nums ${isIncome ? 'text-app-green' : 'text-app-red'}`}>
              {formatCurrency(Math.abs(item.expected_amount))}
            </p>
            <p className="whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
              {formatCurrency(monthly)}/mo
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => {
                setEditName(item.name)
                setEditFreq(item.frequency ?? 'monthly')
                setEditAmt(String(Math.abs(item.expected_amount)))
                setEditing(true)
              }}
              title="Edit"
              aria-label="Edit recurring item"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={
                item.is_active
                  ? <Power className="h-3.5 w-3.5" />
                  : <PowerOff className="h-3.5 w-3.5" />
              }
              onClick={() => onUpdate({ is_active: !item.is_active })}
              title={item.is_active ? 'Deactivate' : 'Activate'}
              aria-label={item.is_active ? 'Pause recurring item' : 'Activate recurring item'}
              className={item.is_active ? 'text-app-green hover:bg-app-green/10' : undefined}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={onDelete}
              title="Delete"
              aria-label="Delete recurring item"
              className="text-text-tertiary hover:bg-app-red/10 hover:text-app-red"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
