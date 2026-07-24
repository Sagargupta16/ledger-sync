import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui'

interface LogoutButtonProps {
  isPending: boolean
  onLogout: () => void
}

export function LogoutButton({ isPending, onLogout }: Readonly<LogoutButtonProps>) {
  return (
    <div className="px-6 py-4 border-t border-border">
      <Button
        type="button"
        variant="ghost"
        size="lg"
        onClick={onLogout}
        disabled={isPending}
        className="w-full rounded-xl bg-app-red/10 text-app-red hover:bg-app-red/15 hover:text-app-red"
      >
        <LogOut size={16} aria-hidden="true" />
        <span>{isPending ? 'Signing out...' : 'Sign Out'}</span>
      </Button>
    </div>
  )
}
