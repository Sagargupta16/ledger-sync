import { Link } from 'react-router'

import { ROUTES } from '@/constants'
import { bankAlertIngestUrl } from '@/services/api/bankAlerts'

const CODE = 'break-all font-mono text-[11px] text-foreground'
const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-md border border-[var(--hairline-3)] px-3 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-[var(--overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8'
/** The same body Settings shows for an alert inbox token; `sender` is optional. */
const BODY = '{"text": "<the SMS or email>", "sender": "AX-HDFCBK"}'

/**
 * The first-run steps: what to forward, where to post it, and with which token.
 * Everything a Shortcut needs is on screen, so no other page has to be found.
 */
export default function BankAlertsSetup() {
  return (
    <div className="space-y-3 text-xs leading-5 text-text-tertiary">
      <p>
        Forward your bank&apos;s debit and credit SMS (or alert emails) here and this panel lists
        every spend your ledger does not have yet. The text is read and dropped; only the amount,
        date, last four digits, payee and bank are kept.
      </p>
      <ol className="list-decimal space-y-1 pl-4">
        <li>In Settings, create a token for the bank alert inbox.</li>
        <li>
          In Shortcuts, add an automation (for example, a message that contains
          &quot;debited&quot; or &quot;credited&quot;) whose Get Contents of URL step posts to{' '}
          <code className={CODE}>{bankAlertIngestUrl()}</code> with the header{' '}
          <code className={CODE}>Authorization: Bearer &lt;token&gt;</code> and the JSON body{' '}
          <code className={CODE}>{BODY}</code> (sender is optional).
        </li>
      </ol>
      <Link to={ROUTES.SETTINGS} className={LINK_CLASS}>
        Create a token in Settings
      </Link>
    </div>
  )
}
