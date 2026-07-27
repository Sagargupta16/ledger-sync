import { describe, expect, it } from 'vitest'

import { PAGE_TITLES } from '../pageTitles'

import { ROUTES } from '@/constants'

/**
 * `PAGE_TITLES` is a hand-maintained map keyed by pathname, so it drifts the
 * moment a route is added without a matching entry -- and it fails quietly: the
 * header falls back to "Ledger Sync" and `document.title` loses its page name.
 * That is how `/data-health` and `/merchants` both shipped untitled.
 *
 * Keying off `ROUTES` means adding a route to the router is enough to fail this
 * test, rather than requiring anyone to remember this file exists.
 */

// Routes that intentionally have no workspace title. HOME redirects to the
// dashboard and DEMO is the pre-auth entry point, so neither renders inside
// AppLayout's titled shell.
const UNTITLED: ReadonlySet<string> = new Set([ROUTES.HOME, ROUTES.DEMO])

describe('PAGE_TITLES', () => {
  it('covers every route that renders inside the app shell', () => {
    const missing = Object.entries(ROUTES)
      .filter(([, path]) => !UNTITLED.has(path))
      .filter(([, path]) => !(path in PAGE_TITLES))
      .map(([name, path]) => `${name} (${path})`)

    expect(missing).toEqual([])
  })

  it('has no entries for paths that are not real routes', () => {
    // A stale key is dead weight that reads as coverage -- a renamed route
    // leaves the old title behind and the new one untitled.
    const known = new Set<string>(Object.values(ROUTES))
    expect(Object.keys(PAGE_TITLES).filter((path) => !known.has(path))).toEqual([])
  })

  it('gives every title non-empty text', () => {
    const blank = Object.entries(PAGE_TITLES)
      .filter(([, title]) => title.trim() === '')
      .map(([path]) => path)

    expect(blank).toEqual([])
  })
})
