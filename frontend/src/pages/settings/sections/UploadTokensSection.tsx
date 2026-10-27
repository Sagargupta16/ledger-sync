/**
 * Access Tokens section - long-lived, single-purpose tokens for clients that
 * cannot run the OAuth sign-in: an iPhone Shortcut that posts Money Manager
 * backups, Claude Code reading the ledger over MCP, or an automation that
 * forwards bank alerts. The token goes in the client's Authorization header.
 * Create and revoke apply immediately, outside the page's draft and Save.
 */

import { useRef, useState } from 'react'
import { KeyRound, Plus } from 'lucide-react'
import { toast } from 'sonner'

import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useCreateUploadToken, useRevokeUploadToken, useUploadTokens } from '@/hooks/api/useUploadTokens'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { isCurrentSession } from '@/lib/session'
import { MAX_UPLOAD_TOKENS, UPLOAD_SCOPE, type TokenScope, type UploadToken } from '@/services/api/uploadTokens'
import { useDemoStore } from '@/store/demoStore'

import { FieldHint, FieldLabel, Section } from '../sectionPrimitives'
import { inputClass } from '../styles'
import UploadTokenList from './UploadTokenList'
import UploadTokenPurposePicker from './UploadTokenPurposePicker'
import UploadTokenRevealDialog, { type RevealedUploadToken } from './UploadTokenRevealDialog'
import UploadTokenUsage from './UploadTokenUsage'
import { purposeFor } from './uploadTokenPurposes'

interface Props {
  index: number
}

export default function UploadTokensSection({ index }: Readonly<Props>) {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const tokensQuery = useUploadTokens()
  const createToken = useCreateUploadToken()
  const revokeToken = useRevokeUploadToken()
  // The reveal dialog opens when the request settles, not on the click, so
  // remember what submitted the form to hand focus back to it.
  const openerRef = useRef<HTMLElement | null>(null)
  const [scope, setScope] = useState<TokenScope>(UPLOAD_SCOPE)
  const [name, setName] = useState(purposeFor(UPLOAD_SCOPE).defaultName)
  // The plaintext lives only here, from the create response until the dialog closes.
  const [revealed, setRevealed] = useState<RevealedUploadToken | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<UploadToken | null>(null)

  const purpose = purposeFor(scope)
  // The limit is per purpose, so a full set of Shortcut tokens never blocks Claude.
  const atLimit = (tokensQuery.data?.filter((token) => token.scope === scope).length ?? 0) >= MAX_UPLOAD_TOKENS
  const trimmedName = name.trim()
  const canCreate = !isDemoMode && !atLimit && trimmedName.length > 0
  const revokeError = revokeToken.isError && revokeToken.variables !== undefined
    ? { id: revokeToken.variables, message: getApiErrorMessage(revokeToken.error, 'Please try again.') }
    : null

  const handlePurpose = (next: TokenScope) => {
    // Swap the suggested name along with the purpose, but keep one the user typed.
    if (trimmedName === '' || name === purpose.defaultName) setName(purposeFor(next).defaultName)
    setScope(next)
    if (createToken.isError) createToken.reset()
  }

  const handleCreate = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canCreate || createToken.isPending) return
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    createToken.mutate({ name: trimmedName, scope }, {
      onSuccess: (created, _input, signal) => {
        if (!signal || !isCurrentSession(signal)) return
        setRevealed({ name: created.name, scope: created.scope, token: created.token })
        setName(purposeFor(created.scope).defaultName)
        // Drop the response from the mutation, leaving state the only copy.
        createToken.reset()
      },
    })
  }

  const handleRevoke = () => {
    if (!revokeTarget) return
    const { id, name: tokenName } = revokeTarget
    revokeToken.mutate(id, {
      onSuccess: (_data, _id, signal) => {
        if (signal && isCurrentSession(signal)) toast.success(`Revoked ${tokenName}`)
      },
    })
  }

  return (
    <div>
      <Section
        index={index}
        icon={KeyRound}
        title="Access Tokens"
        description="Tokens for an iPhone Shortcut, Claude Code and bank alerts"
      >
        <p className="text-sm leading-6 text-muted-foreground">
          A token lets an automation or Claude reach one part of your account without signing in.
          Each token has one purpose, expires after 365 days and can be revoked at any time.
          Changes apply immediately.
        </p>

        {isDemoMode && (
          <p className="text-sm text-muted-foreground">
            Demo mode is read-only. Creating a token requires your own account.
          </p>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Outside the disabled fieldset: demo visitors can still compare purposes. */}
          <UploadTokenPurposePicker value={scope} onChange={handlePurpose} tokens={tokensQuery.data} />
          <UploadTokenUsage scope={scope} />
          <fieldset disabled={isDemoMode} className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">Create a {purpose.label} token</legend>
            <FieldLabel htmlFor="upload-token-name">Token name</FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="upload-token-name"
                type="text"
                value={name}
                required
                maxLength={100}
                autoComplete="off"
                onChange={(event) => {
                  setName(event.target.value)
                  if (createToken.isError) createToken.reset()
                }}
                className={inputClass}
              />
              <Button
                type="submit"
                disabled={!canCreate}
                isLoading={createToken.isPending}
                icon={<Plus className="size-4" />}
                className="w-full sm:w-auto sm:shrink-0"
              >
                Create token
              </Button>
            </div>
            <FieldHint>
              {atLimit
                ? `You have ${MAX_UPLOAD_TOKENS} active ${purpose.label} tokens, the most allowed. Revoke one to create another.`
                : 'Name it after the device or app that will use it.'}
            </FieldHint>
            {createToken.isError && (
              <p role="alert" className="mt-2 text-sm text-app-red">
                {getApiErrorMessage(createToken.error, 'Could not create the token. Please try again.')}
              </p>
            )}
          </fieldset>
        </form>

        {!isDemoMode && (
          <UploadTokenList
            tokens={tokensQuery.data}
            isLoading={tokensQuery.isLoading}
            isError={tokensQuery.isError}
            onRetry={() => void tokensQuery.refetch()}
            revokingId={revokeToken.isPending ? revokeToken.variables : undefined}
            revokeError={revokeError}
            onRevoke={(token) => {
              revokeToken.reset()
              setRevokeTarget(token)
            }}
          />
        )}
      </Section>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
        title="Revoke access token?"
        description={revokeTarget
          ? `"${revokeTarget.name}" (${revokeTarget.prefix}...) stops working right away. ${purposeFor(revokeTarget.scope).revokeEffect}`
          : ''}
        confirmLabel="Revoke token"
        onConfirm={handleRevoke}
      />

      <UploadTokenRevealDialog
        revealed={revealed}
        returnFocusRef={openerRef}
        onClose={() => setRevealed(null)}
      />
    </div>
  )
}
