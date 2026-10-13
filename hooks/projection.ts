import type { Point } from './svg'

/** The bridge is measured in metres: x across, y up from the crew pit floor, z along the walkway toward the viewport. */
export const CAMERA = { x: 0, y: 5.2, z: -3, pitch: 0.22, focal: 850, centerX: 500, centerY: 235 }

export type Projected = Point & { scale: number }

const COSINE = Math.cos(CAMERA.pitch)
const SINE = Math.sin(CAMERA.pitch)

/** Screen position of a world point, with the pixels per metre at that depth. */
export function project(x: number, y: number, z: number): Projected {
  const deltaY = y - CAMERA.y
  const deltaZ = z - CAMERA.z
  const depth = -deltaY * SINE + deltaZ * COSINE
  const up = deltaY * COSINE + deltaZ * SINE
  const scale = CAMERA.focal / depth

  return { x: CAMERA.centerX + (x - CAMERA.x) * scale, y: CAMERA.centerY - up * scale, scale }
}

/** The SVG matrix that maps a flat local rectangle onto a world face spanned by two edges from an origin. */
export function faceTransform(origin: Projected, alongX: Projected, alongY: Projected, width: number, height: number): string {
  const a = (alongX.x - origin.x) / width
  const b = (alongX.y - origin.y) / width
  const c = (alongY.x - origin.x) / height
  const d = (alongY.y - origin.y) / height

  return `matrix(${[a, b, c, d, origin.x, origin.y].map(value => Math.round(value * 1000) / 1000).join(' ')})`
}

/** The depth at which a point of the given height and offset lands on a screen row; rows grow with depth, so bisection finds it. */
export function depthAtScreenRow(row: number, x: number, y: number): number {
  let near = 1
  let far = 40
  for (let step = 0; step < 40; step += 1) {
    const middle = (near + far) / 2
    if (project(x, y, middle).y > row) near = middle
    else far = middle
  }
  return (near + far) / 2
}
