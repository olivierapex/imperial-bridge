import { ROSTER, modelFamily } from './bridge'
import { PALETTE, line, round, text } from './svg'

const FAMILIES = ['haiku', 'sonnet', 'opus']
const BADGE = { height: 12, character: 6, padding: 8, chevron: 10 }

const MODEL_COLORS: Record<string, { bright: string; dim: string }> = {
  haiku: { bright: PALETTE.cyan, dim: PALETTE.cyanDim },
  sonnet: { bright: PALETTE.amber, dim: PALETTE.amberDim },
  opus: { bright: PALETTE.red, dim: PALETTE.redDim },
}

/** The model a station's agent type runs on unless Thrawn chooses otherwise. */
export function defaultModelOf(type: string): string | undefined {
  return ROSTER.find(agent => agent.type === type)?.model
}

/** True when the running model is stronger than the default one. */
export function isEscalated(model: string, defaultModel: string | undefined): boolean {
  if (defaultModel === undefined) return false
  const [running, base] = [FAMILIES.indexOf(modelFamily(model)), FAMILIES.indexOf(modelFamily(defaultModel))]

  return running >= 0 && base >= 0 && running > base
}

type BadgeOptions = { isEscalated?: boolean; isDimmed?: boolean }

export function badgeWidth(model: string, options: BadgeOptions = {}): number {
  return modelFamily(model).length * BADGE.character + BADGE.padding + (options.isEscalated === true ? BADGE.chevron : 0)
}

/** A small Imperial model badge, HAIKU, SONNET or OPUS; an escalated one is solid and carries an upward chevron. */
export function drawBadge(left: number, top: number, model: string, options: BadgeOptions = {}): string {
  const { isEscalated: escalated = false, isDimmed = false } = options
  const family = modelFamily(model)
  const color = MODEL_COLORS[family] ?? { bright: PALETTE.steel, dim: PALETTE.hullEdge }
  const width = badgeWidth(model, options)
  const ink = escalated ? '#020805' : color.bright
  const middle = top + BADGE.height / 2
  const chevronLeft = left + 4
  const chevron = escalated
    ? `<path d="M${round(chevronLeft)} ${round(middle + 2)}L${round(chevronLeft + 3)} ${round(middle - 1.5)}L${round(chevronLeft + 6)} ${round(middle + 2)}" fill="none" stroke="${ink}" stroke-width="1.6"/>`
    : ''
  const labelLeft = left + BADGE.padding / 2 + (escalated ? BADGE.chevron : 0)

  return (
    `<g opacity="${isDimmed ? 0.4 : 1}">` +
    `<rect x="${round(left)}" y="${round(top)}" width="${round(width)}" height="${BADGE.height}" rx="2" fill="${escalated ? color.bright : '#020805'}" stroke="${color.bright}" stroke-width="1"/>` +
    chevron +
    text(labelLeft, top + 9, family.toUpperCase(), ink, { size: 9, weight: 700, spacing: 0.6 }) +
    `</g>`
  )
}

/** The tag that names an escalation on a plate: an upward chevron and the word ESCALATED. */
export function drawEscalationTag(left: number, baseline: number, model: string): string {
  const color = (MODEL_COLORS[modelFamily(model)] ?? MODEL_COLORS.opus).bright
  const chevron = `<path d="M${round(left)} ${round(baseline)}L${round(left + 3.5)} ${round(baseline - 4)}L${round(left + 7)} ${round(baseline)}" fill="none" stroke="${color}" stroke-width="1.6"/>`

  return chevron + text(left + 11, baseline, 'ESCALATED', color, { size: 10, weight: 700, spacing: 0.6 })
}

export const ESCALATION_TAG_WIDTH = 11 + 'ESCALATED'.length * 6.6

/** Thrawn's own marker: he runs on OPUS, with a short lead line down to the badge. */
export function drawCommanderMarker(x: number, y: number): string {
  const width = badgeWidth('opus')

  return line({ x, y: y - 6 }, { x, y }, `stroke="${PALETTE.red}" stroke-width="1" opacity="0.7"`) + drawBadge(x - width / 2, y, 'opus')
}
