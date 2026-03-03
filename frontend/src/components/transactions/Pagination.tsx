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
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Items per page */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500">Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-3 py-1 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors duration-150 cursor-pointer hover:bg-white/[0.06]"
          >
            <option value={10} className="bg-zinc-900 text-white">10</option>
            <option value={25} className="bg-zinc-900 text-white">25</option>
            <option value={50} className="bg-zinc-900 text-white">50</option>
            <option value={100} className="bg-zinc-900 text-white">100</option>
          </select>
          <span className="text-sm text-zinc-500">per page</span>
        </div>

        {/* Page info */}
        <div className="text-sm text-zinc-500">
          Showing <span className="font-medium text-white">{startItem}</span> to{' '}
          <span className="font-medium text-white">{endItem}</span> of{' '}
          <span className="font-medium text-white">{totalItems}</span> transactions
        </div>

        {/* Pagination controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
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
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-150 ${currentPage === pageNum
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'
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
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
