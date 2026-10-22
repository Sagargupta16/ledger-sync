/**
 * @vitest-environment node
 *
 * Guards the Money Manager request itself: the browser-native gzip, the body
 * and query flags the backend reads, and the Vercel body limit. Vercel rejects
 * a body over 4.5 MB before the API runs, which is why the backup is always
 * compressed (the owner's 4.96 MB backup gzips to 1.32 MB).
 *
 * Node rather than jsdom: jsdom's Blob has no stream(), while Node implements
 * the same Blob, CompressionStream and Response the browser provides.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  gzipBackup,
  moneyManagerBackupService,
  type MoneyManagerImportResponse,
} from '@/services/api/moneyManagerBackup'

const post = vi.hoisted(() =>
  vi.fn<(url: string, body: Blob, config: object) => Promise<{ data: MoneyManagerImportResponse }>>(),
)

vi.mock('@/services/api/client', () => ({ apiClient: { post } }))

const PREVIEW: MoneyManagerImportResponse = {
  status: 'preview',
  file_name: 'backup.mmbak',
  stats: { processed: 3, inserted: 1, updated: 1, deleted: 0, unchanged: 1 },
  summary: { transactions: 3, transfers: 0, accounts: 1, first_date: '2026-01-01', last_date: '2026-01-03' },
  analytics_status: 'skipped',
  analytics_message: null,
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('gzipBackup', () => {
  it('gzips with the native stream, and the bytes inflate back to the backup', async () => {
    const raw = new TextEncoder().encode(`SQLite format 3${'ledger row '.repeat(2000)}`)

    const gzipped = await gzipBackup(new Blob([raw]))
    const bytes = new Uint8Array(await gzipped.arrayBuffer())
    const inflated = await new Response(
      gzipped.stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer()

    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b])
    expect(gzipped.size).toBeLessThan(raw.byteLength / 10)
    expect(new Uint8Array(inflated)).toEqual(raw)
  })

  it('explains a browser that cannot compress', async () => {
    vi.stubGlobal('CompressionStream', undefined)

    await expect(gzipBackup(new Blob(['backup']))).rejects.toThrow(
      'This browser cannot compress the backup. Update your browser and try again.',
    )
  })
})

describe('moneyManagerBackupService.importBackup', () => {
  it('posts the gzip bytes with their content type and the import flags', async () => {
    post.mockResolvedValue({ data: PREVIEW })
    const backup = new Blob(['gzip bytes'])

    await expect(moneyManagerBackupService.importBackup({
      fileName: 'backup.mmbak',
      backup,
      dryRun: true,
      force: false,
      allowLargeDelete: true,
    })).resolves.toEqual(PREVIEW)
    expect(post).toHaveBeenCalledWith('/api/upload/money-manager', backup, {
      params: { file_name: 'backup.mmbak', dry_run: true, force: false, allow_large_delete: true },
      headers: { 'Content-Type': 'application/gzip' },
      timeout: 120_000,
    })
  })

  it('refuses a body Vercel would reject, without sending it', async () => {
    const backup = new Blob([new Uint8Array(4_500_001)])

    await expect(moneyManagerBackupService.importBackup({
      fileName: 'backup.mmbak',
      backup,
      dryRun: true,
      force: false,
      allowLargeDelete: true,
    })).rejects.toThrow('This backup is over 4.5 MB even after compression')
    expect(post).not.toHaveBeenCalled()
  })
})
