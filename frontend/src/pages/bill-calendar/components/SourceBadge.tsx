import { CheckCircle2, CreditCard, Landmark, Sparkles } from 'lucide-react'

import { STATUS_LABEL, STATUS_TONE } from '@/components/analytics/cardCyclesSummary'

import type { PlacedBill } from '../types'

interface Props {
  source: PlacedBill['source']
  cardStatus?: PlacedBill['cardStatus']
}

export default function SourceBadge({ source, cardStatus }: Readonly<Props>) {
  if (source === 'card') {
    const status = cardStatus ?? 'due'
    const Icon = status === 'paid' ? CheckCircle2 : CreditCard
    return (
      <span className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_TONE[status]}`}>
        <Icon className="w-2.5 h-2.5" />
        {status === 'due' ? 'Card due' : STATUS_LABEL[status]}
      </span>
    )
  }
  if (source === 'tax') {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-app-orange/15 text-app-orange">
        <Landmark className="w-2.5 h-2.5" />
        Tax date
      </span>
    )
  }
  if (source === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-app-green/15 text-app-green">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Confirmed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-app-blue/15 text-app-blue">
      <Sparkles className="w-2.5 h-2.5" />
      Detected
    </span>
  )
}
