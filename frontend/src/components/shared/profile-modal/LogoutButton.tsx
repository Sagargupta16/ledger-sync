import { LogOut } from 'lucide-react'

interface LogoutButtonProps {
  isPending: boolean
  onLogout: () => void
}

export function LogoutButton({ isPending, onLogout }: Readonly<LogoutButtonProps>) {
  return (
    <div className="px-6 py-4 border-t border-border">
      <button
        type="button"
        onClick={onLogout}
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors duration-150 ease-out text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <LogOut size={16} />
        <span>{isPending ? 'Signing out...' : 'Sign Out'}</span>
      </button>
    </div>
  )
}
