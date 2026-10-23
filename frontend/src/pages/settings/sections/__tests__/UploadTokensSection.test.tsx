/**
 * Upload tokens let an iPhone Shortcut post Money Manager backups without
 * OAuth. Settings creates and revokes them immediately, outside the page's
 * draft and Save, and shows the plaintext exactly once: it reaches the
 * one-time dialog through component state only, never the query or mutation
 * cache, and is gone from the page once that dialog closes.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CreatedUploadToken, UploadToken } from '@/services/api/uploadTokens'
import { useDemoStore } from '@/store/demoStore'

import UploadTokensSection from '../UploadTokensSection'

const api = vi.hoisted(() => ({
  listTokens: vi.fn<() => Promise<UploadToken[]>>(),
  createToken: vi.fn<(name: string) => Promise<CreatedUploadToken>>(),
  revokeToken: vi.fn<(id: number) => Promise<void>>(),
}))

vi.mock('@/services/api/uploadTokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api/uploadTokens')>()),
  uploadTokensService: api,
}))

/** Synthetic, shaped like a token; never a real credential. */
const PLAINTEXT = 'lsu_ab12cd34EXAMPLEnotARealToken0123456789abcdef'

function makeToken(overrides: Partial<UploadToken> = {}): UploadToken {
  return {
    id: 1,
    name: 'iPhone Shortcut',
    prefix: 'lsu_ab12cd34',
    // Midday UTC keeps the calendar day the same in every common time zone.
    created_at: '2026-10-01T12:00:00Z',
    expires_at: '2027-10-01T12:00:00Z',
    last_used_at: null,
    ...overrides,
  }
}

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <UploadTokensSection index={0} />
    </QueryClientProvider>,
  )
  // Sections render collapsed; open this one so its body is in the tree.
  fireEvent.click(screen.getByRole('button', { name: /Upload Tokens/ }))
  return client
}

beforeAll(() => {
  // jsdom has no native modal lifecycle; mirror the part the dialogs use.
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

beforeEach(() => {
  vi.resetAllMocks()
  useDemoStore.getState().exitDemo()
  api.listTokens.mockResolvedValue([])
})

describe('UploadTokensSection', () => {
  it('lists each active token with its prefix and dates, and names the upload URL', async () => {
    api.listTokens.mockResolvedValue([
      makeToken({ id: 1, name: 'iPhone Shortcut' }),
      makeToken({ id: 2, name: 'iPad', prefix: 'lsu_ff00ee11', last_used_at: '2026-10-21T12:00:00Z' }),
    ])
    renderSection()

    const list = await screen.findByRole('list', { name: 'Active tokens' })
    const [phone, tablet] = within(list).getAllByRole('listitem')
    expect(phone).toHaveTextContent('iPhone Shortcut')
    expect(phone).toHaveTextContent('lsu_ab12cd34')
    expect(phone).toHaveTextContent(/Created\s*Oct 1, 2026/)
    expect(phone).toHaveTextContent(/Last used\s*Never/)
    expect(phone).toHaveTextContent(/Expires\s*Oct 1, 2027/)
    expect(tablet).toHaveTextContent('lsu_ff00ee11')
    expect(tablet).toHaveTextContent(/Last used\s*Oct 21, 2026/)
    expect(screen.getByText('2 of 5')).toBeInTheDocument()
    expect(screen.getByText(/^https?:\/\/.+\/api\/upload\/money-manager$/)).toBeInTheDocument()
  })

  it('creates a token from the default name and shows the plaintext only once', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const created = makeToken({ id: 7 })
    api.createToken.mockImplementation((name) => {
      api.listTokens.mockResolvedValue([created])
      return Promise.resolve({ ...created, name, token: PLAINTEXT })
    })
    const client = renderSection()

    expect(screen.getByLabelText('Token name')).toHaveValue('iPhone Shortcut')
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }))

    const dialog = await screen.findByRole('dialog', { name: 'Copy your upload token' })
    expect(api.createToken).toHaveBeenCalledExactlyOnceWith('iPhone Shortcut')
    const field = within(dialog).getByLabelText('Upload token')
    expect(field).toHaveValue(PLAINTEXT)
    expect(field).toHaveAttribute('readonly')
    expect(dialog).toHaveTextContent("won't be shown again")
    expect(dialog).toHaveTextContent('Authorization header as Bearer <token>')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy token' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(PLAINTEXT))
    expect(await within(dialog).findByText('Copied to the clipboard.')).toBeInTheDocument()

    // Component state holds the only copy: the settled mutation is dropped and
    // the list cache carries metadata only.
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0))
    const cached = JSON.stringify(client.getQueryCache().getAll().map((query) => query.state.data))
    expect(cached).not.toContain(PLAINTEXT)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 3000 })
    expect(screen.queryByDisplayValue(PLAINTEXT)).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(PLAINTEXT)
    expect(await screen.findByRole('list', { name: 'Active tokens' })).toHaveTextContent('lsu_ab12cd34')
  })

  it('revokes a token only after confirmation', async () => {
    api.listTokens.mockResolvedValue([makeToken({ id: 3, name: 'Old phone' })])
    api.revokeToken.mockImplementation(() => {
      api.listTokens.mockResolvedValue([])
      return Promise.resolve()
    })
    renderSection()

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Old phone' }))
    const cancelled = screen.getByRole('alertdialog', { name: 'Revoke upload token?' })
    expect(cancelled).toHaveTextContent('"Old phone" (lsu_ab12cd34...) stops working right away.')
    fireEvent.click(within(cancelled).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(), { timeout: 3000 })
    expect(api.revokeToken).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Revoke Old phone' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Revoke upload token?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke token' }))

    await waitFor(() => expect(api.revokeToken).toHaveBeenCalledExactlyOnceWith(3))
    expect(await screen.findByText('No upload tokens yet')).toBeInTheDocument()
  })

  it('blocks a sixth token while five are active', async () => {
    api.listTokens.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => makeToken({ id: i + 1, name: `Device ${i + 1}` })),
    )
    renderSection()

    expect(await screen.findByText(/You have 5 active tokens, the most allowed/)).toBeInTheDocument()
    expect(screen.getByText('5 of 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create token' })).toBeDisabled()
  })

  it('shows the server message when a create is refused and refreshes the list', async () => {
    api.listTokens.mockResolvedValue([makeToken()])
    api.createToken.mockRejectedValue(Object.assign(new Error('Request failed with status code 409'), {
      response: { status: 409, data: { detail: 'You already have 5 active upload tokens.' } },
    }))
    renderSection()
    await screen.findByRole('list', { name: 'Active tokens' })

    fireEvent.click(screen.getByRole('button', { name: 'Create token' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have 5 active upload tokens.')
    await waitFor(() => expect(api.listTokens).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is disabled with a note in demo mode and never requests tokens', () => {
    useDemoStore.getState().enterDemo()
    renderSection()

    expect(
      screen.getByText('Demo mode is read-only. Creating an upload token requires your own account.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Token name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create token' })).toBeDisabled()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(api.listTokens).not.toHaveBeenCalled()
  })

  it('offers a retry when the list cannot load', async () => {
    api.listTokens.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([])
    renderSection()

    expect(await screen.findByText('Could not load upload tokens')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    expect(await screen.findByText('No upload tokens yet')).toBeInTheDocument()
  })
})
