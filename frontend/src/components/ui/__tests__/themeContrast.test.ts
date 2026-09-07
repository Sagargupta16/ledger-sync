/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const themeCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

function themeBlock(start: string, end?: string): string {
  const startIndex = themeCss.indexOf(start)
  if (startIndex < 0) throw new Error(`Missing block ${start}: ${themeCss.slice(0, 300)}`)
  const endIndex = end ? themeCss.indexOf(end, startIndex) : themeCss.length
  return themeCss.slice(startIndex, endIndex)
}

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`Missing ${name}`)
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

function expectAa(foreground: string, ...backgrounds: string[]) {
  for (const background of backgrounds) {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
  }
}

const darkTheme = themeBlock('@theme {', "/* ===== LIGHT THEME ===== */")
const lightTheme = themeBlock("[data-theme='light'] {", '\n* {')

describe('theme control contrast', () => {
  it('keeps dark-theme primary, danger, and warning controls AA compliant', () => {
    expectAa(
      token(darkTheme, '--color-primary-foreground'),
      token(darkTheme, '--color-app-blue'),
      token(darkTheme, '--color-app-blue-vibrant'),
    )
    expectAa(
      token(darkTheme, '--color-destructive-foreground'),
      token(darkTheme, '--color-app-red'),
      token(darkTheme, '--color-app-red-vibrant'),
    )
    expectAa(
      token(darkTheme, '--color-on-orange'),
      token(darkTheme, '--color-app-orange'),
      token(darkTheme, '--color-app-orange-vibrant'),
    )
    expectAa(
      token(darkTheme, '--color-on-warning'),
      token(darkTheme, '--color-app-yellow'),
      token(darkTheme, '--color-app-yellow-vibrant'),
    )
  })

  it('keeps light-theme primary, danger, and warning controls AA compliant', () => {
    expectAa(
      token(lightTheme, '--color-primary-foreground'),
      token(lightTheme, '--color-app-blue'),
      token(lightTheme, '--color-app-blue-vibrant'),
    )
    expectAa(
      token(lightTheme, '--color-destructive-foreground'),
      token(lightTheme, '--color-app-red'),
      token(lightTheme, '--color-app-red-vibrant'),
    )
    expectAa(
      token(lightTheme, '--color-on-orange'),
      token(lightTheme, '--color-app-orange'),
      token(lightTheme, '--color-app-orange-vibrant'),
    )
    expectAa(
      token(darkTheme, '--color-on-warning'),
      token(lightTheme, '--color-app-yellow'),
      token(lightTheme, '--color-app-yellow-vibrant'),
    )
  })

  it('stops root scrolling and CSS animations in reduced mode', () => {
    const reducedBlock = themeBlock(
      "html[data-motion='reduced'],",
      '/* ===== PAGE TRANSITION ===== */',
    )

    expect(reducedBlock).toContain("html[data-motion='reduced']")
    expect(reducedBlock).toContain('animation: none !important')
    expect(reducedBlock).toContain('scroll-behavior: auto !important')
    expect(reducedBlock).toContain('transition: none !important')
    expect(reducedBlock).toContain('opacity: 1 !important')
    expect(reducedBlock).toContain('transform: none !important')
  })
})
