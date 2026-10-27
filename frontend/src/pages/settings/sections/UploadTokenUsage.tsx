/**
 * Where a token of the selected purpose goes, shown under the create form.
 * The reveal dialog repeats this with the real token filled in.
 */

import { bankAlertIngestUrl } from '@/services/api/bankAlerts'
import {
  LEDGER_READ_SCOPE,
  UPLOAD_SCOPE,
  mcpServerUrl,
  moneyManagerUploadUrl,
  type TokenScope,
} from '@/services/api/uploadTokens'

const CODE = 'break-all font-mono text-xs text-foreground'
/** The body `POST /api/ingest/text` reads; `sender` is optional. */
const ALERT_BODY = '{"text": "<the SMS or email>", "sender": "AX-HDFCBK"}'

export default function UploadTokenUsage({ scope }: Readonly<{ scope: TokenScope }>) {
  if (scope === UPLOAD_SCOPE) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        The Shortcut sends each backup with POST to{' '}
        <code className={CODE}>{moneyManagerUploadUrl()}</code>
      </p>
    )
  }
  if (scope === LEDGER_READ_SCOPE) {
    return (
      <div className="space-y-2 text-sm leading-6 text-muted-foreground">
        <p>
          Claude Code connects to <code className={CODE}>{mcpServerUrl()}</code> and looks up real
          numbers with the same read-only tools as the in-app assistant. What it reads goes to
          Claude under your own Claude account.
        </p>
        <p>
          Tax, savings and net-worth figures it returns are computation aids, not tax or financial
          advice.
        </p>
        <p>
          claude.ai web connectors need an OAuth sign-in that Ledger Sync does not offer, so this
          token works with clients that send an Authorization header, such as Claude Code.
        </p>
      </div>
    )
  }
  return (
    <p className="text-sm leading-6 text-muted-foreground">
      The automation that forwards your bank alerts sends each one with POST to{' '}
      <code className={CODE}>{bankAlertIngestUrl()}</code> as JSON{' '}
      <code className={CODE}>{ALERT_BODY}</code> (sender is optional), with this token in its
      Authorization header as <code className={CODE}>Bearer &lt;token&gt;</code>.
    </p>
  )
}
