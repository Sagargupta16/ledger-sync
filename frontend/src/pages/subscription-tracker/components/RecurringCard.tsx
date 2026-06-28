import { useState } from 'react'
import { Trash2, Pencil, Check, X, Power, PowerOff, RefreshCw, Calendar } from 'lucide-react'

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
      <div className="glass rounded-2xl border border-app-blue/30 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor={`e-n-${item.id}`} className="text-xs text-text-tertiary block mb-1">Name</label>
            <input id={`e-n-${item.id}`} type="text" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
              className="w-full px-3 py-1.5 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50" />
          </div>
          <div>
            <label htmlFor={`e-f-${item.id}`} className="text-xs text-text-tertiary block mb-1">Frequency</label>
            <select id={`e-f-${item.id}`} value={editFreq} onChange={(e) => setEditFreq(e.target.value)}
              className="w-full px-3 py-1.5 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50">
              {FREQUENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="max-w-[200px]">
          <label htmlFor={`e-a-${item.id}`} className="text-xs text-text-tertiary block mb-1">Amount</label>
          <input id={`e-a-${item.id}`} type="number" min={0} step="any" value={editAmt} onChange={(e) => setEditAmt(e.target.value)}
            className="w-full px-3 py-1.5 bg-surface-dropdown/80 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-app-blue/50" />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={saveEdit} className="flex items-center gap-1 px-3 py-2.5 min-h-11 sm:min-h-0 sm:py-1.5 rounded-lg text-sm font-medium bg-app-blue/20 text-app-blue hover:bg-app-blue/30 transition-colors">
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="flex items-center gap-1 px-3 py-2.5 min-h-11 sm:min-h-0 sm:py-1.5 rounded-lg text-sm text-muted-foreground bg-[var(--overlay-2)] hover:bg-[var(--overlay-5)] transition-colors">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`glass rounded-2xl border p-4 transition-colors duration-200 ${
      item.is_active ? 'border-border hover:border-[var(--hairline-5)]' : 'border-[var(--hairline-1)] opacity-50'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2 h-8 rounded-full shrink-0 ${isIncome ? 'bg-app-green' : 'bg-app-red'}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-foreground truncate">{item.name}</h3>
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
            <div className="flex items-center gap-3 mt-0.5 text-xs text-text-tertiary">
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
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className={`text-base font-bold ${isIncome ? 'text-app-green' : 'text-app-red'}`}>
              {formatCurrency(Math.abs(item.expected_amount))}
            </p>
            <p className="text-[11px] text-muted-foreground">{formatCurrency(monthly)}/mo</p>
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => { setEditName(item.name); setEditFreq(item.frequency ?? 'monthly'); setEditAmt(String(Math.abs(item.expected_amount))); setEditing(true) }}
              title="Edit" aria-label="Edit recurring item" className="flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1.5 rounded-lg text-text-tertiary hover:text-foreground hover:bg-[var(--overlay-5)] transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => onUpdate({ is_active: !item.is_active })}
              title={item.is_active ? 'Deactivate' : 'Activate'}
              aria-label={item.is_active ? 'Pause recurring item' : 'Activate recurring item'}
              className={`flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1.5 rounded-lg transition-colors ${item.is_active ? 'text-app-green hover:bg-app-green/10' : 'text-text-tertiary hover:bg-[var(--overlay-5)]'}`}>
              {item.is_active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={onDelete}
              title="Delete" aria-label="Delete recurring item" className="flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1.5 rounded-lg text-text-tertiary hover:text-app-red hover:bg-app-red/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
