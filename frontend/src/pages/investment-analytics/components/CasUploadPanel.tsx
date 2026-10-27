import { useId, useState } from 'react'

import { ShieldCheck } from 'lucide-react'

import { Button, Input } from '@/components/ui'
import { useCasImport } from '@/hooks/api/useMfHoldings'
import { getApiErrorMessage } from '@/lib/errorUtils'
import type { CasImportResult } from '@/services/api/cas'
import { useDemoStore } from '@/store/demoStore'

import { CasFileField } from './CasFileField'

interface CasUploadPanelProps {
  /** Called with the server's summary once the import is saved; the caller shows it. */
  readonly onImported: (result: CasImportResult) => void
}

export function CasUploadPanel({ onImported }: CasUploadPanelProps) {
  const formId = useId()
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const importCas = useCasImport(onImported)
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const busy = importCas.isPending

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file || isDemoMode || busy) return
    setError(null)
    importCas.mutate(
      { file, password },
      {
        onSuccess: () => setFile(null),
        onError: (cause) => {
          setError(getApiErrorMessage(cause, 'Could not import this CAS. Please try again.'))
        },
        // Clear the field and let the mutation, which holds the password, go.
        onSettled: () => {
          setPassword('')
          importCas.reset()
        },
      },
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby={`${formId}-title`}
      aria-busy={busy}
      className="space-y-4 rounded-md border border-[var(--hairline-2)] bg-[var(--overlay-2)] p-4"
    >
      <div>
        <h3 id={`${formId}-title`} className="text-sm font-semibold text-foreground">
          Import a CAS PDF
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Use the original PDF attached to the CAMS, KFintech, NSDL or CDSL email. A Detailed CAS
          from CAMS or KFintech that starts before your first purchase also gives XIRR. MFCentral
          statements and re-printed or &quot;Save as PDF&quot; copies cannot be read.
        </p>
      </div>
      {isDemoMode && (
        <p className="text-sm text-muted-foreground">
          Demo mode is read-only: the holdings shown are sample data, and importing a CAS needs your
          own account.
        </p>
      )}
      <div className="space-y-3">
        <CasFileField file={file} disabled={busy || isDemoMode} onFile={setFile} onError={setError} />
        <Input
          id={`${formId}-password`}
          label="PDF password"
          type="password"
          name="cas-password"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={128}
          placeholder="Password you set, or your PAN"
          value={password}
          disabled={busy || isDemoMode}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-app-green" aria-hidden="true" />
        <span>
          The password opens the PDF on the server for this one request. Neither the PDF nor the
          password is stored or logged; only folios, schemes, units and dated transactions are
          saved. CAMS and KFintech use the password you set when requesting the statement; NSDL and
          CDSL use your PAN in capitals.
        </span>
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        An import replaces your earlier one from the same kind of issuer: CAMS and KFintech
        statements replace each other, as do NSDL and CDSL ones. A Summary CAS has no transactions,
        so importing one over a Detailed CAS drops that statement&apos;s XIRRs.
      </p>
      {error && (
        <p role="alert" className="text-sm text-app-red">
          {error}
        </p>
      )}
      <Button type="submit" isLoading={busy} disabled={!file || isDemoMode}>
        Import CAS
      </Button>
    </form>
  )
}
