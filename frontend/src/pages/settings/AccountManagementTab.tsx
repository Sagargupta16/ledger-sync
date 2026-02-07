/**
 * Account Management Tab
 *
 * User account info display, account reset, and account deletion
 * with confirmation flows.
 */

import { useState } from 'react'
import { UserCog, RotateCcw, Trash2 } from 'lucide-react'
import { useDeleteAccount, useResetAccount } from '@/hooks/api/useAuth'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

export default function AccountManagementTab() {
  const { user } = useAuthStore()
  const deleteAccount = useDeleteAccount()
  const resetAccount = useResetAccount()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  return (
    <div className="space-y-6">
      {/* User Info Section */}
      <div className="glass rounded-lg p-5 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <UserCog className="w-5 h-5 text-primary" />
          Account Information
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-gray-400">Email</span>
            <span className="text-white">{user?.email || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-gray-400">Name</span>
            <span className="text-white">{user?.full_name || 'Not set'}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-white/10">
            <span className="text-gray-400">Account Status</span>
            <span
              className={`px-2 py-1 rounded text-xs ${user?.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
            >
              {user?.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-400">Member Since</span>
            <span className="text-white">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Reset Account Section */}
      <div className="glass rounded-lg p-5 border border-amber-500/30 bg-amber-500/5">
        <h3 className="text-lg font-semibold text-amber-400 mb-2 flex items-center gap-2">
          <RotateCcw className="w-5 h-5" />
          Reset Account
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          This will delete all your transactions, import history, and reset preferences to defaults.
          Your login credentials will be preserved.
        </p>
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-all border border-amber-500/30"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Account Data
          </button>
        ) : (
          <div className="space-y-3 p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
            <p className="text-amber-300 text-sm font-medium">
              Are you sure? This will remove all your financial data!
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  resetAccount.mutate(undefined, {
                    onSuccess: () => {
                      toast.success('Account reset successfully. All data cleared.')
                      setShowResetConfirm(false)
                      window.location.reload()
                    },
                    onError: () => {
                      toast.error('Failed to reset account')
                    },
                  })
                }}
                disabled={resetAccount.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-all disabled:opacity-50"
              >
                {resetAccount.isPending ? 'Resetting...' : 'Yes, Reset Everything'}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Account Section */}
      <div className="glass rounded-lg p-5 border border-red-500/30 bg-red-500/5">
        <h3 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          Delete Account
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all border border-red-500/30"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        ) : (
          <div className="space-y-3 p-4 bg-red-500/10 rounded-lg border border-red-500/30">
            <p className="text-red-300 text-sm font-medium">
              This is permanent! Type{' '}
              <span className="font-mono bg-red-500/20 px-1 rounded">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="w-full px-3 py-2 bg-white/5 border border-red-500/30 rounded-lg text-white text-sm focus:border-red-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  deleteAccount.mutate(undefined, {
                    onSuccess: () => {
                      toast.success('Account deleted successfully')
                      // Redirect will happen automatically via logout
                    },
                    onError: () => {
                      toast.error('Failed to delete account')
                    },
                  })
                }}
                disabled={deleteConfirmText !== 'DELETE' || deleteAccount.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteAccount.isPending ? 'Deleting...' : 'Permanently Delete'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteConfirmText('')
                }}
                className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
