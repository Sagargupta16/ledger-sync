import { CheckCircle2 } from 'lucide-react'
import type { PlacedBill } from '../types'

interface Props {
  source: PlacedBill['source']
}

export default function SourceBadge({ source }: Readonly<Props>) {
  if (source === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-app-green/15 text-app-green">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Confirmed
      </span>
    )
  }
  return null
}
