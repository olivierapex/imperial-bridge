import type { AgentRun, BridgeEvent } from '../types'
import { MAX_EVENTS, clip, displayName, formatDuration, modelTag, shortType, wrapText } from './bridge'
import { PALETTE, escapeXml, glyphString, line, round, text } from './svg'

export const CONSOLE_TOP = 740
export const MARGIN = 24
const GAP = 16
const READOUT = { top: 764, height: 140 }
export const LOG = { top: 914, height: 212 }
export const USAGE = { top: LOG.top + LOG.height + GAP, height: 140 }
const LOG_ROW = 18
const LOG_HEAD_COLUMNS = 45
const READOUT_WIDTH = (1000 - 2 * MARGIN - GAP) / 2
const READOUT_COLUMNS = 45
export const LOG_COLUMNS = 108
const LOG_TIME_COLUMNS = 10
export const BOTTOM = USAGE.top + USAGE.height + MARGIN

export type Accent = { bright: string; dim: string }
export const AMBER: Accent = { bright: PALETTE.amber, dim: PALETTE.amberDim }
export const GREEN: Accent = { bright: PALETTE.green, dim: PALETTE.greenDim }
export const RED: Accent = { bright: PALETTE.red, dim: PALETTE.redDim }

function rankOf(run: AgentRun): string {
  return `${displayName(shortType(run.agentType)).toUpperCase()} #${run.ordinal}${modelTag(run.model)}`
}

function tspan(content: string, fill: string): string {
  return `<tspan fill="${fill}">${escapeXml(content)}</tspan>`
}

/** An Imperial console screen: bezel, scan lines, a title bar and corner brackets. Returns the markup and the top of the body. */
export function screen(x: number, y: number, width: number, height: number, title: string, right: string, accent: Accent, seed: string): { markup: string; body: number } {
  const inner = { x: x + 8, y: y + 8, width: width - 16, height: height - 16 }
  const bracket = (cornerX: number, cornerY: number, horizontal: number, vertical: number) =>
    `<path d="M${round(cornerX)} ${round(cornerY + vertical * 9)}V${round(cornerY)}H${round(cornerX + horizontal * 9)}" fill="none" stroke="${accent.bright}" stroke-width="1.6"/>`
  const glyphLeft = inner.x + inner.width - 16 - right.length * 7.6 - 118
  const markup =
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" fill="${PALETTE.hullDark}" stroke="${PALETTE.hullEdge}" stroke-width="1.5"/>` +
    `<rect x="${x - 2}" y="${y - 2}" width="${width + 4}" height="${height + 4}" rx="4" fill="none" stroke="${accent.bright}" stroke-width="3" opacity="0.14" filter="url(#glowSoft)"/>` +
    `<rect x="${inner.x}" y="${inner.y}" width="${inner.width}" height="${inner.height}" fill="url(#crt)"/>` +
    `<rect x="${inner.x}" y="${inner.y}" width="${inner.width}" height="${inner.height}" fill="url(#scan)" opacity="0.55"/>` +
    `<rect x="${inner.x + 4}" y="${inner.y + 4}" width="${inner.width - 8}" height="${inner.height - 8}" fill="none" stroke="${accent.dim}" stroke-width="1"/>` +
    bracket(inner.x + 4, inner.y + 4, 1, 1) +
    bracket(inner.x + inner.width - 4, inner.y + 4, -1, 1) +
    text(inner.x + 16, inner.y + 25, title, accent.bright, { size: 13.5, weight: 700, spacing: 0.6 }) +
    text(inner.x + inner.width - 16, inner.y + 25, right, accent.bright, { size: 12.5, anchor: 'end', opacity: 0.85 }) +
    (glyphLeft > inner.x + 16 + title.length * 8.7 + 12 ? glyphString(glyphLeft, inner.y + 25, seed, 8, 11, accent.bright, 0.55) : '') +
    line({ x: inner.x + 12, y: inner.y + 34 }, { x: inner.x + inner.width - 12, y: inner.y + 34 }, `stroke="${accent.dim}" stroke-width="1"`)

  return { markup, body: inner.y + 56 }
}

function cursor(now: number): string {
  return Math.floor(now / 500) % 2 === 0 ? '_' : ' '
}

function drawOrder(run: AgentRun | undefined, now: number): string {
  const x = MARGIN
  if (run === undefined) {
    const idle = screen(x, READOUT.top, READOUT_WIDTH, READOUT.height, 'THRAWN → ALL STATIONS', 'CHANNEL OPEN', GREEN, 'order-idle')
    return idle.markup + text(x + 32, idle.body + 4, `AWAITING ORDERS${cursor(now)}`, PALETTE.greenDim, { size: 15 })
  }
  const accent = run.status === 'aborted' ? RED : AMBER
  const panel = screen(x, READOUT.top, READOUT_WIDTH, READOUT.height, `THRAWN → ${rankOf(run)}`, `T+${formatDuration(now - run.startedAt)}`, accent, `order${run.toolUseId}`)
  const order = wrapText(run.order ?? '', READOUT_COLUMNS, 3)

  return (
    panel.markup +
    text(x + 32, panel.body, clip(run.description, READOUT_COLUMNS).toUpperCase(), accent.bright, { size: 15, weight: 700 }) +
    order.map((content, index) => text(x + 32, panel.body + 24 + index * 19, content, PALETTE.green, { size: 14.5, opacity: 0.9 })).join('')
  )
}

function drawReport(run: AgentRun | undefined, now: number): string {
  const x = MARGIN + READOUT_WIDTH + GAP
  if (run === undefined) {
    const idle = screen(x, READOUT.top, READOUT_WIDTH, READOUT.height, 'ALL STATIONS → THRAWN', 'NO REPORT', GREEN, 'report-idle')
    return idle.markup + text(x + 32, idle.body + 4, `STANDING BY${cursor(now)}`, PALETTE.greenDim, { size: 15 })
  }
  const isAborted = run.status === 'aborted'
  const accent = isAborted ? RED : GREEN
  const panel = screen(x, READOUT.top, READOUT_WIDTH, READOUT.height, `${rankOf(run)} → THRAWN`, `T+${formatDuration(run.durationMs ?? 0)}`, accent, `report${run.toolUseId}`)
  const lines = wrapText(run.report ?? '', READOUT_COLUMNS, isAborted ? 3 : 4)
  const heading = isAborted ? 'SIGNAL LOST  RUN ABORTED' : undefined

  return (
    panel.markup +
    (heading === undefined ? '' : text(x + 32, panel.body, heading, RED.bright, { size: 15, weight: 700 })) +
    lines.map((content, index) => text(x + 32, panel.body + (heading === undefined ? 0 : 24) + index * 19, content, isAborted ? '#ff9c94' : PALETTE.green, { size: 14.5 })).join('')
  )
}

function drawLog(events: BridgeEvent[]): string {
  const panel = screen(MARGIN, LOG.top, 1000 - 2 * MARGIN, LOG.height, 'TRANSMISSION LOG', `${Math.min(events.length, MAX_EVENTS)} OF ${MAX_EVENTS}`, GREEN, 'log')
  const rows = events.slice(-MAX_EVENTS).reverse().map((event, index) => {
    const agent = `${event.agent.toUpperCase()}${modelTag(event.model)}`
    const [from, to] = event.event === 'spawned' ? ['THRAWN', agent] : [agent, 'THRAWN']
    const tone = event.event === 'aborted' ? PALETTE.red : event.event === 'spawned' ? PALETTE.amber : PALETTE.green
    const time = new Date(event.at).toTimeString().slice(0, 8)
    const head = clip(`${from} → ${to}`, LOG_HEAD_COLUMNS - 1).padEnd(LOG_HEAD_COLUMNS)
    const caption = clip(event.caption.replace(/\s+/g, ' '), LOG_COLUMNS - LOG_TIME_COLUMNS - LOG_HEAD_COLUMNS)
    const y = panel.body - 8 + index * LOG_ROW

    return `<text x="${MARGIN + 28}" y="${round(y)}" font-size="13.5" xml:space="preserve">${tspan(time, PALETTE.greenDim)}${tspan('  ', tone)}${tspan(head, tone)}${tspan(caption, '#c6d3cc')}</text>`
  })

  return panel.markup + (rows.length === 0 ? text(MARGIN + 28, panel.body, 'NO TRANSMISSIONS', PALETTE.greenDim, { size: 14 }) : rows.join(''))
}

/** The console below the viewport: the latest order, the latest report and the transmission log. */
export function drawTransmissions(runs: AgentRun[], events: BridgeEvent[], now: number): string {
  const order = runs[runs.length - 1]
  const report = runs.filter(run => run.status !== 'working').sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0)).pop()
  let studs = ''
  for (let index = 0; index < 28; index += 1) {
    studs += `<rect x="${MARGIN + index * 34}" y="${CONSOLE_TOP + 9}" width="22" height="3" fill="${PALETTE.hullLight}" opacity="${index % 7 === 3 ? 0.9 : 0.4}"/>`
  }

  return (
    `<rect y="${CONSOLE_TOP}" width="1000" height="${BOTTOM - CONSOLE_TOP}" fill="url(#console)"/>` +
    line({ x: 0, y: CONSOLE_TOP + 0.5 }, { x: 1000, y: CONSOLE_TOP + 0.5 }, `stroke="${PALETTE.steel}" stroke-width="1.5" opacity="0.7"`) +
    studs +
    drawOrder(order, now) +
    drawReport(report, now) +
    drawLog(events)
  )
}
