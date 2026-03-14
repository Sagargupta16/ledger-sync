import { AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { useSubscriptionTracker } from './useSubscriptionTracker'
import { SummaryCards } from './SummaryCards'
import { SubscriptionDonutChart } from './SubscriptionDonutChart'
import { ManualSubscriptionForm } from './ManualSubscriptionForm'
import { SubscriptionList } from './SubscriptionList'

export default function SubscriptionTrackerPage() {
  const {
    isLoading,
    sortBy,
    setSortBy,
    showCreateForm,
    setShowCreateForm,
    editingManualId,
    setEditingManualId,
    confirmedDetected,
    manualSubs,
    sortedConfirmed,
    sortedUnconfirmed,
    sortedManual,
    summary,
    hasAnySubs,
    handleToggleConfirm,
    handleAddManual,
    handleEditManual,
    handleDeleteManual,
  } = useSubscriptionTracker()

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Subscription Tracker"
          subtitle="Track recurring expenses, subscriptions, and bills"
          action={
            <button
              onClick={() => { setShowCreateForm(!showCreateForm); setEditingManualId(null) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})` }}
            >
              <Plus className="w-4 h-4" /> Add Subscription
            </button>
          }
        />

        <SummaryCards isLoading={isLoading} summary={summary} />

        {/* Annual Subscription Cost Donut */}
        {!isLoading && (confirmedDetected.length > 0 || manualSubs.length > 0) && (
          <SubscriptionDonutChart
            confirmedDetected={confirmedDetected}
            manualSubs={manualSubs}
          />
        )}

        {/* Create Manual Subscription Form */}
        <AnimatePresence>
          {showCreateForm && (
            <ManualSubscriptionForm
              onSave={handleAddManual}
              onCancel={() => setShowCreateForm(false)}
            />
          )}
        </AnimatePresence>

        <SubscriptionList
          isLoading={isLoading}
          hasAnySubs={hasAnySubs}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortedConfirmed={sortedConfirmed}
          sortedUnconfirmed={sortedUnconfirmed}
          sortedManual={sortedManual}
          editingManualId={editingManualId}
          setEditingManualId={setEditingManualId}
          setShowCreateForm={setShowCreateForm}
          handleToggleConfirm={handleToggleConfirm}
          handleEditManual={handleEditManual}
          handleDeleteManual={handleDeleteManual}
        />
      </div>
    </div>
  )
}
