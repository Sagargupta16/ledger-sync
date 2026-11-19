/**
 * @vitest-environment node
 *
 * The Idempotency-Key header: sent on a committing upload when a key is given,
 * left off otherwise, and never sent on a Money Manager dry run.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { moneyManagerBackupService } from '@/services/api/moneyManagerBackup'
import { uploadService } from '@/services/api/upload'

const post = vi.hoisted(() => vi.fn<(url: string, body: unknown, config: { headers?: Record<string, string> }) => Promise<{ data: unknown }>>())

vi.mock('@/services/api/client', () => ({ apiClient: { post } }))

const ROW = {
  date: '2026-01-15', amount: 100, currency: 'INR', type: 'Expense' as const,
  account: 'Cash', category: 'Food',
}

const upload = (idempotencyKey?: string) =>
  uploadService.uploadTransactions({ fileName: 'a.csv', fileHash: 'h', rows: [ROW], idempotencyKey })

const importBackup = (dryRun: boolean, idempotencyKey?: string) =>
  moneyManagerBackupService.importBackup({
    fileName: 'backup.mmbak',
    backup: new Blob(['gzip bytes']),
    dryRun,
    force: false,
    allowLargeDelete: true,
    idempotencyKey,
  })

afterEach(() => {
  vi.clearAllMocks()
})

describe('upload idempotency header', () => {
  it('sends the key on a spreadsheet upload', async () => {
    post.mockResolvedValue({ data: { success: true } })
    await upload('key-1')
    expect(post.mock.calls[0]?.[2].headers).toEqual({ 'Idempotency-Key': 'key-1' })
  })

  it('omits the header when no key is given', async () => {
    post.mockResolvedValue({ data: { success: true } })
    await upload()
    expect(post.mock.calls[0]?.[2].headers).toBeUndefined()
  })

  it('sends the key on a committing Money Manager import with the gzip content type', async () => {
    post.mockResolvedValue({ data: { status: 'imported' } })
    await importBackup(false, 'key-2')
    expect(post.mock.calls[0]?.[2].headers).toEqual({
      'Content-Type': 'application/gzip',
      'Idempotency-Key': 'key-2',
    })
  })

  it('omits the header on a Money Manager dry run', async () => {
    post.mockResolvedValue({ data: { status: 'preview' } })
    await importBackup(true, 'key-2')
    expect(post.mock.calls[0]?.[2].headers).toEqual({ 'Content-Type': 'application/gzip' })
  })
})
