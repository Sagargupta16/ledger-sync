import { Briefcase, Coins, FileText, Landmark, LineChart } from 'lucide-react'

import { CollapsibleSection } from '@/components/ui'
import type { AisStatement } from '@/lib/tax/aisSummary'

import AisLinesTable from './AisLinesTable'
import AisSalaryAnnexure from './AisSalaryAnnexure'

interface Props {
  readonly statement: AisStatement
}

/** Every line of the opened statement, grouped the way the AIS portal groups them. */
export default function AisDetailSections({ statement }: Props) {
  // SFT reports and Other Information lines (such as interest on an income tax refund); TDS interest stays under TDS.
  const interestAndDividends = [...statement.interest, ...statement.dividends]
  return (
    <section aria-label="Statement detail" className="space-y-4">
      <CollapsibleSection title="TDS and TCS" icon={Landmark} badge={statement.tds.length + statement.tcs.length} defaultExpanded={false}>
        <div className="space-y-4">
          <AisLinesTable lines={statement.tds} ariaLabel="TDS lines" emptyText="No TDS lines in this statement." showTax showHead />
          {statement.tcs.length > 0 && (
            <>
              <h4 className="text-sm font-semibold">TCS</h4>
              <AisLinesTable lines={statement.tcs} ariaLabel="TCS lines" emptyText="No TCS lines." showTax />
            </>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Interest and dividends" icon={Coins} badge={interestAndDividends.length} defaultExpanded={false}>
        <AisLinesTable lines={interestAndDividends} ariaLabel="Interest and dividend lines" emptyText="No interest or dividend information." showHead />
      </CollapsibleSection>

      <CollapsibleSection title="Securities and mutual fund transactions" icon={LineChart} badge={statement.securities.length} defaultExpanded={false}>
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          The AIS reports a sale&apos;s consideration, not its gain: capital gains need the cost of each lot.
        </p>
        <AisLinesTable lines={statement.securities} ariaLabel="Securities and mutual fund lines" emptyText="No securities or mutual fund transactions." showQuantity />
      </CollapsibleSection>

      <CollapsibleSection title="Salary annexure" icon={Briefcase} badge={statement.salaryAnnexure.length} defaultExpanded={false}>
        <AisSalaryAnnexure entries={statement.salaryAnnexure} />
      </CollapsibleSection>

      <CollapsibleSection title="Tax payments, refunds and other information" icon={FileText} badge={statement.other.length} defaultExpanded={false}>
        <AisLinesTable lines={statement.other} ariaLabel="Other AIS lines" emptyText="Nothing else in this statement." />
      </CollapsibleSection>
    </section>
  )
}
