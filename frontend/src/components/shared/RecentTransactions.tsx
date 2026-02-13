import { memo } from 'react'
import { motion } from 'framer-motion'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { TrendingUp, TrendingDown, Calendar, Tag } from 'lucide-react'
import type { Transaction } from '@/types'
import { format } from 'date-fns'
import { formatCurrency } from '@/lib/formatters'

interface RecentTransactionsProps {
  transactions: Transaction[]
  isLoading?: boolean
}

// Memoized transaction row component
const TransactionRow = memo(function TransactionRow({
  transaction,
}: {
  transaction: Transaction
}) {
  return (
    <motion.div
      variants={fadeUpItem}
      className="flex items-center justify-between p-4 rounded-lg glass border border-white/10 hover:border-white/20 hover:shadow-lg transition-all duration-300 group"
    >
      <div className="flex items-center gap-4 flex-1">
        {/* Icon */}
        <div
          className={`p-2 rounded-lg shadow-lg transition-all duration-300 group-hover:scale-110 ${
            transaction.type === 'Income'
              ? 'bg-ios-green/20 text-ios-green shadow-ios-green/30'
              : 'bg-ios-red/20 text-ios-red shadow-ios-red/30'
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
        <p className={`font-semibold ${transaction.type === 'Income' ? 'text-ios-green' : 'text-ios-red'}`}>
          {transaction.type === 'Income' ? '+' : '-'}
          {formatCurrency(Math.abs(transaction.amount))}
        </p>
        {transaction.account && <p className="text-xs text-muted-foreground mt-1">{transaction.account}</p>}
      </div>
    </motion.div>
  )
})

function RecentTransactions({ transactions, isLoading }: Readonly<RecentTransactionsProps>) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => `skeleton-tx-${i}`).map((id) => (
          <div key={id} className="flex items-center justify-between p-4 rounded-lg border border-border animate-pulse">
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
    <motion.div
      className="space-y-2"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {transactions.map((transaction) => (
        <TransactionRow key={transaction.id} transaction={transaction} />
      ))}
    </motion.div>
  )
}

export default memo(RecentTransactions)
