import type { AgentRun } from '../types'
import { FADE_MS, REPORT_BEAM_MS, ROSTER, displayName, formatDuration, modelFamily, phaseOf, shortType } from './bridge'

const WIDTH = 960
const HEIGHT = 680
const CENTER = { x: 480, y: 330 }
const RING = { x: 330, y: 235 }
const STATION = { width: 132, height: 50 }
const SATELLITE_RADIUS = 10

const BACKGROUND = '#0a0b0d'
const HULL = '#5b6068'
const TEXT = '#c8ccd2'
const RED = '#d62a2a'
const FAILURE = '#ff3b3b'
const SUCCESS = '#3ddc84'
const MODEL_COLORS: Record<string, string> = { haiku: '#2fd0e0', sonnet: '#f0a020', opus: '#e03030' }

type Point = { x: number; y: number }
type Station = { type: string; name: string; model: string; position: Point; runs: AgentRun[] }

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function clip(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

function colorOf(model: string): string {
  return MODEL_COLORS[modelFamily(model)] ?? HULL
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function buildStations(runs: AgentRun[]): Station[] {
  const types = [...ROSTER.map(agent => agent.type)]
  for (const run of runs) {
    if (!types.includes(shortType(run.agentType))) types.push(shortType(run.agentType))
  }
  return types.map((type, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / types.length
    const own = runs.filter(run => shortType(run.agentType) === type)
    const latest = own[own.length - 1]
    return {
      type,
      name: displayName(type),
      model: latest?.model ?? ROSTER.find(agent => agent.type === type)?.model ?? 'unknown',
      position: { x: CENTER.x + RING.x * Math.cos(angle), y: CENTER.y + RING.y * Math.sin(angle) },
      runs: own,
    }
  })
}

function beam(from: Point, to: Point, color: string, now: number, opacity: number): string {
  const offset = -((now / 40) % 14)
  return `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-dasharray="6 8" stroke-dashoffset="${offset.toFixed(1)}" opacity="${opacity.toFixed(2)}"/>`
}

function text(x: number, y: number, content: string, color: string, size: number, anchor = 'middle', opacity = 1): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${color}" font-size="${size}" text-anchor="${anchor}" opacity="${opacity.toFixed(2)}">${escape(content)}</text>`
}

function drawStation(station: Station, now: number): string {
  const active = station.runs.filter(run => run.status === 'working').length
  const fading = station.runs.some(run => phaseOf(run, now) === 'fading')
  const stroke = active > 0 ? colorOf(station.model) : fading ? SUCCESS : HULL
  const { x, y } = station.position
  const badge =
    active > 1
      ? `<circle cx="${x + STATION.width / 2}" cy="${y - STATION.height / 2}" r="12" fill="${RED}"/>${text(x + STATION.width / 2, y - STATION.height / 2 + 4, `×${active}`, TEXT, 11)}`
      : ''
  return (
    `<rect x="${x - STATION.width / 2}" y="${y - STATION.height / 2}" width="${STATION.width}" height="${STATION.height}" rx="4" fill="${BACKGROUND}" stroke="${stroke}" stroke-width="${active > 0 ? 2.5 : 1.5}" opacity="${active > 0 || fading ? 1 : 0.6}"/>` +
    text(x, y - 3, station.name, TEXT, 12) +
    text(x, y + 14, modelFamily(station.model), colorOf(station.model), 10) +
    badge
  )
}

function satelliteLabel(run: AgentRun, now: number): string {
  if (run.status === 'working') return `${run.activity ?? 'starting'} · ${formatDuration(now - run.startedAt)}`
  return `${run.status} ${formatDuration(run.durationMs ?? 0)}`
}

function drawSatellite(run: AgentRun, station: Station, slot: number, now: number): string {
  const phase = phaseOf(run, now)
  const outward = { x: station.position.x - CENTER.x, y: station.position.y - CENTER.y }
  const length = Math.hypot(outward.x, outward.y) || 1
  const unit = { x: outward.x / length, y: outward.y / length }
  const distance = 62 + slot * 30
  const sway = (slot % 2 === 0 ? 1 : -1) * 34
  const position = {
    x: clamp(station.position.x + unit.x * distance - unit.y * sway, 20, WIDTH - 20),
    y: clamp(station.position.y + unit.y * distance + unit.x * sway, 20, HEIGHT - 20),
  }
  const fade = run.finishedAt === undefined ? 1 : 1 - (0.6 * (now - run.finishedAt)) / FADE_MS
  const sinceFinish = now - (run.finishedAt ?? now)
  const outcome = run.status === 'aborted' ? FAILURE : SUCCESS
  const color = phase === 'working' ? colorOf(run.model) : outcome
  const middle = { x: (CENTER.x + position.x) / 2, y: (CENTER.y + position.y) / 2 }
  let beams = ''
  if (phase === 'working') {
    beams = beam(CENTER, position, color, now, 0.9) + text(middle.x, middle.y - 4, clip(run.description, 40), TEXT, 9)
  } else if (sinceFinish < REPORT_BEAM_MS) {
    beams = beam(position, CENTER, outcome, now, 0.9) + text(middle.x, middle.y - 4, clip(run.description, 40), TEXT, 9)
  }
  const onRight = unit.x >= 0
  const circle =
    `<circle cx="${position.x.toFixed(1)}" cy="${position.y.toFixed(1)}" r="${SATELLITE_RADIUS}" fill="${BACKGROUND}" stroke="${color}" stroke-width="2" opacity="${fade.toFixed(2)}"/>` +
    text(position.x, position.y + 4, String(run.ordinal), TEXT, 10, 'middle', fade) +
    text(position.x + (onRight ? 16 : -16), position.y + 3, satelliteLabel(run, now), color, 9, onRight ? 'start' : 'end', fade)
  return `<g>${beams}</g><g>${circle}</g>`
}

/** The bridge map as an SVG document: Thrawn, the stations on the ring and one satellite per live instance. */
export function drawBridge(runs: AgentRun[], now: number): string {
  const stations = buildStations(runs)
  const hull = stations
    .map(({ position }) => `<line x1="${CENTER.x}" y1="${CENTER.y}" x2="${position.x.toFixed(1)}" y2="${position.y.toFixed(1)}" stroke="${HULL}" stroke-width="1" opacity="0.35"/>`)
    .join('')
  const body = stations
    .map(station => {
      const live = station.runs.filter(run => phaseOf(run, now) !== 'idle')
      return drawStation(station, now) + live.map((run, slot) => drawSatellite(run, station, slot, now)).join('')
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="monospace">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>` +
    `<ellipse cx="${CENTER.x}" cy="${CENTER.y}" rx="${RING.x}" ry="${RING.y}" fill="none" stroke="${HULL}" stroke-width="1" stroke-dasharray="2 6"/>` +
    hull +
    text(24, 32, 'IMPERIAL BRIDGE', RED, 14, 'start') +
    body +
    `<circle cx="${CENTER.x}" cy="${CENTER.y}" r="46" fill="${BACKGROUND}" stroke="${RED}" stroke-width="3"/>` +
    text(CENTER.x, CENTER.y - 2, 'THRAWN', TEXT, 13) +
    text(CENTER.x, CENTER.y + 14, 'Grand Admiral', HULL, 9) +
    `</svg>`
  )
}
