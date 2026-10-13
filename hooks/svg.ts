export type Point = { x: number; y: number }

export const PALETTE = {
  void: '#02040a',
  hullDark: '#0b0d11',
  hull: '#171a20',
  hullMid: '#252a32',
  hullLight: '#3a414b',
  hullEdge: '#5d6672',
  steel: '#8a95a3',
  lamp: '#e8f1f7',
  green: '#7dffb2',
  greenDim: '#2f8a5c',
  greenDeep: '#0b2a1b',
  amber: '#ffb54a',
  amberDim: '#8f5f1d',
  red: '#ff4438',
  redDim: '#7a1d17',
  screen: '#030d08',
}

/** A number rounded to one decimal, as short as possible. */
export function round(value: number): string {
  return String(Math.round(value * 10) / 10)
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function pointsOf(points: Point[]): string {
  return points.map(point => `${round(point.x)},${round(point.y)}`).join(' ')
}

export function polygon(points: Point[], attributes: string): string {
  return `<polygon points="${pointsOf(points)}" ${attributes}/>`
}

export function line(from: Point, to: Point, attributes: string): string {
  return `<line x1="${round(from.x)}" y1="${round(from.y)}" x2="${round(to.x)}" y2="${round(to.y)}" ${attributes}/>`
}

type TextOptions = {
  size?: number
  anchor?: 'start' | 'middle' | 'end'
  weight?: number
  opacity?: number
  spacing?: number
}

export function text(x: number, y: number, content: string, fill: string, options: TextOptions = {}): string {
  const { size = 14, anchor = 'start', weight = 400, opacity = 1, spacing = 0 } = options
  const extras = `${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}${weight === 400 ? '' : ` font-weight="${weight}"`}${opacity === 1 ? '' : ` opacity="${opacity}"`}${spacing === 0 ? '' : ` letter-spacing="${spacing}"`}`
  return `<text x="${round(x)}" y="${round(y)}" fill="${fill}" font-size="${size}"${extras}>${escapeXml(content)}</text>`
}

/** Deterministic pseudo-random numbers between 0 and 1, so a scene redraws identically. */
export function randomSequence(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export function seedOf(word: string): number {
  return [...word].reduce((seed, character) => Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261)
}

/**
 * Decorative pseudo-Aurebesh: each glyph is a few strokes between points of a 3 by 4 grid,
 * drawn as one path. It carries no meaning.
 */
export function glyphString(x: number, y: number, seed: string, count: number, size: number, color: string, opacity = 1): string {
  const random = randomSequence(seedOf(seed))
  const step = size * 0.78
  let path = ''
  for (let glyph = 0; glyph < count; glyph += 1) {
    const originX = x + glyph * step
    const strokes = 2 + Math.floor(random() * 3)
    let current = { column: Math.floor(random() * 3), row: Math.floor(random() * 4) }
    for (let stroke = 0; stroke < strokes; stroke += 1) {
      const next = { column: Math.floor(random() * 3), row: Math.floor(random() * 4) }
      const horizontal = (point: { column: number; row: number }) => round(originX + point.column * size * 0.28)
      const vertical = (point: { column: number; row: number }) => round(y - size + point.row * size * 0.3)
      path += `M${horizontal(current)} ${vertical(current)}L${horizontal(next)} ${vertical(next)}`
      current = next
    }
  }
  return `<path d="${path}" fill="none" stroke="${color}" stroke-width="1" stroke-linecap="square" opacity="${opacity}"/>`
}
