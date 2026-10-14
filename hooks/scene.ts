import type { AgentRun, BridgeEvent, UsageLimit } from '../types'
import { THRAWN_Z, WALKWAY, drawHall, drawThrawn, drawWalkway } from './backdrop'
import { phaseOf } from './bridge'
import { project } from './projection'
import { TONES, drawConsole, drawPlate, layoutStations } from './stations'
import type { Station } from './stations'
import { PALETTE, glyphString, round, text } from './svg'
import { BOTTOM, CONSOLE_TOP, drawTransmissions } from './transmissions'
import { drawUsage } from './usage'

export const WIDTH = 1000
export const HEIGHT = BOTTOM

function definitions(): string {
  return (
    `<defs>` +
    `<linearGradient id="space" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#01030a"/><stop offset="0.7" stop-color="#07101f"/><stop offset="1" stop-color="#101c34"/></linearGradient>` +
    `<linearGradient id="jump" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#020611"/><stop offset="1" stop-color="#0b1b3d"/></linearGradient>` +
    `<radialGradient id="jumpCore"><stop offset="0" stop-color="#f4f9ff" stop-opacity="0.95"/><stop offset="0.35" stop-color="#9cc4ff" stop-opacity="0.45"/><stop offset="1" stop-color="#9cc4ff" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="planet" cx="0.3" cy="0.22" r="0.95"><stop offset="0" stop-color="#9fb8d9"/><stop offset="0.35" stop-color="#52698f"/><stop offset="0.75" stop-color="#1b2740"/><stop offset="1" stop-color="#070b14"/></radialGradient>` +
    `<linearGradient id="floor" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#0e1116"/><stop offset="1" stop-color="#1d222a"/></linearGradient>` +
    `<linearGradient id="walkway" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2c323b"/><stop offset="1" stop-color="#4a525e"/></linearGradient>` +
    `<linearGradient id="wallLeft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#101319"/><stop offset="1" stop-color="#232832"/></linearGradient>` +
    `<linearGradient id="wallRight" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#101319"/><stop offset="1" stop-color="#232832"/></linearGradient>` +
    `<linearGradient id="uniform" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f6f9fc"/><stop offset="0.5" stop-color="#dfe5ec"/><stop offset="1" stop-color="#9ea9b6"/></linearGradient>` +
    `<radialGradient id="face" cx="0.5" cy="0.4" r="0.7"><stop offset="0" stop-color="#0a121c" stop-opacity="0.75"/><stop offset="1" stop-color="#0a121c" stop-opacity="0.2"/></radialGradient>` +
    `<radialGradient id="backlight"><stop offset="0" stop-color="#cfe2ff" stop-opacity="0.5"/><stop offset="1" stop-color="#cfe2ff" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>` +
    `<linearGradient id="screenSheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.12"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<radialGradient id="crt" cx="0.5" cy="0.45" r="0.8"><stop offset="0" stop-color="#0a2418"/><stop offset="1" stop-color="#020805"/></radialGradient>` +
    `<pattern id="scan" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000"/></pattern>` +
    `<linearGradient id="console" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3039"/><stop offset="0.06" stop-color="#14181e"/><stop offset="1" stop-color="#07090c"/></linearGradient>` +
    `<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2027"/><stop offset="1" stop-color="#090b0e"/></linearGradient>` +
    `<clipPath id="stage"><rect width="${WIDTH}" height="${CONSOLE_TOP}"/></clipPath>` +
    `<filter id="glowSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>` +
    `<filter id="haze" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>` +
    `</defs>`
  )
}

/** A dotted line between Thrawn and a station, with a packet moving along it: out for an order, back for a report. */
function drawLink(station: Station, target: { x: number; y: number }, now: number): string {
  if (station.signal === 'none') return ''
  const chest = project(0, WALKWAY.height + 1.35, THRAWN_Z)
  const color = TONES[station.mood].glow
  const progress = (now / 1400) % 1
  const along = station.signal === 'order' ? progress : 1 - progress
  const packet = { x: chest.x + (target.x - chest.x) * along, y: chest.y + (target.y - chest.y) * along }

  return (
    `<line x1="${round(chest.x)}" y1="${round(chest.y)}" x2="${round(target.x)}" y2="${round(target.y)}" stroke="${color}" stroke-width="1.8" stroke-dasharray="1.5 7" stroke-linecap="round" opacity="0.85"/>` +
    `<circle cx="${round(packet.x)}" cy="${round(packet.y)}" r="5" fill="${color}" opacity="0.35" filter="url(#glowSoft)"/>` +
    `<circle cx="${round(packet.x)}" cy="${round(packet.y)}" r="2.2" fill="#fff"/>`
  )
}

function drawHeader(runs: AgentRun[], now: number): string {
  const active = runs.filter(run => phaseOf(run, now) === 'working').length
  const status = active === 0 ? 'ALL STATIONS STANDING BY' : `${active} ${active === 1 ? 'STATION' : 'STATIONS'} ACTIVE`

  return (
    `<rect width="${WIDTH}" height="34" fill="url(#beam)"/>` +
    `<line x1="0" y1="34.5" x2="${WIDTH}" y2="34.5" stroke="${PALETTE.hullEdge}" stroke-width="1.2" opacity="0.8"/>` +
    glyphString(24, 24, 'bridge-title', 10, 14, PALETTE.steel, 0.5) +
    text(150, 22, 'COMMAND BRIDGE', PALETTE.steel, { size: 13, weight: 700, spacing: 2 }) +
    text(WIDTH - 24, 22, status, active === 0 ? PALETTE.greenDim : PALETTE.amber, { size: 13, anchor: 'end', weight: 600, spacing: 1 })
  )
}

/** The command bridge as an SVG document. */
export function drawBridge(runs: AgentRun[], events: BridgeEvent[], now: number, usage?: UsageLimit[]): string {
  const stations = layoutStations(runs, now).sort((a, b) => b.rowZ - a.rowZ)
  const plates = stations.map(station => drawPlate(station))
  const links = stations.map((station, index) => drawLink(station, plates[index].anchor, now)).join('')
  const isJumping = runs.some(run => phaseOf(run, now) === 'working')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Menlo, Consolas, 'DejaVu Sans Mono', monospace">` +
    definitions() +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${PALETTE.void}"/>` +
    `<g clip-path="url(#stage)">` +
    drawHall(isJumping, now) +
    drawWalkway() +
    drawThrawn() +
    stations.map(station => drawConsole(station, now)).join('') +
    links +
    plates.map(plate => plate.markup).join('') +
    `<rect width="${WIDTH}" height="${CONSOLE_TOP}" fill="url(#vignette)"/>` +
    drawHeader(runs, now) +
    `</g>` +
    drawTransmissions(runs, events, now) +
    drawUsage(usage, now) +
    `</svg>`
  )
}
