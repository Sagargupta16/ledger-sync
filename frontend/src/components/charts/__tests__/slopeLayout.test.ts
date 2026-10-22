/**
 * SlopeChart's pure layout: on each side labels keep the minimum gap, stay inside the plot, keep their points'
 * order and remember their true y; ranks and rank moves are right, ties included; and the frame fit drops start
 * values and cuts names on a phone.
 */

import { describe, expect, it } from 'vitest'

import {
  layoutSlope, moveText, pickPoint, rankMoves, rankWords, slopeHeight, slopeItems, spreadLabels, stepIndex,
  type LabelSpot, type PlacedLabel, type SlopeDatum, type SpreadOptions,
} from '../slopeLayout'

const OPTIONS: SpreadOptions = { size: 16, gap: 2, top: 0, bottom: 240 }
const TOLERANCE = 1e-6

/** Spots at the given ys, keyed a, b, c and so on in argument order. */
const spots = (...ys: number[]): LabelSpot[] => ys.map((y, index) => ({ key: String.fromCodePoint(97 + index), y }))

/** What the chart relies on: every label once with its true y, points' order kept, a full step apart, boxes inside. */
function expectSpread(labels: readonly PlacedLabel[], input: readonly LabelSpot[], { size, gap, top, bottom }: SpreadOptions, step = size + gap) {
  const trueY = new Map(input.map((spot) => [spot.key, spot.y]))
  expect(labels).toHaveLength(input.length)
  labels.forEach((label, index) => {
    expect(label.y).toBe(trueY.get(label.key))
    expect(label.labelY - size / 2).toBeGreaterThanOrEqual(top - TOLERANCE)
    expect(label.labelY + size / 2).toBeLessThanOrEqual(bottom + TOLERANCE)
    if (index === 0) return
    expect(label.y).toBeGreaterThanOrEqual(labels[index - 1].y)
    expect(label.labelY - labels[index - 1].labelY).toBeGreaterThanOrEqual(step - TOLERANCE)
  })
}

/** A small seeded generator (mulberry32), so the random crowds are the same on every run. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('spreadLabels', () => {
  it('leaves labels that already clear each other on their points', () => {
    const input = spots(20, 60, 100)
    const labels = spreadLabels(input, OPTIONS)
    expect(labels.map((label) => label.labelY)).toEqual([20, 60, 100])
    expectSpread(labels, input, OPTIONS)
  })

  it('spreads a crowd evenly about its points, the minimum gap apart', () => {
    const input = spots(100, 100, 100)
    const labels = spreadLabels(input, OPTIONS)
    expect(labels.map((label) => label.labelY)).toEqual([82, 100, 118])
    expectSpread(labels, input, OPTIONS)
  })

  it("keeps the points' order and each label's true y", () => {
    const input = spots(50, 52, 51)
    const labels = spreadLabels(input, OPTIONS)
    expect(labels.map((label) => label.key)).toEqual(['a', 'c', 'b'])
    expect(labels.map((label) => label.labelY)).toEqual([33, 51, 69])
    expectSpread(labels, input, OPTIONS)
  })

  it('merges runs that collide once spread, centred on all their points', () => {
    const input = spots(100, 100, 120, 120)
    const labels = spreadLabels(input, OPTIONS)
    expect(labels.map((label) => label.labelY)).toEqual([83, 101, 119, 137])
    expectSpread(labels, input, OPTIONS)
  })

  it('pushes a crowd at either edge back inside the plot', () => {
    const atTop = spots(0, 1, 2)
    expect(spreadLabels(atTop, OPTIONS).map((label) => label.labelY)).toEqual([8, 26, 44])
    expectSpread(spreadLabels(atTop, OPTIONS), atTop, OPTIONS)
    const atBottom = spots(240, 239, 238)
    expect(spreadLabels(atBottom, OPTIONS).map((label) => label.labelY)).toEqual([196, 214, 232])
    expectSpread(spreadLabels(atBottom, OPTIONS), atBottom, OPTIONS)
  })

  it('shrinks the step evenly when one side cannot hold every label at the full gap', () => {
    const input = spots(...Array.from({ length: 20 }, () => 120))
    const labels = spreadLabels(input, OPTIONS)
    expect(labels[0].labelY).toBeCloseTo(8)
    expect(labels.at(-1)?.labelY).toBeCloseTo(232)
    expectSpread(labels, input, OPTIONS, (OPTIONS.bottom - OPTIONS.top - OPTIONS.size) / 19)
  })

  it('holds for random crowds of 3 to 10 labels, inside and outside the plot', () => {
    const random = seeded(2026)
    for (let run = 0; run < 300; run++) {
      const input = spots(...Array.from({ length: 3 + Math.floor(random() * 8) }, () => -40 + random() * 320))
      expectSpread(spreadLabels(input, OPTIONS), input, OPTIONS)
    }
  })
})

describe('rankMoves', () => {
  it('ranks the largest value first and counts the places each item climbed', () => {
    expect(rankMoves([{ start: 300, end: 100 }, { start: 200, end: 250 }, { start: 100, end: 300 }])).toEqual([
      { start: 1, end: 3, move: -2 }, { start: 2, end: 2, move: 0 }, { start: 3, end: 1, move: 2 },
    ])
  })

  it('gives tied values one shared rank', () => {
    expect(rankMoves([{ start: 100, end: 50 }, { start: 100, end: 50 }, { start: 50, end: 100 }])).toEqual([
      { start: 1, end: 2, move: -1 }, { start: 1, end: 2, move: -1 }, { start: 3, end: 1, move: 2 },
    ])
  })

  it('reads moves as text and words', () => {
    expect([moveText(2), moveText(-1), moveText(0)]).toEqual(['+2', '-1', ''])
    expect(rankWords({ start: 3, end: 1, move: 2 })).toBe('3 to 1, up 2')
    expect(rankWords({ start: 1, end: 3, move: -2 })).toBe('1 to 3, down 2')
    expect(rankWords({ start: 2, end: 2, move: 0 })).toBe('2, unchanged')
  })
})

const rupees = (value: number) => `₹${value.toFixed(2)}`
const DATA: SlopeDatum[] = [
  { key: 'rent', label: 'Rent', start: 300, end: 100 },
  { key: 'food', label: 'Food', start: 200, end: 250 },
  { key: 'fuel', label: 'Fuel', start: 50, end: 50 },
]

describe('slopeItems', () => {
  it('orders items by end value and colours spending rises as expenses', () => {
    const items = slopeItems(DATA, 'spending', rupees)
    expect(items.map((item) => item.key)).toEqual(['food', 'rent', 'fuel'])
    expect(items.map((item) => item.color)).toEqual(['var(--color-expense)', 'var(--color-income)', 'var(--chart-neutral)'])
    expect(items.map((item) => item.change)).toEqual(['+₹50.00 (+25.0%)', '-₹200.00 (-66.7%)', 'no change'])
    expect(items.map((item) => item.rank.move)).toEqual([1, -1, 0])
  })

  it('flips the colours for income and plots a missing value as zero', () => {
    expect(slopeItems(DATA, 'income', rupees).map((item) => item.color).slice(0, 2)).toEqual(['var(--color-income)', 'var(--color-expense)'])
    const [item] = slopeItems([{ key: 'new', label: 'New', start: Number.NaN, end: 100 }], 'spending', rupees)
    expect([item.start, item.change]).toEqual([0, '+₹100.00'])
  })
})

describe('stepIndex', () => {
  it('steps in end order, stops at the ends and jumps with Home and End', () => {
    expect([stepIndex('ArrowDown', -1, 4), stepIndex('ArrowUp', -1, 4), stepIndex('ArrowRight', 1, 4)]).toEqual([0, 3, 2])
    expect([stepIndex('ArrowDown', 3, 4), stepIndex('ArrowLeft', 0, 4), stepIndex('Home', 2, 4), stepIndex('End', 0, 4)]).toEqual([3, 0, 0, 3])
    expect([stepIndex('Enter', 1, 4), stepIndex('ArrowDown', -1, 0)]).toEqual([null, null])
  })
})

const CATEGORIES = [
  'Rent', 'Food & Dining', 'Entertainment & Subscriptions', 'Shopping', 'Transportation', 'Bills & Utilities', 'Healthcare',
  'Travel', 'Groceries', 'Education',
]
const MANY = slopeItems(CATEGORIES.map((label, index) => ({
  key: label, label, start: 100000 - index * 9000, end: index % 3 === 0 ? 40000 + index * 7000 : 98000 - index * 9100,
})), 'spending', rupees)

describe('layoutSlope', () => {
  it('fits a phone: drops start values, cuts long names and keeps every label clear and inside the plot', () => {
    const layout = layoutSlope(MANY, { width: 309, height: slopeHeight(MANY.length, true), mobile: true }, 'FY 2024-25', 'FY 2025-26')
    expect(layout.startValues).toBe(false)
    expect(layout.points.find((point) => point.key === 'Entertainment & Subscriptions')?.name).toMatch(/…$/)
    expect(layout.x0).toBeGreaterThan(0)
    expect(layout.x1).toBeGreaterThan(layout.x0 + 60)
    expect(layout.points.map((point) => point.end)).toEqual(MANY.map((item) => item.end).toSorted((a, b) => b - a))
    for (const side of ['label0', 'label1'] as const) {
      const centres = layout.points.map((point) => point[side]).toSorted((a, b) => a - b)
      centres.forEach((centre, index) => {
        expect(centre).toBeGreaterThanOrEqual(layout.top - TOLERANCE)
        expect(centre).toBeLessThanOrEqual(layout.bottom + TOLERANCE)
        if (index > 0) expect(centre - centres[index - 1]).toBeGreaterThanOrEqual(layout.line + 2 - TOLERANCE)
      })
    }
  })

  it('keeps start values and full names on a wide frame, with the plot capped', () => {
    const layout = layoutSlope(MANY, { width: 1000, height: slopeHeight(MANY.length, false), mobile: false }, 'FY 2024-25', 'FY 2025-26')
    expect(layout.startValues).toBe(true)
    expect(layout.points.every((point) => point.name === point.label)).toBe(true)
    expect(layout.x1 - layout.x0).toBeLessThanOrEqual(480 + TOLERANCE)
  })

  it('breaks a long period name before its qualifier, bottom-aligned with the other name', () => {
    const layout = layoutSlope(MANY, { width: 309, height: 300, mobile: true }, 'September 2025 (to same day)', 'Oct 2025')
    const [start, end] = layout.headers
    expect(start.lines.map((line) => line.text)).toEqual(['September 2025', '(to same day)'])
    expect(end.lines).toHaveLength(1)
    expect(end.lines[0].y).toBe(start.lines[1].y)
  })

  it('reads the nearest line over the plot and the nearest label beside an axis', () => {
    const layout = layoutSlope(MANY, { width: 1000, height: 388, mobile: false }, 'A', 'B')
    const [first, second] = layout.points
    const middle = (layout.x0 + layout.x1) / 2
    expect(pickPoint(layout, middle, (first.y0 + first.y1) / 2)?.key).toBe(first.key)
    expect(pickPoint(layout, layout.x1 + 40, second.label1)?.key).toBe(second.key)
    expect(pickPoint(layout, 0, first.label0)?.key).toBe(first.key)
  })
})
