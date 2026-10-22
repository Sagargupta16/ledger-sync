/**
 * Upload Tokens section - long-lived, upload-only tokens for an iPhone
 * Shortcut that posts Money Manager backups. Shortcuts cannot run the OAuth
 * sign-in, so the token goes in the Shortcut's Authorization header instead.
 * Create and revoke apply immediately, outside the page's draft and Save.
 */

import { useRef, useState } from 'react'
import { Plus, Smartphone } from 'lucide-react'
import { toast } from 'sonner'

import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useCreateUploadToken, useRevokeUploadToken, useUploadTokens } from '@/hooks/api/useUploadTokens'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { isCurrentSession } from '@/lib/session'
import { MAX_UPLOAD_TOKENS, moneyManagerUploadUrl, type UploadToken } from '@/services/api/uploadTokens'
import { useDemoStore } from '@/store/demoStore'

import { FieldHint, FieldLabel, Section } from '../sectionPrimitives'
import { inputClass } from '../styles'
import UploadTokenList from './UploadTokenList'
import UploadTokenRevealDialog, { type RevealedUploadToken } from './UploadTokenRevealDialog'

const DEFAULT_TOKEN_NAME = 'iPhone Shortcut'

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
  const [name, setName] = useState(DEFAULT_TOKEN_NAME)
  // The plaintext lives only here, from the create response until the dialog closes.
  const [revealed, setRevealed] = useState<RevealedUploadToken | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<UploadToken | null>(null)

  const atLimit = (tokensQuery.data?.length ?? 0) >= MAX_UPLOAD_TOKENS
  const trimmedName = name.trim()
  const canCreate = !isDemoMode && !atLimit && trimmedName.length > 0
  const uploadUrl = moneyManagerUploadUrl()
  const revokeError = revokeToken.isError && revokeToken.variables !== undefined
    ? { id: revokeToken.variables, message: getApiErrorMessage(revokeToken.error, 'Please try again.') }
    : null

  const handleCreate = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canCreate || createToken.isPending) return
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    createToken.mutate(trimmedName, {
      onSuccess: (created, _name, signal) => {
        if (!signal || !isCurrentSession(signal)) return
        setRevealed({ name: created.name, token: created.token })
        setName(DEFAULT_TOKEN_NAME)
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
        icon={Smartphone}
        title="Upload Tokens"
        description="Let an iPhone Shortcut upload Money Manager backups"
      >
        <p className="text-sm leading-6 text-muted-foreground">
          A token lets an iPhone Shortcut upload Money Manager backups without signing in. It can
          only upload, never read your data, and expires after 365 days. Changes apply immediately.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          The Shortcut sends each backup with POST to{' '}
          <code className="break-all font-mono text-xs text-foreground">{uploadUrl}</code>
        </p>

        {isDemoMode && (
          <p className="text-sm text-muted-foreground">
            Demo mode is read-only. Creating an upload token requires your own account.
          </p>
        )}

        <form onSubmit={handleCreate}>
          <fieldset disabled={isDemoMode} className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">Create an upload token</legend>
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
                ? `You have ${MAX_UPLOAD_TOKENS} active tokens, the most allowed. Revoke one to create another.`
                : 'Name it after the device or Shortcut that will use it.'}
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
        title="Revoke upload token?"
        description={revokeTarget
          ? `"${revokeTarget.name}" (${revokeTarget.prefix}...) stops working right away. A Shortcut that uses it cannot upload until you give it a new token.`
          : ''}
        confirmLabel="Revoke token"
        onConfirm={handleRevoke}
      />

      <UploadTokenRevealDialog
        revealed={revealed}
        uploadUrl={uploadUrl}
        returnFocusRef={openerRef}
        onClose={() => setRevealed(null)}
      />
    </div>
  )
}
