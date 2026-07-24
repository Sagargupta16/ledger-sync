import { Lightbulb } from 'lucide-react'
import { motion } from 'framer-motion'

import { CollapsibleSection } from '@/components/ui'
import { fadeUpItem } from '@/constants/animations'

import type { TaxPlanningModel } from '../useTaxPlanning'
import TaxTip from './TaxTip'

interface Props {
  planning: TaxPlanningModel
}

export default function TaxSavingSuggestions({ planning }: Readonly<Props>) {
  return (
    <motion.div variants={fadeUpItem}>
      <CollapsibleSection title="Tax Saving Suggestions" icon={Lightbulb} defaultExpanded={false}>
        <p className="text-xs text-muted-foreground mb-4">
          {planning.isNewRegime
            ? 'New Regime -- Limited deductions, lower rates'
            : 'Old Regime -- Maximize deductions to reduce taxable income'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {planning.isNewRegime ? (
            <>
              <TaxTip
                title="Standard Deduction"
                amount={planning.standardDeduction}
                description="Automatically applied to salaried individuals. No action needed."
              />
              <TaxTip
                title="NPS -- Employer Contribution"
                amount={null}
                description="Section 80CCD(2): Up to 14% of basic salary contributed by employer is deductible even in New Regime."
              />
              <TaxTip
                title="Home Loan Interest (Let-out)"
                amount={null}
                description="Section 24(b): Interest on loan for let-out property is fully deductible (no limit). Self-occupied is NOT allowed in New Regime."
              />
              <TaxTip
                title="Agniveer Corpus Fund"
                amount={null}
                description="Section 80CCH: Full deduction for contributions to the Agniveer scheme."
              />
              <TaxTip
                title="Section 87A Rebate"
                amount={planning.fyYear >= 2025 ? 60000 : 25000}
                description={
                  planning.fyYear >= 2025
                    ? 'Income up to 12L: Full tax rebate (zero tax up to 12.75L after standard deduction).'
                    : 'Income up to 7L: Full tax rebate (zero tax up to 7.75L after standard deduction).'
                }
              />
              <TaxTip
                title="Consider Old Regime?"
                amount={null}
                description="If you have significant 80C investments (1.5L), HRA, home loan interest, or medical insurance -- Old Regime may save more. Compare both."
              />
            </>
          ) : (
            <>
              <TaxTip
                title="Section 80C"
                amount={150000}
                description="PPF, ELSS, LIC, EPF, tuition fees, home loan principal. Max deduction: 1.5L."
              />
              <TaxTip
                title="Section 80CCD(1B) -- NPS"
                amount={50000}
                description="Additional 50K deduction for NPS contributions (over and above 80C)."
              />
              <TaxTip
                title="Section 80D -- Health Insurance"
                amount={75000}
                description="Self/family: 25K (50K if senior). Parents: 25K (50K if senior). Total max: 75K-1L."
              />
              <TaxTip
                title="Section 24(b) -- Home Loan Interest"
                amount={200000}
                description="Interest on self-occupied property loan: up to 2L deduction per year."
              />
              <TaxTip
                title="HRA Exemption"
                amount={null}
                description="If you live in rented housing and receive HRA as part of salary, claim exemption under Section 10(13A)."
              />
              <TaxTip
                title="Section 80E -- Education Loan"
                amount={null}
                description="Full interest deduction on education loan for self, spouse, or children. No upper limit. Available for 8 years."
              />
              <TaxTip
                title="Section 80G -- Donations"
                amount={null}
                description="50% or 100% deduction for donations to approved charities. Keep receipts with PAN of the organization."
              />
              <TaxTip
                title="Section 80TTA -- Savings Interest"
                amount={10000}
                description="Interest from savings bank accounts: up to 10K deduction (50K for senior citizens under 80TTB)."
              />
            </>
          )}
        </div>
      </CollapsibleSection>
    </motion.div>
  )
}
