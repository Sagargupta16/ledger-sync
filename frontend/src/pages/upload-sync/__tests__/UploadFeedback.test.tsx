import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ParseResult } from '@/lib/fileParser'

import UploadFeedback from '../components/UploadFeedback'

const PARSED: ParseResult = {
  rows: [],
  fileName: 'statement.csv',
  fileHash: 'test-hash',
}

describe('UploadFeedback', () => {
  it('announces a completed import with its summary', () => {
    render(
      <UploadFeedback
        conflict={null}
        failure={null}
        success={{ fileName: 'statement.csv', summary: '20 inserted, 4 skipped.' }}
        isBusy={false}
        onForceReupload={vi.fn<() => Promise<void>>().mockResolvedValue()}
        onRetryUpload={vi.fn<() => Promise<void>>().mockResolvedValue()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Import complete')
    expect(screen.getByRole('status')).toHaveTextContent('20 inserted, 4 skipped.')
  })

  it('lets the user synchronize a previously imported file', () => {
    const onForceReupload = vi.fn<() => Promise<void>>().mockResolvedValue()

    render(
      <UploadFeedback
        conflict={{ parsed: PARSED }}
        failure={null}
        success={null}
        isBusy={false}
        onForceReupload={onForceReupload}
        onRetryUpload={vi.fn<() => Promise<void>>().mockResolvedValue()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sync changes' }))

    expect(onForceReupload).toHaveBeenCalledOnce()
  })

  it('offers a working retry after an upload failure', () => {
    const onRetryUpload = vi.fn<() => Promise<void>>().mockResolvedValue()

    render(
      <UploadFeedback
        conflict={null}
        failure={{ parsed: PARSED, message: 'Network unavailable', force: false }}
        success={null}
        isBusy={false}
        onForceReupload={vi.fn<() => Promise<void>>().mockResolvedValue()}
        onRetryUpload={onRetryUpload}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'statement.csv: Network unavailable',
    )
    expect(onRetryUpload).toHaveBeenCalledOnce()
  })
})
