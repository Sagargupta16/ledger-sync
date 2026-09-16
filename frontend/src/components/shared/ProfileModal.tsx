// ProfileModal -- profile details and account actions
// (edit name, reset transactions, full reset, delete account, sign out).

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import { AnimatePresence, motion } from 'motion/react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  useDeleteAccount,
  useLogout,
  useResetAccount,
  useUpdateProfile,
} from '@/hooks/api/useAuth'
import { useAuthStore } from '@/store/authStore'
import { useMotionStore } from '@/store/motionStore'
import { DURATION, EASING } from '@/constants/animations'

import { DangerActionRow } from './profile-modal/DangerActionRow'
import { EditNameRow } from './profile-modal/EditNameRow'
import { LogoutButton } from './profile-modal/LogoutButton'
import { ProfileHeader, ProfileIdentity } from './profile-modal/ProfileHeader'
import { deriveProfileDisplay } from './profileModalUtils'

interface ProfileModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export default function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  return createPortal(
    <AnimatePresence>
      {open && <ProfileModalContent onClose={() => onOpenChange(false)} />}
    </AnimatePresence>,
    document.body,
  )
}

function ProfileModalContent({ onClose }: Readonly<{ onClose: () => void }>) {
  const { user } = useAuthStore()
  const logout = useLogout()
  const updateProfile = useUpdateProfile()
  const deleteAccount = useDeleteAccount()
  const resetAccount = useResetAccount()
  const navigate = useNavigate()
  const modalRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(user?.full_name || '')

  const [expandedAction, setExpandedAction] = useState<'transactions' | 'full' | 'delete' | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const isBusy = updateProfile.isPending || resetAccount.isPending || deleteAccount.isPending || logout.isPending
  const toggleAction = (action: 'transactions' | 'full' | 'delete', expanded: boolean) => {
    setExpandedAction(expanded ? action : null)
    setConfirmText('')
  }

  const handleClose = useCallback(() => onClose(), [onClose])
  const closeFromKeyboard = useEffectEvent(handleClose)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const modal = modalRef.current
    document.body.style.overflow = 'hidden'
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]'
    modal?.querySelector<HTMLElement>(focusableSelector)?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape') {
        e.preventDefault()
        closeFromKeyboard()
        return
      }
      if (e.key !== 'Tab' || !modal) return
      const controls = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.closest('[hidden], [inert], [aria-hidden="true"]'))
      const first = controls[0]
      const last = controls.at(-1)
      if (!first) {
        e.preventDefault()
        modal.focus()
      } else if (!modal.contains(document.activeElement)) {
        e.preventDefault()
        const nextFocus = e.shiftKey ? last : first
        nextFocus?.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  const handleSaveName = () => {
    if (isBusy) return
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
    if (isBusy || expandedAction !== mode || confirmText !== 'RESET') return
    resetAccount.mutate(mode, {
      onSuccess: () => {
        const msg =
          mode === 'transactions'
            ? 'Transactions cleared. Preferences preserved.'
            : 'Account reset successfully. All data cleared.'
        toast.success(msg)
        setExpandedAction(null)
        setConfirmText('')
        globalThis.location.reload()
      },
      onError: () => toast.error('Failed to reset account.'),
    })
  }

  const handleDelete = () => {
    if (isBusy || expandedAction !== 'delete' || confirmText !== 'DELETE') return
    deleteAccount.mutate(undefined, {
      onSuccess: () => {
        toast.success('Account deleted successfully')
        handleClose()
        // `void navigate(...)`: typed `void | Promise<void>` by react-router
        // but returns undefined under BrowserRouter (App.tsx). Delete/logout
        // failures are already surfaced by the onError toasts here.
        logout.mutate(undefined, {
          onSuccess: () => {
            void navigate('/')
          },
          onSettled: () => {
            void navigate('/')
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
        void navigate('/')
      },
    })
  }

  const { initials, displayName, memberSince, providerLabel } = deriveProfileDisplay(user)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--modal-backdrop)] p-3 sm:p-6"
      onClick={(event) => { if (event.target === event.currentTarget) handleClose() }}
    >
      <motion.div
        ref={modalRef}
        id="profile-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
        aria-describedby="profile-dialog-description"
        tabIndex={-1}
        initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown text-foreground shadow-[var(--glass-shadow-strong)] sm:max-h-[calc(100dvh-3rem)]"
      >
        <ProfileHeader onClose={handleClose} />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          <ProfileIdentity
            initials={initials}
            displayName={displayName}
            email={user?.email}
            providerLabel={providerLabel}
            memberSince={memberSince}
          />
          <section aria-labelledby="profile-details-title">
            <h3 id="profile-details-title" className="ledger-meta mb-3 text-text-tertiary">Profile details</h3>
            <EditNameRow
              fullName={user?.full_name}
              isEditing={isEditingName}
              nameInput={nameInput}
              isPending={isBusy}
              onStartEdit={() => {
                setNameInput(user?.full_name ?? '')
                setIsEditingName(true)
              }}
              onCancelEdit={() => setIsEditingName(false)}
              onChangeName={setNameInput}
              onSave={handleSaveName}
            />
          </section>

          <section aria-labelledby="profile-data-title" className="mt-6 border-t border-[var(--hairline-1)] pt-5">
            <h3 id="profile-data-title" className="text-sm font-semibold">Data &amp; account</h3>
            <p className="mt-1 mb-2 text-xs leading-5 text-muted-foreground">
              Choose what to clear. Each action requires confirmation.
            </p>
            <div className="divide-y divide-[var(--hairline-1)]">
              <DangerActionRow
                expanded={expandedAction === 'transactions'}
                setExpanded={(expanded) => toggleAction('transactions', expanded)}
                disabled={isBusy}
                Icon={RotateCcw}
                title="Reset transactions"
                summary="Start fresh with your imported transactions."
                description="Clears all transactions, import history, and analytics. Your preferences, budgets, goals, and account classifications will be preserved."
                confirmKeyword="RESET"
                confirmText={confirmText}
                setConfirmText={setConfirmText}
                actionButton={{
                  label: 'Clear transactions',
                  pendingLabel: 'Resetting...',
                  onClick: () => handleReset('transactions'),
                  pending: resetAccount.isPending,
                }}
              />

              <DangerActionRow
                expanded={expandedAction === 'full'}
                setExpanded={(expanded) => toggleAction('full', expanded)}
                disabled={isBusy}
                Icon={RotateCcw}
                title="Reset all data"
                summary="Clear your data and preferences; keep your login."
                description="Permanently deletes all data, including transactions, preferences, budgets, goals, import history, and analytics. Your account and login method will be preserved."
                confirmKeyword="RESET"
                confirmText={confirmText}
                setConfirmText={setConfirmText}
                actionButton={{
                  label: 'Reset all data',
                  pendingLabel: 'Resetting...',
                  onClick: () => handleReset('full'),
                  pending: resetAccount.isPending,
                }}
              />

              <DangerActionRow
                expanded={expandedAction === 'delete'}
                setExpanded={(expanded) => toggleAction('delete', expanded)}
                disabled={isBusy}
                Icon={Trash2}
                title="Delete account"
                summary="Permanently remove your account and its data."
                description="Permanently delete your account and all associated data. This action cannot be undone."
                confirmKeyword="DELETE"
                confirmText={confirmText}
                setConfirmText={setConfirmText}
                actionButton={{
                  label: 'Permanently delete account',
                  pendingLabel: 'Deleting...',
                  onClick: handleDelete,
                  pending: deleteAccount.isPending,
                }}
              />
            </div>
          </section>
        </div>

        <LogoutButton isPending={logout.isPending} disabled={isBusy} onLogout={handleLogout} />
      </motion.div>
    </motion.div>
  )
}
