import { CheckCircle, AlertCircle, Trash2, Copy, Clock } from 'lucide-react'
import { motion } from 'framer-motion'

import type { UploadStats } from '@/types'

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
      className="w-full bg-white/[0.04] border border-border rounded-2xl p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Upload Successful
          </h3>
          <p className="text-sm text-text-tertiary">{fileName}</p>
        </div>
        {uploadTime && (
          <div className="flex items-center gap-1 text-xs text-text-tertiary">
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
          color="text-app-green"
          bgColor="bg-app-green/10"
        />
        <StatCard
          icon={AlertCircle}
          label="Updated"
          value={stats.updated}
          color="text-app-blue"
          bgColor="bg-app-blue/10"
        />
        <StatCard
          icon={Trash2}
          label="Deleted"
          value={stats.deleted}
          color="text-app-red"
          bgColor="bg-app-red/10"
        />
        <StatCard
          icon={Copy}
          label="Skipped (Dupes)"
          value={stats.unchanged || 0}
          color="text-muted-foreground"
          bgColor="bg-white/[0.06]"
        />
      </div>

      {/* Summary */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-tertiary">Total Processed</span>
          <span className="font-semibold">{totalProcessed} transactions</span>
        </div>
        {totalChanges > 0 && (
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-text-tertiary">Changes Made</span>
            <span className="font-semibold text-app-blue">{totalChanges} transactions</span>
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
      className="flex items-center gap-3 p-4 bg-white/[0.04] border border-border rounded-xl transition-colors duration-150"
    >
      <div className={`p-2 rounded-lg ${bgColor}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-text-tertiary">{label}</p>
      </div>
    </motion.div>
  )
}
