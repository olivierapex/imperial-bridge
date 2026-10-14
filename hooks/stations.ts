import type { AgentRun } from '../types'
import { REPORT_BEAM_MS, ROSTER, displayName, phaseOf, shortType } from './bridge'
import { ESCALATION_TAG_WIDTH, badgeWidth, defaultModelOf, drawBadge, drawEscalationTag, isEscalated } from './models'
import { depthAtScreenRow, faceTransform, project } from './projection'
import { PALETTE, glyphString, line, polygon, randomSequence, round, seedOf, text } from './svg'
import type { Point } from './svg'

const SPARE_TYPE = 'spare-station'
const STATION_COUNT = ROSTER.length + 1
const FIRST_ROW_SCREEN = 250
const LAST_ROW_SCREEN = 545
const PLATE_HEIGHT = 2.3
const DESK = { inner: 2.4, depth: 1.4, height: 1.0, width: 0.8 }
const BANK = { width: 1.2, height: 1.9 }
const CHARACTER_WIDTH = 7.9
const BADGE_GAP = 4
const MAX_BADGES = 4

export type Station = {
  type: string
  label: string
  side: -1 | 1
  row: number
  rowZ: number
  runs: AgentRun[]
  working: AgentRun[]
  mood: 'idle' | 'working' | 'reported' | 'aborted'
  signal: 'order' | 'report' | 'none'
}

type Tone = { text: string; dim: string; glow: string }

export const TONES: Record<Station['mood'], Tone> = {
  idle: { text: PALETTE.greenDim, dim: '#17382a', glow: PALETTE.green },
  working: { text: PALETTE.amber, dim: PALETTE.amberDim, glow: PALETTE.amber },
  reported: { text: PALETTE.green, dim: PALETTE.greenDim, glow: PALETTE.green },
  aborted: { text: PALETTE.red, dim: PALETTE.redDim, glow: PALETTE.red },
}

/** Every roster station, one station per unknown agent type, and spare stations to fill the pits. */
export function layoutStations(runs: AgentRun[], now: number): Station[] {
  const types = ROSTER.map(agent => agent.type)
  for (const run of runs) {
    if (!types.includes(shortType(run.agentType))) types.push(shortType(run.agentType))
  }
  while (types.length < STATION_COUNT || types.length % 2 === 1) types.push(SPARE_TYPE)
  const rows = types.length / 2

  return types.map((type, index) => {
    const own = runs.filter(run => shortType(run.agentType) === type)
    const working = own.filter(run => phaseOf(run, now) === 'working')
    const latest = own.filter(run => phaseOf(run, now) === 'fading').pop()
    const mood: Station['mood'] =
      working.length > 0 ? 'working' : latest === undefined ? 'idle' : latest.status === 'aborted' ? 'aborted' : 'reported'
    const row = Math.floor(index / 2)
    const isReporting = latest !== undefined && now - (latest.finishedAt ?? now) < REPORT_BEAM_MS

    return {
      type,
      label: (type === SPARE_TYPE ? 'Spare station' : displayName(type)).toUpperCase(),
      side: index % 2 === 0 ? -1 : 1,
      row,
      rowZ: depthAtScreenRow(FIRST_ROW_SCREEN + (row * (LAST_ROW_SCREEN - FIRST_ROW_SCREEN)) / Math.max(1, rows - 1), DESK.inner + 1, PLATE_HEIGHT),
      runs: own,
      working,
      mood,
      signal: working.length > 0 ? 'order' : isReporting ? 'report' : 'none',
    }
  })
}

type Box = { xa: number; xb: number; height: number; z0: number; z1: number }

/** Top, front and walkway-facing faces of a block, the only ones the camera can see. */
function block(box: Box, fills: { top: string; front: string; inner: string }): string {
  const { xa, xb, height, z0, z1 } = box
  const corner = (x: number, y: number, z: number) => project(x, y, z)
  const top = [corner(xa, height, z0), corner(xb, height, z0), corner(xb, height, z1), corner(xa, height, z1)]
  const front = [corner(xa, 0, z0), corner(xb, 0, z0), corner(xb, height, z0), corner(xa, height, z0)]
  const inner = [corner(xa, 0, z0), corner(xa, 0, z1), corner(xa, height, z1), corner(xa, height, z0)]
  const edge = `stroke="${PALETTE.hullEdge}" stroke-width="0.8" stroke-opacity="0.55" stroke-linejoin="round"`

  return polygon(front, `fill="${fills.front}" ${edge}`) + polygon(inner, `fill="${fills.inner}" ${edge}`) + polygon(top, `fill="${fills.top}" ${edge}`)
}

function drawScreen(station: Station, xFace: number, now: number): string {
  const { side, rowZ, mood } = station
  const tone = TONES[mood]
  const nearZ = rowZ - DESK.depth / 2 + 0.12
  const farZ = rowZ + DESK.depth / 2 - 0.12
  const [startZ, endZ] = side < 0 ? [nearZ, farZ] : [farZ, nearZ]
  const bottom = 1.22
  const top = BANK.height - 0.12
  const origin = project(xFace, top, startZ)
  const matrix = faceTransform(origin, project(xFace, top, endZ), project(xFace, bottom, startZ), 100, 30)
  const random = randomSequence(seedOf(station.type) + (mood === 'working' ? Math.floor(now / 260) : 0))
  let bars = ''
  for (let row = 0; row < 5; row += 1) {
    const width = 18 + random() * 64
    bars += `<rect x="6" y="${4 + row * 5.2}" width="${round(width)}" height="1.7" fill="${tone.glow}" opacity="${mood === 'idle' ? 0.22 : round(0.45 + random() * 0.4)}"/>`
  }
  const glyphs = glyphString(64, 28, `${station.type}${mood}`, 8, 6, tone.glow, mood === 'idle' ? 0.3 : 0.75)
  const glow = mood === 'idle' ? '' : `<rect width="100" height="30" fill="${tone.glow}" opacity="0.28" filter="url(#glowSoft)"/>`

  return (
    `<g transform="${matrix}">` +
    `<rect width="100" height="30" fill="#020805"/>` +
    glow +
    `<rect width="100" height="30" fill="url(#screenSheen)"/>` +
    bars +
    glyphs +
    `<rect width="100" height="30" fill="none" stroke="${tone.dim}" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
    `</g>`
  )
}

function drawLights(station: Station, now: number): string {
  const { side, rowZ, mood } = station
  const tone = TONES[mood]
  const random = randomSequence(seedOf(station.type) + 3)
  let lights = ''
  for (let index = 0; index < 6; index += 1) {
    const x = side * (DESK.inner + 0.2 + (index % 3) * 0.22)
    const z = rowZ - 0.45 + Math.floor(index / 3) * 0.5
    const isOn = mood !== 'idle' && (random() + now / 400 + index) % 1 > 0.3
    const color = index % 3 === 2 ? PALETTE.red : tone.glow
    const half = 0.07
    lights += polygon(
      [project(x - half, DESK.height, z - half), project(x + half, DESK.height, z - half), project(x + half, DESK.height, z + half), project(x - half, DESK.height, z + half)],
      `fill="${color}" opacity="${isOn ? 0.95 : 0.25}"`,
    )
  }
  return lights
}

function operator(x: number, z: number, tone: Tone, isLit: boolean, side: number): string {
  const foot = project(x, 0, z)
  const facing = -side
  const shoulder = `M${-0.2} -1.42L${0.2} -1.42L${0.23} -1.0L${0.2} -0.8L${-0.2} -0.8L${-0.23} -1.0Z`
  const glow = isLit ? `<ellipse cx="${0.3 * facing}" cy="-1.1" rx="0.34" ry="0.5" fill="${tone.glow}" opacity="0.35" filter="url(#glowSoft)"/>` : ''

  return (
    `<g transform="translate(${round(foot.x)} ${round(foot.y)}) scale(${round(foot.scale)})">` +
    `<ellipse cx="0" cy="0" rx="0.36" ry="0.08" fill="#000" opacity="0.55"/>` +
    glow +
    `<path d="M-0.15 -0.82L-0.16 0L-0.03 0L0 -0.66L0.03 0L0.16 0L0.15 -0.82Z" fill="#0b0e12"/>` +
    `<path d="${shoulder}" fill="${isLit ? '#1b2029' : '#12161c'}" stroke="${isLit ? tone.glow : '#3a424d'}" stroke-width="0.018" stroke-opacity="${isLit ? 0.85 : 0.6}"/>` +
    `<ellipse cx="0" cy="-1.56" rx="0.095" ry="0.115" fill="#10141a"/>` +
    `<path d="M-0.13 -1.6Q0 -1.74 0.13 -1.6L0.15 -1.66L-0.15 -1.66Z" fill="#232a33" stroke="${isLit ? tone.glow : '#3a424d'}" stroke-width="0.012" stroke-opacity="0.7"/>` +
    `</g>`
  )
}

function drawOperators(station: Station): string {
  const { side, rowZ, mood, working } = station
  const tone = TONES[mood]
  const count = Math.max(1, working.length)
  const spacing = Math.min(0.6, DESK.depth / count)
  const x = side * (DESK.inner - 0.55)
  let figures = ''
  for (let index = 0; index < Math.min(count, 4); index += 1) {
    const z = rowZ + (index - (Math.min(count, 4) - 1) / 2) * spacing
    figures += operator(x, z, tone, working.length > 0, side)
  }
  return figures
}

/** One crew station: the desk, the screen bank and the operators. The rank plate is drawn apart so no console hides it. */
export function drawConsole(station: Station, now: number): string {
  const { side, rowZ } = station
  const z0 = rowZ - DESK.depth / 2
  const z1 = rowZ + DESK.depth / 2
  const inner = side * DESK.inner
  const bankInner = side * (DESK.inner + DESK.width)
  const bank = block({ xa: bankInner, xb: side * (DESK.inner + DESK.width + BANK.width), height: BANK.height, z0, z1 }, {
    top: PALETTE.hullLight,
    front: PALETTE.hull,
    inner: PALETTE.hullMid,
  })
  const desk = block({ xa: inner, xb: bankInner, height: DESK.height, z0, z1 }, {
    top: '#2f353e',
    front: '#14171c',
    inner: '#1d2229',
  })
  const floorGlow = polygon(
    [project(inner, 0, z0 - 0.3), project(inner - side * 1.9, 0, z0 - 0.3), project(inner - side * 1.9, 0, z1 + 0.3), project(inner, 0, z1 + 0.3)],
    `fill="${TONES[station.mood].glow}" opacity="${station.mood === 'idle' ? 0 : 0.1}"`,
  )

  return floorGlow + bank + drawScreen(station, bankInner, now) + desk + drawLights(station, now) + drawOperators(station)
}

export type Plate = { markup: string; anchor: Point }

function activityOf(station: Station): string {
  const tool = station.working[station.working.length - 1]?.activity
  return tool === undefined ? 'AWAITING ORDERS' : `> ${tool.toUpperCase()}`
}

type PlateBadge = { model: string; isEscalated: boolean; isDimmed: boolean }

/** One badge per running instance, or the default model dimmed while the station is quiet. */
function badgesOf(station: Station): PlateBadge[] {
  const defaultModel = defaultModelOf(station.type)
  if (station.working.length === 0) {
    return defaultModel === undefined ? [] : [{ model: defaultModel, isEscalated: false, isDimmed: true }]
  }

  return station.working.slice(0, MAX_BADGES).map(run => ({ model: run.model, isEscalated: isEscalated(run.model, defaultModel), isDimmed: false }))
}

/** The rank plate floating above a console; a second line names the tool while the station works. */
export function drawPlate(station: Station): Plate {
  const { side, rowZ, mood, working } = station
  const tone = TONES[mood]
  const anchor = project(side * (DESK.inner + DESK.width * 0.6), BANK.height + 0.3, rowZ)
  const count = working.length > 1 ? `  x${working.length}` : ''
  const title = `${station.label}${count}`
  const detail = mood === 'working' ? activityOf(station).slice(0, 30) : ''
  const badges = badgesOf(station)
  const escalation = badges.find(badge => badge.isEscalated)
  const badgesWidth = badges.reduce((total, badge) => total + BADGE_GAP + badgeWidth(badge.model, badge), 0)
  const titleWidth = title.length * CHARACTER_WIDTH + badgesWidth
  const detailWidth = detail.length * CHARACTER_WIDTH + (escalation === undefined ? 0 : BADGE_GAP * 3 + ESCALATION_TAG_WIDTH)
  const width = Math.max(titleWidth, detailWidth) + 16
  const height = detail === '' ? 19 : 34
  const centerX = Math.min(1000 - width / 2 - 6, Math.max(width / 2 + 6, anchor.x))
  const left = centerX - width / 2
  const top = anchor.y - height
  const stroke = mood === 'idle' ? '#2a4a3a' : tone.text
  const accent = `<rect x="${round(left)}" y="${round(top)}" width="3" height="${height}" fill="${tone.text}"/>`
  const second = detail === '' ? '' : text(left + 10, top + 28, detail, PALETTE.green, { size: 11.5, opacity: 0.9 })
  const tag = escalation === undefined ? '' : drawEscalationTag(left + width - 8 - ESCALATION_TAG_WIDTH, top + 28, escalation.model)
  let badgeLeft = left + 10 + title.length * CHARACTER_WIDTH
  let marks = ''
  for (const badge of badges) {
    badgeLeft += BADGE_GAP
    marks += drawBadge(badgeLeft, top + 3.5, badge.model, badge)
    badgeLeft += badgeWidth(badge.model, badge)
  }
  const markup =
    `<g>` +
    line(anchor, { x: anchor.x, y: anchor.y + 6 }, `stroke="${stroke}" stroke-width="1"`) +
    (mood === 'idle' ? '' : `<rect x="${round(left)}" y="${round(top)}" width="${round(width)}" height="${height}" fill="${tone.text}" opacity="0.35" filter="url(#glowSoft)"/>`) +
    `<rect x="${round(left)}" y="${round(top)}" width="${round(width)}" height="${height}" fill="#020805" fill-opacity="0.9" stroke="${stroke}" stroke-width="1"/>` +
    accent +
    text(left + 10, top + 13.5, title, tone.text, { size: 12.5, weight: 600 }) +
    marks +
    second +
    tag +
    `</g>`

  return { markup, anchor: { x: centerX, y: top + height / 2 } }
}
