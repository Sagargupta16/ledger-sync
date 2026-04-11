import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'

export interface SalaryStructureSectionProps {
  index: number
  localSalaryStructure: Record<string, SalaryComponents>
  updateSalaryStructure: (structure: Record<string, SalaryComponents>) => void
  localRsuGrants: RsuGrant[]
  updateRsuGrants: (grants: RsuGrant[]) => void
  localGrowthAssumptions: GrowthAssumptions
  updateGrowthAssumptions: (assumptions: GrowthAssumptions) => void
}

/** Stub -- full UI will be implemented in Task 10. */
export default function SalaryStructureSection(
  props: SalaryStructureSectionProps,
) {
  void props
  return null
}
