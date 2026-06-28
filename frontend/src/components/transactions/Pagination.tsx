import { ChevronLeft, ChevronRight } from 'lucide-react'

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
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-3 py-2.5 sm:py-1 min-h-[44px] sm:min-h-0 bg-[var(--overlay-2)] border border-[var(--hairline-2)] rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors duration-150 cursor-pointer hover:bg-[var(--overlay-3)]"
          >
            <option value={10} className="bg-surface-dropdown text-foreground">10</option>
            <option value={25} className="bg-surface-dropdown text-foreground">25</option>
            <option value={50} className="bg-surface-dropdown text-foreground">50</option>
            <option value={100} className="bg-surface-dropdown text-foreground">100</option>
          </select>
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
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Previous page"
            className="p-2.5 sm:p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg text-text-tertiary hover:text-foreground hover:bg-[var(--overlay-3)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

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
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`px-3 py-2.5 sm:py-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg text-sm font-medium transition-colors duration-150 ${currentPage === pageNum
                      ? 'bg-app-blue/20 text-app-blue'
                      : 'text-muted-foreground hover:bg-[var(--overlay-3)] hover:text-foreground'
                    }`}
                >
                  {pageNum}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Next page"
            className="p-2.5 sm:p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-lg text-text-tertiary hover:text-foreground hover:bg-[var(--overlay-3)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
