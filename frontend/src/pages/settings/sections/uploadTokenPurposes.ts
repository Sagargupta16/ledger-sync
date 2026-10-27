/**
 * What each token scope is for, in the words Settings uses: one entry per
 * scope the backend accepts (see `TokenScope` in services/api/uploadTokens).
 */

import { BellRing, Bot, Smartphone, type LucideIcon } from 'lucide-react'

import {
  ALERTS_INGEST_SCOPE,
  LEDGER_READ_SCOPE,
  UPLOAD_SCOPE,
  type TokenScope,
} from '@/services/api/uploadTokens'

export interface TokenPurpose {
  scope: TokenScope
  label: string
  /** One line under the label in the purpose picker. */
  description: string
  Icon: LucideIcon
  /** Pre-filled name: the device or app that will hold the token. */
  defaultName: string
  /** Title of the one-time reveal dialog. */
  revealTitle: string
  /** Label of the token field in that dialog. */
  tokenLabel: string
  /** What breaks on revoke, after '"name" (prefix...) stops working right away.' */
  revokeEffect: string
}

export const TOKEN_PURPOSES: readonly TokenPurpose[] = [
  {
    scope: UPLOAD_SCOPE,
    label: 'Money Manager upload',
    description: 'An iPhone Shortcut posts backups. It can only upload, never read your data.',
    Icon: Smartphone,
    defaultName: 'iPhone Shortcut',
    revealTitle: 'Copy your upload token',
    tokenLabel: 'Upload token',
    revokeEffect: 'A Shortcut that uses it cannot upload until you give it a new token.',
  },
  {
    scope: LEDGER_READ_SCOPE,
    label: 'Claude MCP read access',
    description: 'Claude Code reads your ledger with the assistant\'s read-only tools. It cannot change anything.',
    Icon: Bot,
    defaultName: 'Claude Code',
    revealTitle: 'Connect Claude Code',
    tokenLabel: 'MCP token',
    revokeEffect: 'Claude loses access to your ledger until you add it again with a new token.',
  },
  {
    scope: ALERTS_INGEST_SCOPE,
    label: 'Bank alert inbox',
    description: 'An automation forwards bank alert texts. It can only add alerts, never read your ledger.',
    Icon: BellRing,
    defaultName: 'Bank alerts',
    revealTitle: 'Copy your alert inbox token',
    tokenLabel: 'Alert inbox token',
    revokeEffect: 'Alerts sent with it are refused until the automation has a new token.',
  },
]

export function purposeFor(scope: TokenScope): TokenPurpose {
  return TOKEN_PURPOSES.find((purpose) => purpose.scope === scope) ?? TOKEN_PURPOSES[0]
}
