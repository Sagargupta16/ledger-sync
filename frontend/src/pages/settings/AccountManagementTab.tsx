/**
 * Account Management Tab
 *
 * User account info display, account reset, and account deletion
 * with password confirmation flows.
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
  const [resetPassword, setResetPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')

  return (
    <div className="space-y-6">
      {/* User Info Section */}
      <div className="glass rounded-lg p-5 border border-border">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <UserCog className="w-5 h-5 text-primary" />
          Account Information
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted-foreground">Email</span>
            <span className="text-white">{user?.email || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted-foreground">Name</span>
            <span className="text-white">{user?.full_name || 'Not set'}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted-foreground">Account Status</span>
            <span
              className={`px-2 py-1 rounded text-xs ${user?.is_active ? 'bg-ios-green/20 text-ios-green' : 'bg-ios-red/20 text-ios-red'}`}
            >
              {user?.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-muted-foreground">Member Since</span>
            <span className="text-white">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Reset Account Section */}
      <div className="glass rounded-lg p-5 border border-ios-orange/30 bg-ios-orange/5">
        <h3 className="text-lg font-semibold text-ios-orange mb-2 flex items-center gap-2">
          <RotateCcw className="w-5 h-5" />
          Reset Account
        </h3>
        <p className="text-muted-foreground text-sm mb-4">
          This will delete all your transactions, import history, and reset preferences to defaults.
          Your login credentials will be preserved.
        </p>
        {showResetConfirm ? (
          <div className="space-y-3 p-4 bg-ios-orange/10 rounded-lg border border-ios-orange/30">
            <p className="text-ios-orange text-sm font-medium">
              Enter your password to confirm account reset:
            </p>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3 py-2 bg-white/5 border border-ios-orange/30 rounded-lg text-white text-sm focus:border-ios-orange"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  resetAccount.mutate(resetPassword, {
                    onSuccess: () => {
                      toast.success('Account reset successfully. All data cleared.')
                      setShowResetConfirm(false)
                      setResetPassword('')
                      globalThis.location.reload()
                    },
                    onError: () => {
                      toast.error('Failed to reset account. Check your password.')
                    },
                  })
                }}
                disabled={!resetPassword || resetAccount.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-ios-orange text-black rounded-lg hover:bg-ios-orange transition-colors disabled:opacity-50"
              >
                {resetAccount.isPending ? 'Resetting...' : 'Yes, Reset Everything'}
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false)
                  setResetPassword('')
                }}
                className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ios-orange/20 text-ios-orange rounded-lg hover:bg-ios-orange/30 transition-colors border border-ios-orange/30"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Account Data
          </button>
        )}
      </div>

      {/* Delete Account Section */}
      <div className="glass rounded-lg p-5 border border-ios-red/30 bg-ios-red/5">
        <h3 className="text-lg font-semibold text-ios-red mb-2 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          Delete Account
        </h3>
        <p className="text-muted-foreground text-sm mb-4">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        {showDeleteConfirm ? (
          <div className="space-y-3 p-4 bg-ios-red/10 rounded-lg border border-ios-red/30">
            <p className="text-ios-red text-sm font-medium">
              This is permanent! Type{' '}
              <span className="font-mono bg-ios-red/20 px-1 rounded">DELETE</span> and enter your
              password to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="w-full px-3 py-2 bg-white/5 border border-ios-red/30 rounded-lg text-white text-sm focus:border-ios-red"
            />
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3 py-2 bg-white/5 border border-ios-red/30 rounded-lg text-white text-sm focus:border-ios-red"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  deleteAccount.mutate(deletePassword, {
                    onSuccess: () => {
                      toast.success('Account deleted successfully')
                    },
                    onError: () => {
                      toast.error('Failed to delete account. Check your password.')
                    },
                  })
                }}
                disabled={
                  deleteConfirmText !== 'DELETE' || !deletePassword || deleteAccount.isPending
                }
                className="flex items-center gap-2 px-4 py-2 bg-ios-red text-white rounded-lg hover:bg-ios-red transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteAccount.isPending ? 'Deleting...' : 'Permanently Delete'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteConfirmText('')
                  setDeletePassword('')
                }}
                className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ios-red/20 text-ios-red rounded-lg hover:bg-ios-red/30 transition-colors border border-ios-red/30"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        )}
      </div>
    </div>
  )
}
