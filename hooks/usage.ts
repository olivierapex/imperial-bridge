import type { UsageLimit } from '../types'
import { clip } from './bridge'
import { PALETTE, line, round, text } from './svg'
import { AMBER, GREEN, MARGIN, RED, USAGE, screen } from './transmissions'
import type { Accent } from './transmissions'

const COLUMN_GAP = 40
const BAR_HEIGHT = 14
const HIGH = 90
const WARNING = 70
const MAX_GAUGES = 4
const LABEL_CHARACTER_WIDTH = 8.4
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const GAUGES = [
  { kind: 'five_hour', label: 'REACTOR CORE  5 HOUR', terminal: '5-hour', showsWeekday: false },
  { kind: 'seven_day', label: 'FLEET CYCLE  7 DAY', terminal: 'weekly', showsWeekday: true },
  { kind: 'spend_limit', label: 'IMPERIAL TREASURY  SPEND', terminal: 'spend', showsWeekday: true },
]

/** The percent used as a whole number with a percent sign, never rounded up to 100. */
export function formatPercent(percentUsed: number): string {
  return `${Math.floor(percentUsed)}%`
}

/** The reset time in local time: `09:00`, or with the weekday, `Thu 09:00`; empty when the date is invalid. */
export function formatReset(resetsAt: string, showsWeekday: boolean): string {
  const date = new Date(resetsAt)
  if (Number.isNaN(date.getTime())) return ''
  const time = date.toTimeString().slice(0, 5)

  return showsWeekday ? `${WEEKDAYS[date.getDay()]} ${time}` : time
}

/** A countdown such as `in 14m`, `in 2h 14m` or `in 3d 4h`. */
export function formatCountdown(milliseconds: number): string {
  if (milliseconds <= 0) return 'now'
  const minutes = Math.floor(milliseconds / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `in ${days}d ${hours}h`
  if (hours > 0) return `in ${hours}h ${minutes % 60}m`

  return minutes > 0 ? `in ${minutes}m` : 'in <1m'
}

type Gauge = { label: string; terminal: string; showsWeekday: boolean; limit: UsageLimit }

/** The limits to show: the known kinds in a fixed order, then any other kind under its own name. */
function presentGauges(usage: UsageLimit[]): Gauge[] {
  const known = GAUGES.flatMap(gauge => {
    const limit = usage.find(one => one.kind === gauge.kind)

    return limit === undefined ? [] : [{ ...gauge, limit }]
  })
  const others = usage
    .filter(limit => !GAUGES.some(gauge => gauge.kind === limit.kind))
    .map(limit => ({ label: limit.kind.toUpperCase(), terminal: limit.kind, showsWeekday: true, limit }))

  return [...known, ...others].slice(0, MAX_GAUGES)
}

/** The reset time and countdown of a limit; undefined when it has no valid reset date. */
function describeReset(limit: UsageLimit, showsWeekday: boolean, now: number): { time: string; countdown: string } | undefined {
  if (limit.resetsAt === undefined) return undefined
  const time = formatReset(limit.resetsAt, showsWeekday)

  return time === '' ? undefined : { time, countdown: formatCountdown(Date.parse(limit.resetsAt) - now) }
}

/** The limits as one line of plain text, for the terminal surface. */
export function formatUsageLines(usage: UsageLimit[] | undefined, now: number): string[] {
  if (usage === undefined) return ['Usage: awaiting telemetry']
  const parts = presentGauges(usage).map(gauge => {
    const reset = describeReset(gauge.limit, gauge.showsWeekday, now)

    return `${gauge.terminal} ${formatPercent(gauge.limit.percentUsed)}${reset === undefined ? '' : `, resets ${reset.time}, ${reset.countdown}`}`
  })

  return [parts.length === 0 ? 'Usage: no limit reported' : `Usage: ${parts.join('; ')}`]
}

/** The accent of a gauge: red from 90%, amber from 70%, green below. */
function accentOf(percentUsed: number): Accent {
  if (percentUsed >= HIGH) return RED
  if (percentUsed >= WARNING) return AMBER

  return GREEN
}

type GaugeOptions = { gauge: Gauge; x: number; width: number; top: number; now: number }

/** One gauge: label, bar, percent and the reset line. */
function drawGauge({ gauge, x, width, top, now }: GaugeOptions): string {
  const { limit } = gauge
  const accent = accentOf(limit.percentUsed)
  const barWidth = width - 64
  const filled = (Math.min(Math.max(limit.percentUsed, 0), 100) / 100) * barWidth
  const reset = describeReset(limit, gauge.showsWeekday, now)
  const ticks = Array.from({ length: 9 }, (_, index) => {
    const tickX = x + ((index + 1) * barWidth) / 10

    return line({ x: tickX, y: top + 12 }, { x: tickX, y: top + 12 + BAR_HEIGHT }, `stroke="${PALETTE.screen}" stroke-width="1.5" opacity="0.7"`)
  })

  return (
    text(x, top, clip(gauge.label, Math.floor(width / LABEL_CHARACTER_WIDTH)), PALETTE.greenDim, { size: 13, weight: 700, spacing: 0.4 }) +
    `<rect x="${round(x)}" y="${top + 12}" width="${round(barWidth)}" height="${BAR_HEIGHT}" fill="${PALETTE.greenDeep}" stroke="${accent.dim}" stroke-width="1"/>` +
    `<rect x="${round(x)}" y="${top + 12}" width="${round(filled)}" height="${BAR_HEIGHT}" fill="${accent.bright}" opacity="0.9"/>` +
    ticks.join('') +
    text(x + width, top + 25, formatPercent(limit.percentUsed), accent.bright, { size: 20, anchor: 'end', weight: 700 }) +
    (reset === undefined ? '' : text(x, top + 56, `RESETS ${reset.time}  ${reset.countdown}`, PALETTE.green, { size: 13.5, opacity: 0.9 }))
  )
}

/** The usage console below the log: one gauge per limit, or a message when there is none. */
export function drawUsage(usage: UsageLimit[] | undefined, now: number): string {
  const gauges = presentGauges(usage ?? [])
  const width = 1000 - 2 * MARGIN
  const x = MARGIN + 32
  if (gauges.length === 0) {
    const isAwaiting = usage === undefined
    const idle = screen(MARGIN, USAGE.top, width, USAGE.height, 'POWER RESERVES', isAwaiting ? 'NO SIGNAL' : 'NO LIMIT', GREEN, 'usage-idle')
    const headline = isAwaiting ? `AWAITING TELEMETRY${Math.floor(now / 500) % 2 === 0 ? '_' : ' '}` : 'NO LIMIT REPORTED'
    const hint = isAwaiting ? 'The limits appear after the first response.' : 'Subscription accounts report their limits.'

    return idle.markup + text(x, idle.body + 4, headline, PALETTE.greenDim, { size: 15 }) + text(x, idle.body + 28, hint, PALETTE.greenDim, { size: 13, opacity: 0.8 })
  }
  const accent = accentOf(Math.max(...gauges.map(gauge => gauge.limit.percentUsed)))
  const panel = screen(MARGIN, USAGE.top, width, USAGE.height, 'POWER RESERVES', 'PERCENT OF LIMIT USED', accent, 'usage')
  const columnWidth = (width - 64 - COLUMN_GAP * (gauges.length - 1)) / gauges.length

  return panel.markup + gauges.map((gauge, index) => drawGauge({ gauge, x: x + index * (columnWidth + COLUMN_GAP), width: columnWidth, top: panel.body, now })).join('')
}
