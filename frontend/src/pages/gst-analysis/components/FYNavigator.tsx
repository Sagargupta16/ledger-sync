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
    <fieldset className="m-0 flex min-w-0 items-center justify-between gap-2 border-0 p-0 sm:justify-start">
      <legend className="sr-only">Fiscal year</legend>
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
      <span className="min-w-[100px] flex-1 text-center text-sm font-medium sm:flex-none">
        {selectedFY}
      </span>
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
    </fieldset>
  )
}
