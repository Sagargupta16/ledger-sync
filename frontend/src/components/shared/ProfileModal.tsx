// ProfileModal -- full-screen modal showing user profile + account actions
// (edit name, reset transactions, full reset, delete account, sign out).

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  useDeleteAccount,
  useLogout,
  useResetAccount,
  useUpdateProfile,
} from '@/hooks/api/useAuth'
import { useAuthStore } from '@/store/authStore'

import { DangerActionRow } from './profile-modal/DangerActionRow'
import { EditNameRow } from './profile-modal/EditNameRow'
import { LogoutButton } from './profile-modal/LogoutButton'
import { ProfileHeader } from './profile-modal/ProfileHeader'
import { deriveProfileDisplay, makeExclusiveResetToggle } from './profileModalUtils'

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

function ProfileModalContent({ onClose }: Readonly<{ onClose: () => void }>) {
  const { user } = useAuthStore()
  const logout = useLogout()
  const updateProfile = useUpdateProfile()
  const deleteAccount = useDeleteAccount()
  const resetAccount = useResetAccount()
  const navigate = useNavigate()

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(user?.full_name || '')

  const [showTxResetConfirm, setShowTxResetConfirm] = useState(false)
  const [showFullResetConfirm, setShowFullResetConfirm] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const handleClose = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleClose])

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
        const msg =
          mode === 'transactions'
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
          onSuccess: () => {
            navigate('/')
          },
          onSettled: () => {
            navigate('/')
          },
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

  const { initials, displayName, memberSince, providerLabel } = deriveProfileDisplay(user)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Profile and account settings"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="max-w-lg w-full bg-[#1a1a1c] rounded-2xl border border-white/[0.08] p-0 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ProfileHeader
          initials={initials}
          displayName={displayName}
          email={user?.email}
          providerLabel={providerLabel}
          memberSince={memberSince}
          onClose={handleClose}
        />

        <div className="px-6 py-4 space-y-3">
          <EditNameRow
            fullName={user?.full_name}
            isEditing={isEditingName}
            nameInput={nameInput}
            isPending={updateProfile.isPending}
            onStartEdit={() => {
              setNameInput(user?.full_name || '')
              setIsEditingName(true)
            }}
            onCancelEdit={() => setIsEditingName(false)}
            onChangeName={setNameInput}
            onSave={handleSaveName}
          />

          <DangerActionRow
            expanded={showTxResetConfirm}
            setExpanded={makeExclusiveResetToggle(
              setShowTxResetConfirm,
              setShowFullResetConfirm,
              setResetConfirmText,
            )}
            Icon={RotateCcw}
            title="Reset Transactions"
            toneText="text-orange-400"
            toneBorder="border-orange-500/15"
            toneBg="bg-orange-500/5"
            description="Clears all transactions, import history, and analytics. Your preferences, budgets, goals, and account classifications will be preserved."
            confirmKeyword="RESET"
            confirmKeywordBg="bg-orange-500/20"
            confirmText={resetConfirmText}
            setConfirmText={setResetConfirmText}
            inputBorderFocus="focus:border-orange-500/50"
            actionButton={{
              label: 'Clear Transactions',
              pendingLabel: 'Resetting...',
              bgClass: 'bg-orange-500/90 hover:bg-orange-500',
              onClick: () => handleReset('transactions'),
              pending: resetAccount.isPending,
            }}
          />

          <DangerActionRow
            expanded={showFullResetConfirm}
            setExpanded={makeExclusiveResetToggle(
              setShowFullResetConfirm,
              setShowTxResetConfirm,
              setResetConfirmText,
            )}
            Icon={RotateCcw}
            title="Complete Reset"
            toneText="text-amber-500"
            toneBorder="border-amber-600/15"
            toneBg="bg-amber-600/5"
            description="Permanently deletes all data -- transactions, preferences, budgets, goals, import history, and analytics. Your account and login method will be preserved."
            confirmKeyword="RESET"
            confirmKeywordBg="bg-amber-500/20"
            confirmText={resetConfirmText}
            setConfirmText={setResetConfirmText}
            inputBorderFocus="focus:border-amber-500/50"
            actionButton={{
              label: 'Yes, Reset Everything',
              pendingLabel: 'Resetting...',
              bgClass: 'bg-amber-600/90 hover:bg-amber-600',
              onClick: () => handleReset('full'),
              pending: resetAccount.isPending,
            }}
          />

          <DangerActionRow
            expanded={showDeleteConfirm}
            setExpanded={setShowDeleteConfirm}
            Icon={Trash2}
            title="Delete Account"
            toneText="text-red-400"
            toneBorder="border-red-500/15"
            toneBg="bg-red-500/5"
            description="Permanently delete your account and all associated data. This action cannot be undone."
            confirmKeyword="DELETE"
            confirmKeywordBg="bg-red-500/20"
            confirmText={deleteConfirmText}
            setConfirmText={setDeleteConfirmText}
            inputBorderFocus="focus:border-red-500/50"
            actionButton={{
              label: 'Permanently Delete',
              pendingLabel: 'Deleting...',
              bgClass: 'bg-red-500/90 hover:bg-red-500',
              onClick: handleDelete,
              pending: deleteAccount.isPending,
            }}
          />
        </div>

        <LogoutButton isPending={logout.isPending} onLogout={handleLogout} />
      </motion.div>
    </motion.div>
  )
}
