/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
const homeSource = readFileSync(resolve(process.cwd(), 'src/pages/home/HomePage.tsx'), 'utf8')
const heroSource = readFileSync(
  resolve(process.cwd(), 'src/pages/home/components/Hero.tsx'),
  'utf8',
)

function block(start: string, end?: string): string {
  const startIndex = css.indexOf(start)
  if (startIndex < 0) throw new Error(`Missing CSS block: ${start}`)

  const endIndex = end ? css.indexOf(end, startIndex) : css.length
  if (endIndex < 0) throw new Error(`Missing CSS block boundary: ${end}`)

  return css.slice(startIndex, endIndex)
}

function token(theme: string, name: string): string {
  const match = theme.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`Missing theme token: ${name}`)
  return match[1]
}

function linearChannel(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  const red = linearChannel((value >> 16) & 0xff)
  const green = linearChannel((value >> 8) & 0xff)
  const blue = linearChannel(value & 0xff)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

function classNamesContaining(source: string, utility: string): string[] {
  return [...source.matchAll(/className="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((className): className is string => className?.split(/\s+/).includes(utility) ?? false)
}

const darkTheme = block('@theme {', '/* ===== LIGHT THEME ===== */')
const lightTheme = block("[data-theme='light'] {", '\n* {')

describe('home CTA contrast', () => {
  it.each([
    ['dark', darkTheme],
    ['light', lightTheme],
  ])('keeps %s-theme primary CTA text AA compliant by default and on hover', (_, theme) => {
    const foreground = token(theme, '--color-primary-foreground')
    const backgrounds = [
      token(theme, '--color-app-blue'),
      token(theme, '--color-app-blue-vibrant'),
    ]

    for (const background of backgrounds) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('uses the tested pair for primary CTAs and keeps demo actions secondary', () => {
    const primaryCtas = [
      ...classNamesContaining(homeSource, 'bg-primary'),
      ...classNamesContaining(heroSource, 'bg-primary'),
    ]
    const secondaryCtas = [
      ...classNamesContaining(homeSource, 'ledger-control'),
      ...classNamesContaining(heroSource, 'ledger-control'),
    ]

    expect(primaryCtas).toHaveLength(4)
    expect(secondaryCtas).toHaveLength(2)

    for (const className of primaryCtas) {
      expect(className.split(/\s+/)).toEqual(
        expect.arrayContaining([
          'text-primary-foreground',
          'hover:bg-app-blue-vibrant',
          'hover:text-primary-foreground',
        ]),
      )
    }

    for (const className of secondaryCtas) {
      expect(className.split(/\s+/)).toContain('text-foreground')
      expect(className.split(/\s+/)).not.toContain('bg-primary')
    }
  })
})
