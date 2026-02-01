import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Save, RotateCcw, GripVertical } from 'lucide-react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/formatters'

const ACCOUNT_TYPES = ['Cash', 'Bank Accounts', 'Credit Cards', 'Investments', 'Loans', 'Other Wallets']

const CATEGORY_COLORS: Record<string, string> = {
  'Cash': 'from-green-500 to-emerald-600',
  'Bank Accounts': 'from-blue-500 to-cyan-600',
  'Credit Cards': 'from-orange-500 to-red-600',
  'Investments': 'from-purple-500 to-pink-600',
  'Loans': 'from-red-500 to-orange-600',
  'Other Wallets': 'from-indigo-500 to-blue-600',
}

export default function SettingsPage() {
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const [classifications, setClassifications] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [classificationsLoading, setClassificationsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draggedAccount, setDraggedAccount] = useState<string | null>(null)

  // Calculate accounts from balance data
  const accounts = useMemo(() => {
    const acc = balanceData?.accounts || {}
    return Object.keys(acc)
      .filter((name) => acc[name].balance !== 0)
      .sort((a, b) => a.localeCompare(b))
  }, [balanceData])

  // Function to get intelligent defaults based on account names
  const getDefaultClassifications = (accountNames: string[]): Record<string, string> => {
    const defaults: Record<string, string> = {}
    
    accountNames.forEach((name) => {
      const lowerName = name.toLowerCase()
      
      if (lowerName.includes('credit card') || lowerName.includes('cc ') || lowerName.includes('amex') || lowerName.includes('visa')) {
        defaults[name] = 'Credit Cards'
      } else if (lowerName.includes('bank') || lowerName.includes('checking') || lowerName.includes('current') || lowerName.includes('salary')) {
        defaults[name] = 'Bank Accounts'
      } else if (lowerName.includes('savings')) {
        defaults[name] = 'Bank Accounts'
      } else if (lowerName.includes('cash') || lowerName.includes('wallet')) {
        defaults[name] = 'Cash'
      } else if (lowerName.includes('investment') || lowerName.includes('mutual') || lowerName.includes('stock') || lowerName.includes('equity') || lowerName.includes('portfolio') || lowerName.includes('demat')) {
        defaults[name] = 'Investments'
      } else if (lowerName.includes('loan') || lowerName.includes('debt') || lowerName.includes('emi')) {
        defaults[name] = 'Loans'
      } else if (lowerName.includes('gpay') || lowerName.includes('paypal') || lowerName.includes('upi')) {
        defaults[name] = 'Other Wallets'
      } else {
        defaults[name] = 'Other Wallets'
      }
    })
    
    return defaults
  }

  // Load existing classifications
  useEffect(() => {
    const loadClassifications = async () => {
      setClassificationsLoading(true)
      setError(null)
      try {
        const data = await accountClassificationsService.getAllClassifications()
        console.log('Loaded classifications:', data)
        
        // Fill in defaults for accounts without classifications
        const withDefaults = { ...getDefaultClassifications(accounts), ...data }
        setClassifications(withDefaults)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to load account classifications'
        console.error('Error loading classifications:', error)
        setError(errorMsg)
        toast.error(errorMsg)
      } finally {
        setClassificationsLoading(false)
      }
    }
    loadClassifications()
  }, [accounts])

  const handleDragStart = (accountName: string) => {
    setDraggedAccount(accountName)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDropOnCategory = (category: string) => {
    if (draggedAccount) {
      setClassifications((prev) => ({
        ...prev,
        [draggedAccount]: category,
      }))
      setHasChanges(true)
      setDraggedAccount(null)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const originalClassifications = await accountClassificationsService.getAllClassifications()

      for (const [accountName, accountType] of Object.entries(classifications)) {
        const originalType = originalClassifications[accountName]
        if (originalType !== accountType) {
          await accountClassificationsService.setClassification(accountName, accountType)
        }
      }

      for (const accountName of Object.keys(originalClassifications)) {
        if (!classifications[accountName]) {
          await accountClassificationsService.deleteClassification(accountName)
        }
      }

      setHasChanges(false)
      toast.success('Account classifications saved successfully')
    } catch (error) {
      toast.error('Failed to save account classifications')
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    try {
      const data = await accountClassificationsService.getAllClassifications()
      setClassifications(data)
      setHasChanges(false)
      toast.success('Changes discarded')
    } catch (error) {
      console.error('Failed to reload classifications:', error)
      toast.error('Failed to reload classifications')
    }
  }

  if (classificationsLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-gray-400">Loading classifications...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Settings
          </h1>
          <div className="glass rounded-xl border border-white/10 p-8 shadow-lg">
            <p className="text-red-400">Error: {error}</p>
          </div>
        </div>
      </div>
    )
  }

  // Organize accounts by category
  const accountsByCategory = ACCOUNT_TYPES.reduce((acc, category) => {
    acc[category] = accounts.filter((name) => classifications[name] === category)
    return acc
  }, {} as Record<string, string[]>)

  return (
    <div className="min-h-screen p-8 pb-32">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">Drag and drop accounts to organize them by category</p>
        </motion.div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ACCOUNT_TYPES.map((category, index) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onDragOver={handleDragOver}
              onDrop={() => handleDropOnCategory(category)}
              className={`glass rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 p-4 transition-all ${
                draggedAccount ? 'opacity-75' : ''
              }`}
            >
              {/* Category Header */}
              <div className={`bg-gradient-to-r ${CATEGORY_COLORS[category]} rounded-lg p-3 mb-3`}>
                <h2 className="text-lg font-bold text-white">{category}</h2>
                <p className="text-xs text-white/80 mt-0.5">
                  {accountsByCategory[category].length} account{accountsByCategory[category].length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Accounts List - Fixed height with scroll */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500/20 scrollbar-track-transparent pr-1">
                {accountsByCategory[category].length > 0 ? (
                  accountsByCategory[category].map((accountName) => (
                    <motion.div
                      key={accountName}
                      draggable
                      onDragStart={() => handleDragStart(accountName)}
                      className="flex items-center gap-2 px-2.5 py-2 bg-white/5 border border-white/10 rounded-md cursor-move hover:bg-white/10 hover:border-white/20 transition-all group text-sm"
                      whileHover={{ scale: 1.02 }}
                      whileDrag={{ scale: 0.95, opacity: 0.5 }}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-white/40 group-hover:text-white/60 transition-colors flex-shrink-0" />
                      <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                        <span className="font-medium text-white truncate">{accountName}</span>
                        {!balancesLoading && (
                          <span className="text-xs text-gray-400 whitespace-nowrap font-mono">
                            {formatCurrency(Math.abs(balanceData?.accounts[accountName]?.balance || 0))}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-20 text-gray-500 border-2 border-dashed border-white/10 rounded-lg">
                    <p className="text-xs">Drop here</p>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent p-8 border-t border-white/10"
        >
          <div className="max-w-7xl mx-auto flex gap-3 justify-end">
            <button
              onClick={handleReset}
              disabled={!hasChanges}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Discard Changes</span>
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg hover:shadow-primary/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
