import { isVested } from '@/lib/rsuVesting'
import { useDemoStore } from '@/store/demoStore'
import type { RsuGrant } from '@/types/salary'

import VestFxList from './VestFxList'

/**
 * The tax rupee value of each vested, saved vest of one grant. A vest needs its
 * stored ID before a conversion can be recorded against it, so a grant with
 * only new vests shows a save hint and never mounts the records query.
 */
export default function VestFxPanel({ grant, today }: Readonly<{ grant: RsuGrant; today: string }>) {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const vested = grant.vestings.filter((vesting) => isVested(vesting, today) && vesting.quantity > 0)
  const saved = vested.filter((vesting) => Boolean(vesting.id))
  if (isDemoMode || vested.length === 0) return null
  if (saved.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Save settings to record the tax exchange rate for these vests.
      </p>
    )
  }
  return <VestFxList grant={grant} vestings={saved} unsavedCount={vested.length - saved.length} />
}
