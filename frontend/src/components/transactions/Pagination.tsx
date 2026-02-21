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
    <div className="glass rounded-xl border border-border p-4 shadow-lg">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Items per page */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-3 py-1 bg-surface-dropdown/80 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors cursor-pointer hover:bg-surface-dropdown"
          >
            <option value={10} className="bg-surface-dropdown text-foreground">10</option>
            <option value={25} className="bg-surface-dropdown text-foreground">25</option>
            <option value={50} className="bg-surface-dropdown text-foreground">50</option>
            <option value={100} className="bg-surface-dropdown text-foreground">100</option>
          </select>
          <span className="text-sm text-muted-foreground">per page</span>
        </div>

        {/* Page info */}
        <div className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{startItem}</span> to{' '}
          <span className="font-medium text-foreground">{endItem}</span> of{' '}
          <span className="font-medium text-foreground">{totalItems}</span> transactions
        </div>

        {/* Pagination controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${currentPage === pageNum
                      ? 'bg-primary text-white shadow-lg shadow-primary/30'
                      : 'bg-white/5 hover:bg-white/10 border border-border'
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
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
