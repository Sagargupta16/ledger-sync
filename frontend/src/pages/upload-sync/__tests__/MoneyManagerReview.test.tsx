import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import MoneyManagerNotice from '../components/MoneyManagerNotice'
import MoneyManagerReview from '../components/MoneyManagerReview'
import { BACKUP_NAME, GZIPPED, PREVIEW } from './moneyManagerFixtures'

describe('MoneyManagerReview', () => {
  it('shows the dry-run counts and requires the full-ledger acknowledgment', () => {
    const onConfirm = vi.fn<() => Promise<void>>().mockResolvedValue()
    render(
      <MoneyManagerReview
        review={{ fileName: BACKUP_NAME, backup: GZIPPED, preview: PREVIEW, force: false }}
        isBusy={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    const replace = screen.getByRole('button', { name: 'Replace ledger with this backup' })

    expect(replace).toBeDisabled()
    expect(screen.getByText('8,216')).toBeInTheDocument()
    expect(screen.getByText('2019-04-01 to 2026-10-20')).toBeInTheDocument()
    expect(screen.getByText('Removed').nextElementSibling).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('checkbox', {
      name: 'This backup is my complete Money Manager ledger; rows missing from it are removed.',
    }))
    expect(replace).toBeEnabled()
    fireEvent.click(replace)
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})

describe('MoneyManagerNotice', () => {
  it('offers one forced re-import of a backup that is already up to date', () => {
    const onForceReimport = vi.fn<() => Promise<void>>().mockResolvedValue()
    const onRetry = vi.fn<() => Promise<void>>().mockResolvedValue()
    const notice = { kind: 'up-to-date', fileName: BACKUP_NAME, backup: GZIPPED, forced: false } as const
    const { rerender } = render(
      <MoneyManagerNotice notice={notice} isBusy={false} onForceReimport={onForceReimport} onRetry={onRetry} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Already up to date')
    fireEvent.click(screen.getByRole('button', { name: 'Re-import anyway' }))
    expect(onForceReimport).toHaveBeenCalledOnce()

    rerender(
      <MoneyManagerNotice
        notice={{ ...notice, forced: true }}
        isBusy={false}
        onForceReimport={onForceReimport}
        onRetry={onRetry}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Re-import anyway' })).not.toBeInTheDocument()
  })

  it('offers a retry only when the import itself failed', () => {
    const onRetry = vi.fn<() => Promise<void>>().mockResolvedValue()
    const review = { fileName: BACKUP_NAME, backup: GZIPPED, preview: PREVIEW, force: false }
    const { rerender } = render(
      <MoneyManagerNotice
        notice={{ kind: 'failed', fileName: BACKUP_NAME, message: 'Too many uploads.', retry: review }}
        isBusy={false}
        onForceReimport={vi.fn<() => Promise<void>>().mockResolvedValue()}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(`${BACKUP_NAME}: Too many uploads.`)
    fireEvent.click(screen.getByRole('button', { name: 'Retry import' }))
    expect(onRetry).toHaveBeenCalledOnce()

    rerender(
      <MoneyManagerNotice
        notice={{ kind: 'failed', fileName: BACKUP_NAME, message: 'Not a backup.', retry: null }}
        isBusy={false}
        onForceReimport={vi.fn<() => Promise<void>>().mockResolvedValue()}
        onRetry={onRetry}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Retry import' })).not.toBeInTheDocument()
    expect(screen.getByText('No ledger entries were changed. Select a backup to try again.')).toBeInTheDocument()
  })
})
