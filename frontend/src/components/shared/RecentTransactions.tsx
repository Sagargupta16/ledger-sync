import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Calendar, Tag } from 'lucide-react'
import type { Transaction } from '@/types'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/formatters'

interface RecentTransactionsProps {
  transactions: Transaction[]
  isLoading?: boolean
}

export default function RecentTransactions({ transactions, isLoading }: RecentTransactionsProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 rounded-lg border border-border animate-pulse">
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted rounded w-1/4" />
            </div>
            <div className="h-6 bg-muted rounded w-20" />
          </div>
        ))}
      </div>
    )
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No transactions yet. Upload your first file to get started!</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {transactions.map((transaction, index) => (
        <motion.div
          key={transaction.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className="flex items-center justify-between p-4 rounded-lg glass border border-white/10 hover:border-white/20 hover:shadow-lg transition-all duration-300 group"
        >
          <div className="flex items-center gap-4 flex-1">
            {/* Icon */}
            <div
              className={`p-2 rounded-lg shadow-lg transition-all duration-300 group-hover:scale-110 ${
                transaction.type === 'Income'
                  ? 'bg-green-500/20 text-green-500 shadow-green-500/30'
                  : 'bg-red-500/20 text-red-500 shadow-red-500/30'
              }`}
            >
              {transaction.type === 'Income' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{transaction.note || transaction.category}</p>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(transaction.date), 'MMM dd, yyyy')}
                </span>
                {transaction.category && (
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {transaction.category}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Amount */}
          <div className="text-right">
            <p className={`font-semibold ${transaction.type === 'Income' ? 'text-green-500' : 'text-red-500'}`}>
              {transaction.type === 'Income' ? '+' : '-'}
              {formatCurrency(Math.abs(transaction.amount))}
            </p>
            {transaction.account && <p className="text-xs text-muted-foreground mt-1">{transaction.account}</p>}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
