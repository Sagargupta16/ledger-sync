import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui'

interface LogoutButtonProps {
  isPending: boolean
  disabled?: boolean
  onLogout: () => void
}

export function LogoutButton({ isPending, disabled, onLogout }: Readonly<LogoutButtonProps>) {
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline-1)] bg-[var(--overlay-1)] px-4 py-3 sm:px-6">
      <p className="text-xs text-muted-foreground">Your current session</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onLogout}
        disabled={disabled}
        isLoading={isPending}
        icon={<LogOut className="size-4" />}
      >
        {isPending ? 'Signing out...' : 'Sign out'}
      </Button>
    </footer>
  )
}
