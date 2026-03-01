/**
 * ProfileModal
 *
 * Full-screen modal showing user profile, account actions (edit name,
 * reset account, delete account), and sign-out.  Migrated from the old
 * AccountManagementTab so all account operations live in one place.
 *
 * Overlay + glass-card pattern matches ConfirmDialog.
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
  const [showResetConfirm, setShowResetConfirm] = useState(false)

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

  const handleReset = () => {
    resetAccount.mutate(undefined, {
      onSuccess: () => {
        toast.success('Account reset successfully. All data cleared.')
        setShowResetConfirm(false)
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
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="max-w-lg w-full glass-strong rounded-2xl border border-border p-0 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ─── Profile Header ─────────────────────────────────────── */}
            <div
              className="relative px-6 pt-6 pb-5"
              style={{
                background: `linear-gradient(135deg, ${rawColors.ios.purple}30, ${rawColors.ios.indigo}20, transparent)`,
              }}
            >
              {/* Close button */}
              <button
                type="button"
                onClick={handleClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X size={16} className="text-white" />
              </button>

              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${rawColors.ios.purple}, ${rawColors.ios.pink})`,
                    boxShadow: `0 8px 24px ${rawColors.ios.purple}40`,
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
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-xs text-muted-foreground">
                      <Shield size={10} />
                      {providerLabel}
                    </span>
                    {memberSince && (
                      <span className="text-xs text-muted-foreground">
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
              <div className="rounded-xl bg-white/5 border border-border p-4">
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
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
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
                      className="flex-1 px-3 py-1.5 bg-white/5 border border-border rounded-lg text-white text-sm focus:border-primary focus:outline-none"
                      placeholder="Your name"
                    />
                    <button
                      type="button"
                      onClick={handleSaveName}
                      disabled={updateProfile.isPending}
                      className="p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      className="p-1.5 rounded-lg bg-white/10 text-muted-foreground hover:bg-white/20 transition-colors"
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

              {/* Reset Account */}
              <div className="rounded-xl border border-ios-orange/30 bg-ios-orange/5 p-4">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm((v) => !v)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <RotateCcw size={14} className="text-ios-orange" />
                    <span className="text-sm font-medium text-ios-orange">
                      Reset Account
                    </span>
                  </div>
                  {showResetConfirm ? (
                    <ChevronUp size={14} className="text-ios-orange" />
                  ) : (
                    <ChevronDown size={14} className="text-ios-orange" />
                  )}
                </button>

                <AnimatePresence>
                  {showResetConfirm && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          This will delete all transactions, import history, and reset
                          preferences. Your account and login method will be preserved.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleReset}
                            disabled={resetAccount.isPending}
                            className="flex items-center gap-2 px-3 py-1.5 bg-ios-orange text-black text-sm rounded-lg hover:bg-ios-orange/90 transition-colors disabled:opacity-50"
                          >
                            {resetAccount.isPending
                              ? 'Resetting...'
                              : 'Yes, Reset Everything'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowResetConfirm(false)}
                            className="px-3 py-1.5 bg-white/10 text-white text-sm rounded-lg hover:bg-white/20 transition-colors"
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
              <div className="rounded-xl border border-ios-red/30 bg-ios-red/5 p-4">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm((v) => !v)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Trash2 size={14} className="text-ios-red" />
                    <span className="text-sm font-medium text-ios-red">
                      Delete Account
                    </span>
                  </div>
                  {showDeleteConfirm ? (
                    <ChevronUp size={14} className="text-ios-red" />
                  ) : (
                    <ChevronDown size={14} className="text-ios-red" />
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
                        <p className="text-ios-red text-xs font-medium">
                          Type{' '}
                          <span className="font-mono bg-ios-red/20 px-1 rounded">
                            DELETE
                          </span>{' '}
                          to confirm:
                        </p>
                        <input
                          type="text"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="Type DELETE to confirm"
                          className="w-full px-3 py-1.5 bg-white/5 border border-ios-red/30 rounded-lg text-white text-sm focus:border-ios-red focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleDelete}
                            disabled={
                              deleteConfirmText !== 'DELETE' ||
                              deleteAccount.isPending
                            }
                            className="flex items-center gap-2 px-3 py-1.5 bg-ios-red text-white text-sm rounded-lg hover:bg-ios-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                            className="px-3 py-1.5 bg-white/10 text-white text-sm rounded-lg hover:bg-white/20 transition-colors"
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
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ios-red/10 text-ios-red hover:bg-ios-red/20 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogOut size={16} />
                <span>{logout.isPending ? 'Signing out...' : 'Sign Out'}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
  )
}
