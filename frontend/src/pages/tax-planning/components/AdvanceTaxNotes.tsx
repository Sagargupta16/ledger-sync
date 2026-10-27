import { Link } from 'react-router'

import { ROUTES } from '@/constants'

interface Props {
  /** Default interest is shown, so say what stops its clock. */
  showsDefaultInterest: boolean
  /** The year is still running and the estimate uses income recorded so far. */
  partialYear: boolean
}

/** How the planner reads the ledger and what it leaves out. */
export default function AdvanceTaxNotes({ showsDefaultInterest, partialYear }: Readonly<Props>) {
  return (
    <ul className="mt-4 list-disc space-y-1 border-t border-[var(--hairline-1)] pl-4 pt-3 text-xs leading-5 text-muted-foreground">
      <li>Payments are ledger expenses whose category or subcategory says Advance Tax, counted against the next due date.</li>
      {showsDefaultInterest && (
        <li>
          Default interest stops at ledger expenses named Self Assessment dated after the year end; without one the
          planner cannot see when the balance was paid.
        </li>
      )}
      <li>
        Only income classified as taxable is in the estimate: classify interest or dividends as taxable in{' '}
        <Link to={ROUTES.SETTINGS} className="text-app-blue underline-offset-2 hover:underline">Settings</Link>
        {' '}to include them. Capital gains are not modelled.
      </li>
      {partialYear && (
        <li>This year is still running and the estimate uses income recorded so far, so the year&apos;s tax can be higher.</li>
      )}
      <li>
        Not modelled: relief when a shortfall comes from capital gains or dividends paid in a later instalment,
        the single 15 March instalment for presumptive income, and the exemption for resident seniors (60+) with no
        business income.
      </li>
    </ul>
  )
}
