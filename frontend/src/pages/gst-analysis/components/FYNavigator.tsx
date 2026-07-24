import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui'

interface Props {
  fiscalYears: string[]
  selectedFY: string
  onSelect: (fiscalYear: string) => void
}

export default function FYNavigator({
  fiscalYears,
  selectedFY,
  onSelect,
}: Readonly<Props>) {
  const selectedIndex = fiscalYears.indexOf(selectedFY)

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        icon={<ChevronLeft className="w-4 h-4" />}
        onClick={() =>
          selectedIndex < fiscalYears.length - 1 && onSelect(fiscalYears[selectedIndex + 1])
        }
        disabled={selectedIndex >= fiscalYears.length - 1}
        aria-label="Previous fiscal year"
        className="px-2.5 sm:px-1.5"
      />
      <span className="text-sm font-medium min-w-[100px] text-center">{selectedFY}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        icon={<ChevronRight className="w-4 h-4" />}
        onClick={() => selectedIndex > 0 && onSelect(fiscalYears[selectedIndex - 1])}
        disabled={selectedIndex <= 0}
        aria-label="Next fiscal year"
        className="px-2.5 sm:px-1.5"
      />
    </div>
  )
}
