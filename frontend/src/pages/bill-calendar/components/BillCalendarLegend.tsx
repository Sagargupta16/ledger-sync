import { rawColors } from '@/constants/colors'

export default function BillCalendarLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3">
      <span className="text-xs text-text-tertiary">Legend:</span>
      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: rawColors.app.green }}
        />
        <span>Confirmed</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: rawColors.app.blue }}
        />
        <span>Detected</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
        <span className="flex items-end gap-0.5" aria-hidden="true">
          <span className="h-1 w-1 rounded-full bg-text-tertiary" />
          <span className="h-2 w-2 rounded-full bg-text-tertiary" />
        </span>
        <span>Bigger dot = larger amount</span>
      </div>
    </div>
  )
}
