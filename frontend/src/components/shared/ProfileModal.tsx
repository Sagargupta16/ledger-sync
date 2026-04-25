/**
 * ProfileModal
 *
 * Full-screen modal showing user profile, account actions (edit name,
 * reset account, delete account), and sign-out.  Migrated from the old
 * AccountManagementTab so all account operations live in one place.
 *
 * Overlay + premium design system pattern matches ConfirmDialog.
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Pencil,
  Check,
  RotateCcw,
  Trash2,
  LogOut,
  ChevronDown,
  ChevronUp,
  Shield,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import {
  useLogout,
  useUpdateProfile,
  useDeleteAccount,
  useResetAccount,
} from '@/hooks/api/useAuth'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { rawColors } from '@/constants/colors'

interface ProfileModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export default function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  return (
    <AnimatePresence>
      {open && <ProfileModalContent onClose={() => onOpenChange(false)} />}
    </AnimatePresence>
  )
}

/** Inner content — mounts/unmounts with modal so local state resets naturally */
function ProfileModalContent({ onClose }: Readonly<{ onClose: () => void }>) {
  const { user } = useAuthStore()
  const logout = useLogout()
  const updateProfile = useUpdateProfile()
  const deleteAccount = useDeleteAccount()
  const resetAccount = useResetAccount()
  const navigate = useNavigate()

  // Edit name state (resets on mount)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(user?.full_name || '')

  // Reset account state
  const [showTxResetConfirm, setShowTxResetConfirm] = useState(false)
  const [showFullResetConfirm, setShowFullResetConfirm] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const handleClose = useCallback(() => onClose(), [onClose])

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleClose])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveName = () => {
    const trimmed = nameInput.trim()
    if (!trimmed) {
      toast.error('Name cannot be empty')
      return
    }
    updateProfile.mutate(trimmed, {
      onSuccess: () => {
        toast.success('Name updated')
        setIsEditingName(false)
      },
      onError: () => toast.error('Failed to update name'),
    })
  }

  const handleReset = (mode: 'full' | 'transactions') => {
    resetAccount.mutate(mode, {
      onSuccess: () => {
        const msg = mode === 'transactions'
          ? 'Transactions cleared. Preferences preserved.'
          : 'Account reset successfully. All data cleared.'
        toast.success(msg)
        setShowTxResetConfirm(false)
        setShowFullResetConfirm(false)
        setResetConfirmText('')
        globalThis.location.reload()
      },
      onError: () => toast.error('Failed to reset account.'),
    })
  }

  const handleDelete = () => {
    deleteAccount.mutate(undefined, {
      onSuccess: () => {
        toast.success('Account deleted successfully')
        handleClose()
        logout.mutate(undefined, {
          onSuccess: () => { navigate('/') },
          onSettled: () => { navigate('/') },
        })
      },
      onError: () => toast.error('Failed to delete account.'),
    })
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        handleClose()
        navigate('/')
      },
    })
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const initials = user
    ? (user.full_name || user.email)[0].toUpperCase()
    : '?'

  const displayName = user?.full_name || user?.email.split('@')[0] || 'User'

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  const providerLabel = user?.auth_provider
    ? user.auth_provider.charAt(0).toUpperCase() + user.auth_provider.slice(1)
    : 'Email'

  return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="max-w-lg w-full bg-[#1a1a1c] rounded-2xl border border-white/[0.08] p-0 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ─── Profile Header ─────────────────────────────────────── */}
            <div
              className="relative px-6 pt-6 pb-5"
              style={{
                background: `linear-gradient(135deg, ${rawColors.app.purple}20, ${rawColors.app.indigo}12, transparent)`,
              }}
            >
              {/* Close button */}
              <button
                type="button"
                onClick={handleClose}
                className="absolute top-4 right-4 w-11 h-11 sm:w-8 sm:h-8 rounded-lg bg-transparent hover:bg-white/[0.06] flex items-center justify-center transition-colors duration-150 ease-out"
              >
                <X size={16} className="text-text-tertiary hover:text-white" />
              </button>

              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${rawColors.app.purple}, ${rawColors.app.pink})`,
                    boxShadow: `0 8px 24px ${rawColors.app.purple}40`,
                  }}
                >
                  <span className="text-white font-bold text-xl">{initials}</span>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-white truncate">
                    {displayName}
                  </h2>
                  <p className="text-sm text-muted-foreground truncate">
                    {user?.email}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-xs text-muted-foreground">
                      <Shield size={10} />
                      {providerLabel}
                    </span>
                    {memberSince && (
                      <span className="text-xs text-text-tertiary">
                        Since {memberSince}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Account Actions ────────────────────────────────────── */}
            <div className="px-6 py-4 space-y-3">
              {/* Edit Name */}
              <div className="rounded-xl bg-white/[0.04] border border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pencil size={14} className="text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Display Name</span>
                  </div>
                  {!isEditingName && (
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(user?.full_name || '')
                        setIsEditingName(true)
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors duration-150 ease-out"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {isEditingName ? (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName()
                        if (e.key === 'Escape') setIsEditingName(false)
                      }}
                      autoFocus
                      className="flex-1 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-sm focus:border-blue-500/50 focus:outline-none transition-colors duration-150 ease-out"
                      placeholder="Your name"
                    />
                    <button
                      type="button"
                      onClick={handleSaveName}
                      disabled={updateProfile.isPending}
                      className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors duration-150 ease-out disabled:opacity-50"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      className="p-1.5 rounded-lg bg-white/[0.06] text-muted-foreground hover:bg-white/[0.10] transition-colors duration-150 ease-out"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-white mt-1">
                    {user?.full_name || 'Not set'}
                  </p>
                )}
              </div>

              {/* Reset Transactions */}
              <div className="rounded-xl border border-orange-500/15 bg-orange-500/5 p-4">
                <button
                  type="button"
                  onClick={() => { setShowTxResetConfirm((v) => !v); setShowFullResetConfirm(false); setResetConfirmText('') }}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw size={14} className="text-orange-400" />
                    <span className="text-sm font-medium text-orange-400">
                      Reset Transactions
                    </span>
                  </div>
                  {showTxResetConfirm ? (
                    <ChevronUp size={14} className="text-orange-400" />
                  ) : (
                    <ChevronDown size={14} className="text-orange-400" />
                  )}
                </button>

                <AnimatePresence>
                  {showTxResetConfirm && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Clears all transactions, import history, and analytics.
                          Your preferences, budgets, goals, and account classifications
                          will be preserved.
                        </p>
                        <p className="text-orange-400 text-xs font-medium">
                          Type{' '}
                          <span className="font-mono bg-orange-500/20 px-1 rounded">
                            RESET
                          </span>{' '}
                          to confirm:
                        </p>
                        <input
                          type="text"
                          value={resetConfirmText}
                          onChange={(e) => setResetConfirmText(e.target.value)}
                          placeholder="Type RESET to confirm"
                          className="w-full px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-sm focus:border-orange-500/50 focus:outline-none transition-colors duration-150 ease-out"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleReset('transactions')}
                            disabled={resetConfirmText !== 'RESET' || resetAccount.isPending}
                            className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/90 hover:bg-orange-500 text-white text-sm rounded-lg transition-colors duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {resetAccount.isPending
                              ? 'Resetting...'
                              : 'Clear Transactions'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowTxResetConfirm(false); setResetConfirmText('') }}
                            className="px-3 py-1.5 bg-white/[0.06] border border-white/[0.08] text-white text-sm rounded-lg hover:bg-white/[0.10] transition-colors duration-150 ease-out"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Complete Reset */}
              <div className="rounded-xl border border-amber-600/15 bg-amber-600/5 p-4">
                <button
                  type="button"
                  onClick={() => { setShowFullResetConfirm((v) => !v); setShowTxResetConfirm(false); setResetConfirmText('') }}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw size={14} className="text-amber-500" />
                    <span className="text-sm font-medium text-amber-500">
                      Complete Reset
                    </span>
                  </div>
                  {showFullResetConfirm ? (
                    <ChevronUp size={14} className="text-amber-500" />
                  ) : (
                    <ChevronDown size={14} className="text-amber-500" />
                  )}
                </button>

                <AnimatePresence>
                  {showFullResetConfirm && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Permanently deletes all data -- transactions, preferences,
                          budgets, goals, import history, and analytics. Your account
                          and login method will be preserved.
                        </p>
                        <p className="text-amber-500 text-xs font-medium">
                          Type{' '}
                          <span className="font-mono bg-amber-500/20 px-1 rounded">
                            RESET
                          </span>{' '}
                          to confirm:
                        </p>
                        <input
                          type="text"
                          value={resetConfirmText}
                          onChange={(e) => setResetConfirmText(e.target.value)}
                          placeholder="Type RESET to confirm"
                          className="w-full px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none transition-colors duration-150 ease-out"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleReset('full')}
                            disabled={resetConfirmText !== 'RESET' || resetAccount.isPending}
                            className="flex items-center gap-2 px-3 py-1.5 bg-amber-600/90 hover:bg-amber-600 text-white text-sm rounded-lg transition-colors duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {resetAccount.isPending
                              ? 'Resetting...'
                              : 'Yes, Reset Everything'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowFullResetConfirm(false); setResetConfirmText('') }}
                            className="px-3 py-1.5 bg-white/[0.06] border border-white/[0.08] text-white text-sm rounded-lg hover:bg-white/[0.10] transition-colors duration-150 ease-out"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Delete Account */}
              <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-4">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm((v) => !v)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Trash2 size={14} className="text-red-400" />
                    <span className="text-sm font-medium text-red-400">
                      Delete Account
                    </span>
                  </div>
                  {showDeleteConfirm ? (
                    <ChevronUp size={14} className="text-red-400" />
                  ) : (
                    <ChevronDown size={14} className="text-red-400" />
                  )}
                </button>

                <AnimatePresence>
                  {showDeleteConfirm && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Permanently delete your account and all associated data.
                          This action cannot be undone.
                        </p>
                        <p className="text-red-400 text-xs font-medium">
                          Type{' '}
                          <span className="font-mono bg-red-500/20 px-1 rounded">
                            DELETE
                          </span>{' '}
                          to confirm:
                        </p>
                        <input
                          type="text"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="Type DELETE to confirm"
                          className="w-full px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-sm focus:border-red-500/50 focus:outline-none transition-colors duration-150 ease-out"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleDelete}
                            disabled={
                              deleteConfirmText !== 'DELETE' ||
                              deleteAccount.isPending
                            }
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/90 hover:bg-red-500 text-white text-sm rounded-lg transition-colors duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {deleteAccount.isPending
                              ? 'Deleting...'
                              : 'Permanently Delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowDeleteConfirm(false)
                              setDeleteConfirmText('')
                            }}
                            className="px-3 py-1.5 bg-white/[0.06] border border-white/[0.08] text-white text-sm rounded-lg hover:bg-white/[0.10] transition-colors duration-150 ease-out"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ─── Sign Out Footer ────────────────────────────────────── */}
            <div className="px-6 py-4 border-t border-border">
              <button
                type="button"
                onClick={handleLogout}
                disabled={logout.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors duration-150 ease-out text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogOut size={16} />
                <span>{logout.isPending ? 'Signing out...' : 'Sign Out'}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
  )
}
