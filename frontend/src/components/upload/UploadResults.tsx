import type { UploadStats } from '@/types'
import { CheckCircle, AlertCircle, Trash2, Clock } from 'lucide-react'
import { motion } from 'framer-motion'

interface UploadResultsProps {
  stats: UploadStats
  fileName: string
  uploadTime?: Date
}

export default function UploadResults({ stats, fileName, uploadTime }: UploadResultsProps) {
  const totalChanges = stats.inserted + stats.updated + stats.deleted
  const totalProcessed = totalChanges + (stats.unchanged || 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full p-6 glass border border-white/10 rounded-2xl space-y-6 shadow-xl"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Upload Successful
          </h3>
          <p className="text-sm text-muted-foreground">{fileName}</p>
        </div>
        {uploadTime && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{uploadTime.toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={CheckCircle}
          label="Inserted"
          value={stats.inserted}
          color="text-green-500"
          bgColor="bg-green-500/20"
        />
        <StatCard
          icon={AlertCircle}
          label="Updated"
          value={stats.updated}
          color="text-blue-500"
          bgColor="bg-blue-500/20"
        />
        <StatCard
          icon={Trash2}
          label="Deleted"
          value={stats.deleted}
          color="text-red-500"
          bgColor="bg-red-500/20"
        />
        <StatCard
          icon={Clock}
          label="Unchanged"
          value={stats.unchanged || 0}
          color="text-gray-500"
          bgColor="bg-gray-500/20"
        />
      </div>

      {/* Summary */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total Processed</span>
          <span className="font-semibold">{totalProcessed} transactions</span>
        </div>
        {totalChanges > 0 && (
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-muted-foreground">Changes Made</span>
            <span className="font-semibold text-blue-500">{totalChanges} transactions</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: number
  color: string
  bgColor: string
}

function StatCard({ icon: Icon, label, value, color, bgColor }: StatCardProps) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      className="flex items-center gap-3 p-4 glass-strong rounded-xl border border-white/10 shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
    >
      <div className={`p-2 rounded-lg ${bgColor} shadow-lg`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </motion.div>
  )
}
