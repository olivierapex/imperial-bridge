import type { ToolCallInput } from 'claude-code'

import type { AgentRun, BridgeEvent } from '../types'

export const AGENT_PREFIX = 'galacticempire:'
export const TICK_MS = 400
export const FADE_MS = 10_000
export const REPORT_BEAM_MS = 3_000
export const MAX_RUNS = 60
export const MAX_EVENTS = 8

export const ROSTER = [
  { type: 'imperial-engineer', name: 'Imperial Engineer', model: 'sonnet' },
  { type: 'imperial-architect', name: 'Imperial Architect', model: 'sonnet' },
  { type: 'viper-probe-droid', name: 'Viper Probe Droid', model: 'haiku' },
  { type: 'isb-agent', name: 'ISB Agent', model: 'haiku' },
  { type: 'stormtrooper', name: 'Stormtrooper', model: 'haiku' },
  { type: 'stormtrooper-sergeant', name: 'Stormtrooper Sergeant', model: 'sonnet' },
  { type: 'isb-major', name: 'ISB Major', model: 'haiku' },
  { type: 'inquisitor', name: 'Inquisitor', model: 'sonnet' },
  { type: 'science-officer', name: 'Science Officer', model: 'sonnet' },
  { type: 'imperial-officer', name: 'Imperial Officer', model: 'haiku' },
  { type: 'imperial-bureaucrat', name: 'Imperial Bureaucrat', model: 'haiku' },
]

export type Phase = 'working' | 'fading' | 'idle'

/** The agent type without the plugin prefix. */
export function shortType(agentType: string): string {
  return agentType.startsWith(AGENT_PREFIX) ? agentType.slice(AGENT_PREFIX.length) : agentType
}

export function displayName(shortName: string): string {
  return ROSTER.find(agent => agent.type === shortName)?.name ?? shortName
}

/** The model family (haiku, sonnet, opus) named by a model alias or identifier. */
export function modelFamily(model: string): string {
  return ['haiku', 'sonnet', 'opus'].find(family => model.includes(family)) ?? model
}

/** The tool name plus the first 40 characters of a Bash command or a file name. */
export function describeActivity(e: ToolCallInput): string {
  if (e.tool === 'Bash') return `Bash ${e.command.slice(0, 40)}`
  if (e.tool === 'Read' || e.tool === 'Edit' || e.tool === 'Write') {
    return `${e.tool} ${(e.file_path.split('/').pop() ?? '').slice(0, 40)}`
  }
  return String(e.tool)
}

export function phaseOf(run: AgentRun, now: number): Phase {
  if (run.status === 'working') return 'working'
  return now - (run.finishedAt ?? now) < FADE_MS ? 'fading' : 'idle'
}

/** True while any agent works or is still fading, which keeps the redraw timer running. */
export function hasMotion(runs: AgentRun[], now: number): boolean {
  return runs.some(run => phaseOf(run, now) !== 'idle')
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

export function agentLabel(run: AgentRun): string {
  return `${displayName(shortType(run.agentType))} #${run.ordinal}`
}

export function formatEvent(event: BridgeEvent): string {
  const time = new Date(event.at).toTimeString().slice(0, 8)
  return `${time}  ${event.agent}  ${event.event}  ${event.caption}`
}

/** Index of the run owned by an agent; a run not yet bound to an id is claimed by the first unknown id. */
export function locate(runs: AgentRun[], agentId: string): number {
  const bound = runs.findIndex(run => run.agentId === agentId)
  return bound >= 0 ? bound : runs.findIndex(run => run.agentId === undefined && run.status === 'working')
}

/** The text cut to a length, with an ellipsis when it was longer. */
export function clip(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

/** The first non-empty line of a text, trimmed and cut to a length. */
export function firstLine(text: string, length: number): string {
  return clip(text.split('\n').find(line => line.trim() !== '')?.trim() ?? '', length)
}

/** The text wrapped to a width in at most a number of lines; the last line ends with an ellipsis when text is left over. */
export function wrapText(text: string, width: number, maximumLines: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let current = ''
    for (const word of paragraph.split(/\s+/).filter(piece => piece !== '')) {
      const piece = clip(word, width)
      if (current === '') current = piece
      else if (current.length + 1 + piece.length <= width) current += ` ${piece}`
      else {
        lines.push(current)
        current = piece
      }
    }
    if (current !== '') lines.push(current)
  }
  if (lines.length <= maximumLines) return lines
  const kept = lines.slice(0, maximumLines)
  kept[maximumLines - 1] = clip(`${kept[maximumLines - 1]}…`, width)

  return kept
}
