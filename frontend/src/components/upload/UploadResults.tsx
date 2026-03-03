import type { UploadStats } from '@/types'
import { CheckCircle, AlertCircle, Trash2, Copy, Clock } from 'lucide-react'
import { motion } from 'framer-motion'

interface UploadResultsProps {
  stats: UploadStats
  fileName: string
  uploadTime?: Date
}

export default function UploadResults({ stats, fileName, uploadTime }: Readonly<UploadResultsProps>) {
  const totalChanges = stats.inserted + stats.updated + stats.deleted
  const totalProcessed = totalChanges + (stats.unchanged || 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Upload Successful
          </h3>
          <p className="text-sm text-zinc-500">{fileName}</p>
        </div>
        {uploadTime && (
          <div className="flex items-center gap-1 text-xs text-zinc-500">
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
          color="text-ios-green"
          bgColor="bg-ios-green/10"
        />
        <StatCard
          icon={AlertCircle}
          label="Updated"
          value={stats.updated}
          color="text-ios-blue"
          bgColor="bg-ios-blue/10"
        />
        <StatCard
          icon={Trash2}
          label="Deleted"
          value={stats.deleted}
          color="text-ios-red"
          bgColor="bg-ios-red/10"
        />
        <StatCard
          icon={Copy}
          label="Skipped (Dupes)"
          value={stats.unchanged || 0}
          color="text-zinc-400"
          bgColor="bg-white/[0.06]"
        />
      </div>

      {/* Summary */}
      <div className="pt-4 border-t border-white/[0.06]">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">Total Processed</span>
          <span className="font-semibold">{totalProcessed} transactions</span>
        </div>
        {totalChanges > 0 && (
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-zinc-500">Changes Made</span>
            <span className="font-semibold text-ios-blue">{totalChanges} transactions</span>
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

function StatCard({ icon: Icon, label, value, color, bgColor }: Readonly<StatCardProps>) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      className="flex items-center gap-3 p-4 bg-white/[0.04] border border-white/[0.06] rounded-xl transition-colors duration-150"
    >
      <div className={`p-2 rounded-lg ${bgColor}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </motion.div>
  )
}
