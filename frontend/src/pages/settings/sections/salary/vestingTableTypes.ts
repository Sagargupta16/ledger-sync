import type { RsuGrant, RsuVesting } from '@/types/salary'

export interface VestingTableProps {
  grant: RsuGrant
  today: string
  onUpdateVesting: (grantId: string, vestIdx: number, patch: Partial<RsuVesting>) => void
  onRemoveVesting: (grantId: string, vestIdx: number) => void
  onSortVestings: (grantId: string) => void
}

export interface IndexedVesting {
  vesting: RsuVesting
  /** Index into the grant's state array because edit handlers are index-based. */
  stateIdx: number
}

export type VestingEntryProps = Pick<
  VestingTableProps,
  'grant' | 'today' | 'onUpdateVesting' | 'onRemoveVesting' | 'onSortVestings'
> & {
  entry: IndexedVesting
  vested: boolean
}
