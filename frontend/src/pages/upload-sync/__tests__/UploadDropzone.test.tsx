import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import UploadDropzone from '../components/UploadDropzone'

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Expected upload file input')
  }
  return input
}

describe('UploadDropzone', () => {
  it('passes an accepted CSV file to the upload handler', async () => {
    const onFileSelect = vi.fn<(_: File) => Promise<void>>().mockResolvedValue()
    const file = new File(['date,amount\n2026-01-01,100'], 'ledger.csv', {
      type: 'text/csv',
    })

    render(
      <UploadDropzone
        phase={null}
        selectedFileName={null}
        isBusy={false}
        onFileSelect={onFileSelect}
      />,
    )
    fireEvent.change(fileInput(), { target: { files: [file] } })

    await waitFor(() => expect(onFileSelect).toHaveBeenCalledWith(file))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects unsupported files without invoking the upload handler', async () => {
    const onFileSelect = vi.fn<(_: File) => Promise<void>>().mockResolvedValue()
    const file = new File(['plain text'], 'notes.txt', { type: 'text/plain' })

    render(
      <UploadDropzone
        phase={null}
        selectedFileName={null}
        isBusy={false}
        onFileSelect={onFileSelect}
      />,
    )
    fireEvent.change(fileInput(), { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose an .xlsx, .xls, or .csv transaction file.',
    )
    expect(onFileSelect).not.toHaveBeenCalled()
  })

  it('announces the active upload phase and selected file', () => {
    render(
      <UploadDropzone
        phase="processing"
        selectedFileName="statement.csv"
        isBusy
        onFileSelect={vi.fn<(_: File) => Promise<void>>().mockResolvedValue()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Upload an Excel or CSV transaction file' }),
    ).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Saving your ledger and refreshing insights...')).toBeInTheDocument()
    expect(screen.getByText('statement.csv')).toBeInTheDocument()
    expect(screen.getByText('Save & refresh').closest('li')).toHaveAttribute('aria-current', 'step')
  })
})
