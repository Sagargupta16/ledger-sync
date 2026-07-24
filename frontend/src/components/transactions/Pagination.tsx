import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Select } from '@/components/ui'

interface PaginationProps {
  currentPage: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange: (itemsPerPage: number) => void
}

export default function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: Readonly<PaginationProps>) {
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <div className="bg-[var(--overlay-2)] border border-border rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Items per page */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-tertiary">Show</span>
          <Select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            options={[10, 25, 50, 100].map((value) => ({
              value: String(value),
              label: String(value),
            }))}
            className="w-20"
            aria-label="Transactions per page"
          />
          <span className="text-sm text-text-tertiary">per page</span>
        </div>

        {/* Page info -- hidden on the narrowest phones to keep the controls roomy */}
        <div className="hidden sm:block text-sm text-text-tertiary">
          Showing <span className="font-medium text-foreground">{startItem}</span> to{' '}
          <span className="font-medium text-foreground">{endItem}</span> of{' '}
          <span className="font-medium text-foreground">{totalItems}</span> transactions
        </div>

        {/* Pagination controls */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Previous page"
            className="p-0 text-text-tertiary disabled:opacity-30"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }

              return (
                <Button
                  key={pageNum}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                  aria-current={currentPage === pageNum ? 'page' : undefined}
                  className={`px-3 ${currentPage === pageNum
                      ? 'bg-app-blue/20 text-app-blue'
                      : 'text-muted-foreground'
                    }`}
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Next page"
            className="p-0 text-text-tertiary disabled:opacity-30"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
