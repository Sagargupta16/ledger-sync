/**
 * Pins the squarified treemap: the worked example from Bruls, Huizing and van Wijk (2000) tile for tile,
 * then the properties every layout must keep on spending-shaped data (areas proportional to values, no
 * overlaps, nothing outside the box, the box covered, tiles near square), the zoom geometry a view builds
 * from it, and the label tiers a tile shows.
 */

import { describe, expect, it } from 'vitest'

import { layoutTreemap, rankByValue, squarify, type TreemapNodeInput, type TreemapRect } from '../treemapLayout'
import { fitLabel, mapRect, treemapView, type TreemapNode } from '../treemapModel'

const EPS = 1e-6
const area = (rect: TreemapRect) => rect.width * rect.height
const aspect = (rect: TreemapRect) => Math.max(rect.width / rect.height, rect.height / rect.width)
const node = (id: string, value: number, children?: TreemapNodeInput[]): TreemapNodeInput => ({ id, label: id, value, children })

/** Overlapping area of two rects; touching edges overlap by zero. */
function overlap(a: TreemapRect, b: TreemapRect): number {
  const across = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const down = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return across > 0 && down > 0 ? across * down : 0
}

function expectInside(rect: TreemapRect, box: TreemapRect) {
  expect(rect.x).toBeGreaterThanOrEqual(box.x - EPS)
  expect(rect.y).toBeGreaterThanOrEqual(box.y - EPS)
  expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width + EPS)
  expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height + EPS)
}

function expectNoOverlaps(rects: readonly TreemapRect[]) {
  rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBeLessThan(EPS)))
}

function expectRect(actual: TreemapRect, expected: TreemapRect) {
  expect(actual.x).toBeCloseTo(expected.x, 6)
  expect(actual.y).toBeCloseTo(expected.y, 6)
  expect(actual.width).toBeCloseTo(expected.width, 6)
  expect(actual.height).toBeCloseTo(expected.height, 6)
}

/** Twelve expense categories with a realistic long tail. */
const SPEND = [42_000, 18_500, 12_000, 9_800, 7_600, 5_200, 4_100, 3_300, 2_100, 1_500, 900, 400].map((value, i) => node(`c${i}`, value))
/** Forty pseudo-random values from a fixed seed, so the run is repeatable. */
const NOISY = (() => {
  let seed = 7
  return Array.from({ length: 40 }, (_, i) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    return node(`n${i}`, Math.round(50 + (seed / 2_147_483_648) * 5_000))
  })
})()
const BOXES: Record<string, TreemapRect> = {
  phone: { x: 0, y: 0, width: 343, height: 320 },
  desktop: { x: 0, y: 0, width: 1100, height: 380 },
  // The plot lays out half a gap past each edge, so boxes do not start at the origin.
  offset: { x: -1.5, y: -1.5, width: 346, height: 323 },
}

describe('squarify', () => {
  it('reproduces the worked example of Bruls et al. tile for tile', () => {
    const tiles = squarify([6, 6, 4, 3, 2, 2, 1].map((value, i) => node(`${i}`, value)), { x: 0, y: 0, width: 6, height: 4 })

    const expected = [
      { x: 0, y: 0, width: 3, height: 2 },
      { x: 0, y: 2, width: 3, height: 2 },
      { x: 3, y: 0, width: 12 / 7, height: 7 / 3 },
      { x: 3 + 12 / 7, y: 0, width: 9 / 7, height: 7 / 3 },
      { x: 3, y: 7 / 3, width: 1.2, height: 5 / 3 },
      { x: 4.2, y: 7 / 3, width: 1.2, height: 5 / 3 },
      { x: 5.4, y: 7 / 3, width: 0.6, height: 5 / 3 },
    ]
    expect(tiles.map((tile) => tile.node.value)).toEqual([6, 6, 4, 3, 2, 2, 1])
    tiles.forEach((tile, i) => expectRect(tile, expected[i]))
  })

  for (const [dataName, data] of Object.entries({ SPEND, NOISY })) {
    for (const [boxName, box] of Object.entries(BOXES)) {
      it(`keeps ${dataName} proportional, disjoint, inside and covering the ${boxName} box`, () => {
        const tiles = squarify(data, box)
        const total = data.reduce((sum, item) => sum + item.value, 0)

        expect(tiles).toHaveLength(data.length)
        for (const tile of tiles) {
          expect(area(tile) / area(box)).toBeCloseTo(tile.node.value / total, 9)
          expectInside(tile, box)
        }
        expectNoOverlaps(tiles)
        expect(tiles.reduce((sum, tile) => sum + area(tile), 0)).toBeCloseTo(area(box), 6)
      })
    }
  }

  it('keeps tiles near square on spending data, where slices would be slivers', () => {
    // Measured: the worst tile is 2.57:1 on the phone box and 2.01:1 on desktop; the median is about 1.5.
    for (const box of [BOXES.phone, BOXES.desktop]) {
      const ratios = squarify(SPEND, box).map(aspect).sort((a, b) => a - b)
      expect(ratios.at(-1)).toBeLessThanOrEqual(3)
      expect(ratios[Math.floor(ratios.length / 2)]).toBeLessThanOrEqual(2)
    }
    // Four or nine equal values in a square come out as exact squares.
    for (const count of [4, 9]) {
      const tiles = squarify(Array.from({ length: count }, (_, i) => node(`${i}`, 1)), { x: 0, y: 0, width: 90, height: 90 })
      for (const tile of tiles) expect(aspect(tile)).toBeCloseTo(1, 9)
    }
  })

  it('skips zero, negative and non-finite values', () => {
    const tiles = squarify([node('a', 5), node('zero', 0), node('neg', -3), node('nan', Number.NaN), node('inf', Infinity), node('b', 5)], BOXES.phone)

    expect(tiles.map((tile) => tile.node.id)).toEqual(['a', 'b'])
    expect(tiles.reduce((sum, tile) => sum + area(tile), 0)).toBeCloseTo(area(BOXES.phone), 6)
  })

  it('returns no tiles for an empty input or a box without area', () => {
    expect(squarify([], BOXES.phone)).toEqual([])
    expect(squarify([node('zero', 0)], BOXES.phone)).toEqual([])
    expect(squarify(SPEND, { x: 0, y: 0, width: 0, height: 300 })).toEqual([])
  })

  it('is deterministic: largest first, ties in input order, the same rects every run', () => {
    const input = [node('small', 1), node('tie-a', 4), node('big', 9), node('tie-b', 4)]

    expect(rankByValue(input).map((item) => item.id)).toEqual(['big', 'tie-a', 'tie-b', 'small'])
    expect(squarify(input, BOXES.phone)).toEqual(squarify([...input], BOXES.phone))
  })
})

describe('layoutTreemap', () => {
  const nodes = [
    node('housing', 360_000, [node('rent', 300_000), node('maintenance', 60_000)]),
    node('food', 100_000, [node('groceries', 55_000), node('restaurants', 30_000), node('delivery', 15_000), node('none', 0)]),
    node('travel', 40_000),
  ]

  it('lays each category out in the box and its children inside its rect', () => {
    const cells = layoutTreemap(nodes, BOXES.phone)

    expect(cells.map((cell) => cell.node.id)).toEqual(['housing', 'food', 'travel'])
    expectNoOverlaps(cells)
    for (const cell of cells) {
      expectInside(cell, BOXES.phone)
      const childTotal = (cell.node.children ?? []).reduce((sum, child) => sum + Math.max(0, child.value), 0)
      for (const child of cell.children) {
        expectInside(child, cell)
        expect(area(child) / area(cell)).toBeCloseTo(child.node.value / childTotal, 9)
      }
      expectNoOverlaps(cell.children)
    }
  })

  it('gives a category without positive children an empty child list', () => {
    const cells = layoutTreemap(nodes, BOXES.desktop)

    expect(cells.find((cell) => cell.node.id === 'travel')?.children).toEqual([])
    expect(cells.find((cell) => cell.node.id === 'food')?.children.map((child) => child.node.id)).toEqual(['groceries', 'restaurants', 'delivery'])
  })
})

describe('treemapView zoom geometry', () => {
  const box = BOXES.offset
  const color = 'var(--color-app-orange)'
  const nodes: TreemapNode[] = [
    { ...node('housing', 360_000, [node('rent', 300_000), node('maintenance', 60_000)]), color },
    { ...node('food', 100_000, [node('groceries', 55_000), node('restaurants', 30_000), node('delivery', 15_000)]), color },
    { ...node('travel', 40_000), color },
  ]

  it('maps the opened category onto the whole box and pushes its siblings out past the edges', () => {
    const view = treemapView(nodes, 'food', box)
    const parent = view.find((tile) => tile.key === 'food')

    expect(parent?.shown).toBe(false)
    expectRect(parent?.rect ?? box, box)
    for (const sibling of view.filter((tile) => tile.key === 'housing' || tile.key === 'travel')) {
      expect(overlap(sibling.rect, box)).toBeLessThan(EPS)
      expect(sibling.live).toBe(false)
    }
  })

  it('lays the children out for the whole box and starts them as an exact copy inside the opened tile', () => {
    const cell = squarify(nodes, box).find((tile) => tile.node.id === 'food')
    const children = treemapView(nodes, 'food', box).filter((tile) => tile.key.startsWith('food\u001f'))

    expect(cell).toBeDefined()
    if (!cell) return
    expect(children.map((child) => child.node.id)).toEqual(['groceries', 'restaurants', 'delivery'])
    squarify(nodes[1].children ?? [], box).forEach((expected, i) => expectRect(children[i].rect, expected))
    // The origins partition the category's own tile, so its children grow out of it in one motion.
    for (const child of children) {
      expectInside(child.origin, cell)
      expectRect(child.origin, mapRect(child.rect, box, cell))
    }
    expectNoOverlaps(children.map((child) => child.origin))
    expect(children.reduce((sum, child) => sum + area(child.origin), 0)).toBeCloseTo(area(cell), 6)
  })

  it('shows the top level for a category with nothing inside or an unknown id', () => {
    for (const openId of ['travel', 'missing', null]) {
      const view = treemapView(nodes, openId, box)
      expect(view).toHaveLength(3)
      expect(view.every((tile) => tile.live && tile.shown)).toBe(true)
    }
  })
})

describe('fitLabel', () => {
  it('shows the name and the whole amount when both fit', () => {
    expect(fitLabel('Groceries', '₹5,000.00', 160, 60, false)).toEqual({ name: 'Groceries', value: '₹5,000.00' })
  })

  it('drops the amount rather than cutting it when the tile is too narrow or too short for a second row', () => {
    expect(fitLabel('Rent', '₹30,000.00', 70, 60, false)).toEqual({ name: 'Rent' })
    expect(fitLabel('Groceries', '₹5,000.00', 160, 35, false)).toEqual({ name: 'Groceries' })
  })

  it('shortens a long name with an ellipsis, then shows nothing once even that cannot fit', () => {
    // One 16px row plus 8px padding above and below needs 32px of height.
    expect(fitLabel('Entertainment & Recreations', '₹1.00', 100, 40, false)).toEqual({ name: 'Entertainm…' })
    // Six characters of room cut "Food & Dining" to "Food " and the trailing space goes before the ellipsis.
    expect(fitLabel('Food & Dining', '₹1.00', 60, 40, false)).toEqual({ name: 'Food…' })
    expect(fitLabel('Groceries', '₹5,000.00', 40, 60, false)).toBeNull()
    expect(fitLabel('Groceries', '₹5,000.00', 160, 30, false)).toBeNull()
  })

  it('uses the smaller phone type, which fits more in the same tile', () => {
    expect(fitLabel('Groceries', '₹5,000.00', 88, 40, true)).toEqual({ name: 'Groceries', value: '₹5,000.00' })
    expect(fitLabel('Groceries', '₹5,000.00', 88, 40, false)).toEqual({ name: 'Groceries' })
  })
})
