import { useState, type FormEvent } from 'react'
import { useDropzone } from 'react-dropzone'

import { AlertCircle, FileLock2, ShieldCheck, Sparkles } from 'lucide-react'

import { Button, Input, Select } from '@/components/ui'
import { cn } from '@/lib/cn'

import { displayFileName, PRIVACY_NOTE, taxYearLabel } from '../aisImportLabels'
import { MAX_AIS_BYTES, type AisCredentials } from '../useAisImport'

interface Props {
  readonly isOpening: boolean
  readonly error: string | null
  readonly isDemoMode: boolean
  readonly yearOptions: readonly string[]
  readonly defaultYear: string
  readonly onOpen: (file: File, credentials: AisCredentials) => Promise<boolean>
  readonly onOpenSample: (year: string) => Promise<void>
}

const PAN_RE = /^[A-Za-z]{5}\d{4}[A-Za-z]$/
// The password uses the digits with separators dropped, so a date in another
// order (2024-01-31, 19900131) would silently derive the wrong password; check
// the day, month and year ranges here, where the message can say so.
const DOB_RE = /^(0[1-9]|[12]\d|3[01])[-/]?(0[1-9]|1[0-2])[-/]?(19|20)\d{2}$/

export default function AisUnlockCard({
  isOpening, error, isDemoMode, yearOptions, defaultYear, onOpen, onOpenSample,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [pan, setPan] = useState('')
  const [dob, setDob] = useState('')
  const [rejection, setRejection] = useState<string | null>(null)
  const [sampleYear, setSampleYear] = useState(defaultYear)

  const panError = pan.trim() && !PAN_RE.test(pan.trim()) ? 'A PAN has 5 letters, 4 digits and 1 letter.' : undefined
  const dobError = dob.trim() && !DOB_RE.test(dob.trim())
    ? 'Use DDMMYYYY or DD-MM-YYYY, the date on your PAN (not YYYY-MM-DD).'
    : undefined

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted, rejected) => {
      if (rejected.length > 0) {
        const tooLarge = rejected.some((r) => r.errors.some((e) => e.code === 'file-too-large'))
        setRejection(tooLarge ? 'That file is larger than any AIS JSON (32 MB).' : 'Choose the AIS JSON file (.json).')
        return
      }
      setRejection(null)
      setFile(accepted[0] ?? null)
    },
    accept: { 'application/json': ['.json'], 'text/plain': ['.txt'] },
    maxFiles: 1,
    maxSize: MAX_AIS_BYTES,
    disabled: isOpening,
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file || panError || dobError) return
    if (await onOpen(file, { pan, dob })) {
      setPan('')
      setDob('')
    }
  }

  return (
    <section aria-labelledby="ais-unlock-title" className="ledger-panel p-4 sm:p-5">
      <h2 id="ais-unlock-title" className="inline-flex items-center gap-2 text-base font-semibold">
        <FileLock2 className="size-4 text-primary" aria-hidden="true" />
        Open your AIS
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        On the income tax portal open AIS, choose the year, then Download and JSON. The file is
        encrypted with your PAN and date of birth.
      </p>

      <form className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]" onSubmit={(event) => { void submit(event) }}>
        <div
          {...getRootProps({ role: 'button', 'aria-label': 'Choose the AIS JSON file', 'aria-busy': isOpening })}
          className={cn(
            'flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-center transition-colors duration-150',
            'bg-[var(--overlay-2)] hover:border-primary hover:bg-primary/10',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2',
            isDragActive && 'border-primary bg-primary/20',
            file ? 'border-primary' : 'border-[var(--hairline-5)]',
            isOpening && 'cursor-not-allowed opacity-50',
          )}
        >
          <input {...getInputProps()} />
          <p className="text-sm font-semibold text-foreground">
            {isDragActive ? 'Drop the AIS JSON here' : 'Drop the AIS JSON here, or click to browse'}
          </p>
          <p className="max-w-full truncate font-mono text-xs text-muted-foreground">
            {file ? displayFileName(file.name) : '.json, up to 32 MB'}
          </p>
        </div>

        <div className="space-y-3">
          <Input
            label="PAN"
            value={pan}
            onChange={(event) => setPan(event.target.value.toUpperCase())}
            error={panError}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={10}
            placeholder="ABCDE1234F"
          />
          <Input
            label="Date of birth"
            value={dob}
            onChange={(event) => setDob(event.target.value)}
            error={dobError}
            autoComplete="off"
            inputMode="numeric"
            maxLength={10}
            placeholder="DDMMYYYY"
          />
          <Button type="submit" className="w-full" isLoading={isOpening} disabled={!file || Boolean(panError || dobError)}>
            Open in this browser
          </Button>
        </div>
      </form>

      {(rejection ?? error) && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-app-red">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {rejection ?? error}
        </p>
      )}

      <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-app-green" aria-hidden="true" />
        {PRIVACY_NOTE}
      </p>

      {isDemoMode && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-[var(--overlay-2)] p-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Select
              label="Sample statement year"
              value={sampleYear}
              onChange={(event) => setSampleYear(event.target.value)}
              options={yearOptions.map((year) => ({ value: year, label: taxYearLabel(year) }))}
            />
          </div>
          <Button
            variant="secondary"
            icon={<Sparkles className="size-4" aria-hidden="true" />}
            isLoading={isOpening}
            onClick={() => { void onOpenSample(sampleYear) }}
          >
            Open a sample built from the demo ledger
          </Button>
        </div>
      )}
    </section>
  )
}
