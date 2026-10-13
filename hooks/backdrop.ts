import { faceTransform, project } from './projection'
import { PALETTE, glyphString, line, pointsOf, polygon, randomSequence, round } from './svg'
import type { Point } from './svg'

export const HALL_HALF_WIDTH = 9.5
export const WALL_Z = 17
export const NEAR_Z = 1
export const WALKWAY = { halfWidth: 1.55, height: 0.9, nearZ: 1, farZ: 16.2 }
export const THRAWN_Z = 14.6
const SILL_HEIGHT = 1.2
const WINDOW_TOP = 5.4
const PANEL_COUNT = 9
const MULLION = 0.22

function windowPanels(): Point[][] {
  const panels: Point[][] = []
  const width = (2 * HALL_HALF_WIDTH) / PANEL_COUNT
  for (let index = 0; index < PANEL_COUNT; index += 1) {
    const left = -HALL_HALF_WIDTH + index * width + MULLION
    const right = -HALL_HALF_WIDTH + (index + 1) * width - MULLION
    panels.push([
      project(left, SILL_HEIGHT, WALL_Z),
      project(right, SILL_HEIGHT, WALL_Z),
      project(right * 1.14, WINDOW_TOP, WALL_Z),
      project(left * 1.14, WINDOW_TOP, WALL_Z),
    ])
  }
  return panels
}

function drawSpace(panels: Point[][], isJumping: boolean, now: number): string {
  const left = Math.min(...panels.flat().map(point => point.x))
  const right = Math.max(...panels.flat().map(point => point.x))
  const top = Math.min(...panels.flat().map(point => point.y))
  const bottom = Math.max(...panels.flat().map(point => point.y))
  const centerX = (left + right) / 2
  const centerY = bottom - (bottom - top) * 0.42
  const random = randomSequence(7)
  let stars = ''
  for (let index = 0; index < 150; index += 1) {
    const x = left + random() * (right - left)
    const y = top + random() * (bottom - top)
    const radius = 0.35 + random() * random() * 1.1
    stars += `<circle cx="${round(x)}" cy="${round(y)}" r="${round(radius)}" fill="#dfeaff" opacity="${round(0.25 + random() * 0.7)}"/>`
  }
  let content: string
  if (isJumping) {
    let streaks = ''
    const reach = (right - left) * 0.62
    for (let index = 0; index < 110; index += 1) {
      const angle = random() * Math.PI * 2
      const speed = 0.5 + random() * 0.9
      const progress = (random() + (now / 2600) * speed) % 1
      const distance = progress * progress * reach + 6
      const length = 6 + progress * progress * 130 * speed
      const inner = Math.max(2, distance - length)
      const opacity = Math.min(1, 0.15 + progress * 0.95)
      const color = random() > 0.8 ? '#ffe9c8' : '#bcd8ff'
      streaks += `<line x1="${round(centerX + Math.cos(angle) * inner)}" y1="${round(centerY + Math.sin(angle) * inner * 0.62)}" x2="${round(centerX + Math.cos(angle) * distance)}" y2="${round(centerY + Math.sin(angle) * distance * 0.62)}" stroke="${color}" stroke-width="${round(0.6 + progress * 1.6)}" stroke-linecap="round" opacity="${round(opacity)}"/>`
    }
    content =
      `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="url(#jump)"/>` +
      streaks +
      `<ellipse cx="${round(centerX)}" cy="${round(centerY)}" rx="90" ry="55" fill="url(#jumpCore)"/>`
  } else {
    const planetRadius = (right - left) * 0.34
    content =
      `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="url(#space)"/>` +
      stars +
      `<circle cx="${round(left + (right - left) * 0.76)}" cy="${round(bottom + planetRadius * 0.52)}" r="${round(planetRadius * 1.04)}" fill="#6a8cc4" opacity="0.18" filter="url(#haze)"/>` +
      `<circle cx="${round(left + (right - left) * 0.76)}" cy="${round(bottom + planetRadius * 0.52)}" r="${round(planetRadius)}" fill="url(#planet)"/>` +
      `<circle cx="${round(left + (right - left) * 0.76)}" cy="${round(bottom + planetRadius * 0.52)}" r="${round(planetRadius)}" fill="none" stroke="#a9c6f2" stroke-width="1.4" opacity="0.5"/>`
  }
  return `<g clip-path="url(#windows)">${content}</g>`
}

/** The windows, the wall around them, both pit walls and the floor. */
export function drawHall(isJumping: boolean, now: number): string {
  const panels = windowPanels()
  const wallLeft = project(-HALL_HALF_WIDTH, 0, WALL_Z)
  const wallRight = project(HALL_HALF_WIDTH, 0, WALL_Z)
  const wallTopLeft = project(-HALL_HALF_WIDTH, WINDOW_TOP + 1.2, WALL_Z)
  const wallTopRight = project(HALL_HALF_WIDTH, WINDOW_TOP + 1.2, WALL_Z)
  const nearLeft = project(-HALL_HALF_WIDTH, 0, NEAR_Z)
  const nearRight = project(HALL_HALF_WIDTH, 0, NEAR_Z)

  let floorLines = ''
  for (let z = 2; z <= WALL_Z; z += 2) {
    floorLines += line(project(-HALL_HALF_WIDTH, 0, z), project(HALL_HALF_WIDTH, 0, z), `stroke="${PALETTE.hullEdge}" stroke-width="0.8" opacity="0.14"`)
  }
  for (let x = -HALL_HALF_WIDTH; x <= HALL_HALF_WIDTH; x += 2.2) {
    floorLines += line(project(x, 0, NEAR_Z), project(x, 0, WALL_Z), `stroke="${PALETTE.hullEdge}" stroke-width="0.8" opacity="0.1"`)
  }

  let wallDetails = ''
  for (const side of [-1, 1]) {
    for (const height of [2.6, 4.4, 6.2]) {
      wallDetails += line(project(side * HALL_HALF_WIDTH, height, NEAR_Z), project(side * HALL_HALF_WIDTH, height, WALL_Z), `stroke="${PALETTE.hullEdge}" stroke-width="1" opacity="0.28"`)
    }
    wallDetails += line(project(side * HALL_HALF_WIDTH, 3.5, NEAR_Z), project(side * HALL_HALF_WIDTH, 3.5, WALL_Z), `stroke="${PALETTE.lamp}" stroke-width="2.2" opacity="0.5" filter="url(#glowSoft)"`)
    for (let z = 3; z < WALL_Z; z += 3) {
      wallDetails += line(project(side * HALL_HALF_WIDTH, 0, z), project(side * HALL_HALF_WIDTH, WINDOW_TOP + 1.2, z), `stroke="${PALETTE.void}" stroke-width="1.6" opacity="0.5"`)
    }
  }

  const random = randomSequence(21)
  for (const side of [-1, 1]) {
    for (let z = 6; z < WALL_Z - 3; z += 3.2) {
      const [start, end] = side < 0 ? [z, z + 2.4] : [z + 2.4, z]
      const origin = project(side * HALL_HALF_WIDTH, 5.1, start)
      const matrix = faceTransform(origin, project(side * HALL_HALF_WIDTH, 5.1, end), project(side * HALL_HALF_WIDTH, 3.6, start), 100, 30)
      const color = random() > 0.7 ? PALETTE.amber : PALETTE.green
      let bars = ''
      for (let row = 0; row < 4; row += 1) bars += `<rect x="6" y="${4 + row * 6}" width="${round(20 + random() * 60)}" height="2" fill="${color}" opacity="0.4"/>`
      wallDetails += `<g transform="${matrix}"><rect width="100" height="30" fill="#020805" stroke="${color}" stroke-opacity="0.4" stroke-width="1" vector-effect="non-scaling-stroke"/>${bars}${glyphString(62, 27, `wall${side}${z}`, 6, 6, color, 0.5)}</g>`
    }
  }

  const wallPoints = [wallLeft, wallRight, wallTopRight, wallTopLeft]
  const sideWall = (side: number) =>
    polygon(
      [project(side * HALL_HALF_WIDTH, 0, NEAR_Z), project(side * HALL_HALF_WIDTH, 0, WALL_Z), project(side * HALL_HALF_WIDTH, WINDOW_TOP + 1.2, WALL_Z), project(side * HALL_HALF_WIDTH, WINDOW_TOP + 1.2, NEAR_Z)],
      `fill="url(#${side < 0 ? 'wallLeft' : 'wallRight'})"`,
    )

  let mullions = ''
  for (const panel of panels) {
    mullions += polygon(panel, `fill="none" stroke="${PALETTE.hullEdge}" stroke-width="1.6"`)
    mullions += line(panel[0], panel[1], `stroke="${PALETTE.lamp}" stroke-width="1.4" opacity="0.5"`)
  }

  const sillLeft = project(-HALL_HALF_WIDTH, SILL_HEIGHT, WALL_Z)
  const sillRight = project(HALL_HALF_WIDTH, SILL_HEIGHT, WALL_Z)
  const consoleBand = polygon([wallLeft, wallRight, sillRight, sillLeft], `fill="${PALETTE.hull}"`)
  let bandLights = ''
  for (let x = -HALL_HALF_WIDTH + 1; x < HALL_HALF_WIDTH; x += 2) {
    const a = project(x, 0.7, WALL_Z)
    const b = project(x + 1.2, 0.7, WALL_Z)
    bandLights += line(a, b, `stroke="${PALETTE.green}" stroke-width="1.4" opacity="0.35"`)
  }

  return (
    `<clipPath id="windows">${panels.map(panel => `<polygon points="${pointsOf(panel)}"/>`).join('')}</clipPath>` +
    polygon([nearLeft, nearRight, wallRight, wallLeft], `fill="url(#floor)"`) +
    floorLines +
    sideWall(-1) +
    sideWall(1) +
    wallDetails +
    polygon(wallPoints, `fill="${PALETTE.hull}"`) +
    consoleBand +
    bandLights +
    drawSpace(panels, isJumping, now) +
    mullions
  )
}

/** The raised command walkway, with its edge lights and centre markings. */
export function drawWalkway(): string {
  const { halfWidth, height, nearZ, farZ } = WALKWAY
  const surface = polygon(
    [project(-halfWidth, height, nearZ), project(halfWidth, height, nearZ), project(halfWidth, height, farZ), project(-halfWidth, height, farZ)],
    'fill="url(#walkway)"',
  )
  const shadows = [-1, 1]
    .map(side =>
      polygon(
        [project(side * halfWidth, 0, nearZ), project(side * (halfWidth + 1.6), 0, nearZ), project(side * (halfWidth + 1.6), 0, farZ), project(side * halfWidth, 0, farZ)],
        'fill="#000" opacity="0.5"',
      ),
    )
    .join('')
  let marks = ''
  for (const side of [-1, 1]) {
    marks += line(project(side * halfWidth, height, nearZ), project(side * halfWidth, height, farZ), `stroke="${PALETTE.lamp}" stroke-width="2.4" opacity="0.8" filter="url(#glowSoft)"`)
    marks += line(project(side * (halfWidth - 0.22), height, nearZ), project(side * (halfWidth - 0.22), height, farZ), `stroke="${PALETTE.hullEdge}" stroke-width="1" opacity="0.5"`)
  }
  for (let z = nearZ + 1; z < farZ; z += 1.6) {
    marks += line(project(-halfWidth, height, z), project(halfWidth, height, z), `stroke="${PALETTE.void}" stroke-width="1" opacity="0.45"`)
  }
  for (let z = nearZ + 0.5; z < farZ; z += 2.4) {
    marks += line(project(0, height, z), project(0, height, z + 1.1), `stroke="${PALETTE.amber}" stroke-width="1.6" opacity="0.4"`)
  }
  return shadows + surface + marks
}

/** Thrawn at the viewport end of the walkway, facing the bridge, lit from behind. */
export function drawThrawn(): string {
  const foot = project(0, WALKWAY.height, THRAWN_Z)
  const unit = `translate(${round(foot.x)} ${round(foot.y)}) scale(${round(foot.scale * 1.2)})`
  return (
    `<ellipse cx="${round(foot.x)}" cy="${round(foot.y - foot.scale * 1.1)}" rx="${round(foot.scale * 1.1)}" ry="${round(foot.scale * 1.7)}" fill="url(#backlight)"/>` +
    `<ellipse cx="${round(foot.x)}" cy="${round(foot.y)}" rx="${round(foot.scale * 0.55)}" ry="${round(foot.scale * 0.1)}" fill="#000" opacity="0.55"/>` +
    `<g transform="${unit}" stroke-linejoin="round">` +
    `<path d="M-0.15 -0.92L-0.16 -0.05L-0.04 -0.05L0 -0.78L0.04 -0.05L0.16 -0.05L0.15 -0.92Z" fill="#cfd6de"/>` +
    `<path d="M-0.17 -0.02h0.14v-0.07h-0.15zM0.03 -0.02h0.14l0.01 -0.07h-0.15z" fill="#07090c"/>` +
    `<path d="M-0.27 -1.5L-0.2 -1.58L0.2 -1.58L0.27 -1.5L0.3 -1.12L0.23 -0.88L-0.23 -0.88L-0.3 -1.12Z" fill="url(#uniform)" stroke="#f4f8fb" stroke-width="0.012"/>` +
    `<path d="M-0.27 -1.5L-0.35 -1.2L-0.3 -1.0L-0.25 -1.12ZM0.27 -1.5L0.35 -1.2L0.3 -1.0L0.25 -1.12Z" fill="#aab4be" stroke="#f4f8fb" stroke-width="0.01"/>` +
    `<path d="M-0.06 -1.62L0.06 -1.62L0.07 -1.54L0 -1.5L-0.07 -1.54Z" fill="#e9eef3"/>` +
    `<ellipse cx="0" cy="-1.74" rx="0.085" ry="0.11" fill="#4f6b8c"/>` +
    `<ellipse cx="0" cy="-1.74" rx="0.085" ry="0.11" fill="url(#face)"/>` +
    `<circle cx="-0.035" cy="-1.75" r="0.014" fill="#ff3b2e"/><circle cx="0.035" cy="-1.75" r="0.014" fill="#ff3b2e"/>` +
    `<circle cx="-0.035" cy="-1.75" r="0.04" fill="#ff3b2e" opacity="0.25" filter="url(#glowSoft)"/><circle cx="0.035" cy="-1.75" r="0.04" fill="#ff3b2e" opacity="0.25" filter="url(#glowSoft)"/>` +
    `</g>`
  )
}
