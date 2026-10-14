import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import type { UsageLimit } from '../types'
import { ROSTER, displayName, formatEvent, modelTag, wrapText } from '../hooks/bridge'
import { isEscalated } from '../hooks/models'
import { HEIGHT } from '../hooks/scene'
import { LOG, LOG_COLUMNS, USAGE, drawTransmissions } from '../hooks/transmissions'
import { drawUsage, formatCountdown, formatPercent, formatReset, formatUsageLines } from '../hooks/usage'

const PLUGIN = 'imperial-bridge'
const START = 1_700_000_000_000
const PANE_PROPS = {
  title: 'Imperial Bridge',
  isFocused: false,
  bodyColumns: 100,
  placement: 'dock',
  scroll: {},
  view: {},
} as never

/** Loads the plugin over a mocked clock and a stubbed engine bottom. */
function setUp(on: On, agentIds: string[], model = 'claude-haiku-4-5', usage: UsageLimit[] | Error = []) {
  const clock = mock.clock(on, { now: START })
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('agent.spawn', () => ({ model, agentId: agentIds.shift() }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('turn.complete', () => ({ text: '' }))
  on('session.usage', () => {
    if (usage instanceof Error) throw usage
    return { value: { startedAt: START, context: {}, rateLimits: usage } } as never
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  return { clock, opened }
}

function spawn($: Engine, toolUseId: string, subagentType: string, description: string, prompt = 'brief') {
  return $.agent.spawn({
    tool_use_id: toolUseId,
    prompt,
    description,
    subagentType,
    provider: { plugin: 'galacticempire', tier: 'user' },
    parentModel: 'claude-opus-4-7',
    background: true,
    fork: false,
  } as never)
}

function useTool($: Engine, agentId: string, command: string) {
  return $.tool.call({ tool: 'Bash', tool_use_id: `tool-${agentId}`, agentId, command } as never)
}

function complete($: Engine, agentId: string, durationMs: number, isAborted = false, answer = 'done') {
  return $.turn.complete({
    answer,
    durationMs,
    isAborted,
    turnId: `turn-${agentId}`,
    agentId,
    reason: isAborted ? 'aborted' : 'answer',
  } as never)
}

async function draw($: Engine, surface: 'desktop' | 'terminal' = 'desktop') {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: 'Pane',
    props: PANE_PROPS,
    requestId: 'imperial-bridge',
  })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
  const lines = (await ui.findAll({ type: 'Text' })).map(line => line.text)
  await ui.unmount()

  return { source, lines }
}

const RANKS: Record<string, string> = {
  'imperial-engineer': 'Imperial Engineer',
  'viper-probe-droid': 'Viper Probe Droid',
  'isb-agent': 'ISB Agent',
  'imperial-architect': 'Imperial Architect',
  'science-officer': 'Science Officer',
  inquisitor: 'Inquisitor',
  stormtrooper: 'Stormtrooper',
  'stormtrooper-sergeant': 'Stormtrooper Sergeant',
  'imperial-officer': 'Imperial Officer',
  'isb-major': 'ISB Major',
  'imperial-bureaucrat': 'Imperial Bureaucrat',
}

test('each roster agent maps to its rank label', () => {
  expect(ROSTER.map(agent => agent.type).sort()).toEqual(Object.keys(RANKS).sort())
  for (const [type, rank] of Object.entries(RANKS)) expect(displayName(type)).toBe(rank)
})

test('every rank is labelled on its own station', async ($, on) => {
  setUp(on, [])
  const { source } = await draw($)
  for (const rank of Object.values(RANKS)) expect(source).toContain(`>${rank.toUpperCase()}</text>`)
  expect(source).toContain('>SPARE STATION</text>')
})

test('wrapped text keeps to the width and ends with an ellipsis when cut', () => {
  expect(wrapText('one two three four five six', 9, 2)).toEqual(['one two', 'three…'])
  expect(wrapText('a\n\nb', 9, 4)).toEqual(['a', 'b'])
})

test('a spawn shows the order on the console, lights the station and opens the pane once', async ($, on) => {
  const { opened } = setUp(on, ['a1', 'a2'])
  await spawn($, 'u1', 'galacticempire:viper-probe-droid', 'Scan the logs', 'Read every deployment log.\nSecond line.')
  await spawn($, 'u2', 'galacticempire:stormtrooper', 'Run the checks')
  const { source } = await draw($)
  expect(opened).toEqual(['imperial-bridge'])
  expect(source).toContain('>THRAWN → STORMTROOPER #1 [HAIKU]</text>')
  expect(source).toContain('>RUN THE CHECKS</text>')
  expect(source).toContain('>THRAWN → VIPER PROBE DROID #1 [HAIKU]  ')
  expect(source).toContain('AWAITING ORDERS')
  expect(source).toContain('stroke-dasharray="1.5 7"')
  expect((await draw($)).source).not.toContain('Second line')
})

test('the order shows only the first line of the prompt', async ($, on) => {
  setUp(on, ['a1'])
  await spawn($, 'u1', 'galacticempire:imperial-architect', 'Design the pane', 'Draw the bridge.\nNever shown.')
  const { source } = await draw($)
  expect(source).toContain('>Draw the bridge.</text>')
  expect(source).not.toContain('Never shown')
})

test('tool activity shows on the station plate', async ($, on) => {
  setUp(on, ['a1'])
  await spawn($, 'u1', 'galacticempire:imperial-engineer', 'Build the mod')
  await useTool($, 'a1', 'x'.repeat(60))
  const { source } = await draw($)
  expect(source).toContain(`>&gt; BASH ${'X'.repeat(23)}</text>`)
  expect(source).not.toContain('X'.repeat(24))
})

test('a report shows its text, beams back for three seconds and the station goes quiet', async ($, on) => {
  const { clock } = setUp(on, ['a1'])
  await spawn($, 'u1', 'galacticempire:imperial-engineer', 'Build the mod')
  await clock.advance(1_000)
  await complete($, 'a1', 4_200, false, 'The mod is built.\nAll checks pass.')
  const reported = await draw($)
  expect(reported.source).toContain('>IMPERIAL ENGINEER #1 [HAIKU] → THRAWN</text>')
  expect(reported.source).toContain('>The mod is built.</text>')
  expect(reported.source).toContain('>All checks pass.</text>')
  expect(reported.source).toContain('>T+4s</text>')
  expect(reported.source).toContain('stroke-dasharray="1.5 7"')
  await clock.advance(11_000)
  const later = await draw($)
  expect(later.source).not.toContain('stroke-dasharray="1.5 7"')
  expect(later.source).toContain('>The mod is built.</text>')
})

test('an aborted run shows in alert red', async ($, on) => {
  setUp(on, ['a1'])
  await spawn($, 'u1', 'galacticempire:science-officer', 'Review')
  await complete($, 'a1', 2_000, true)
  const { source } = await draw($)
  expect(source).toContain('>SIGNAL LOST  RUN ABORTED</text>')
  expect(source).toContain('SCIENCE OFFICER #1 [HAIKU] → THRAWN')
  expect(source).toContain('#ff4438')
})

test('two instances of one type run and finish independently', async ($, on) => {
  setUp(on, ['a1', 'a2'])
  await spawn($, 'u1', 'galacticempire:stormtrooper', 'First task')
  await spawn($, 'u2', 'galacticempire:stormtrooper', 'Second task')
  await useTool($, 'a1', 'echo one')
  await useTool($, 'a2', 'echo two')
  const running = await draw($)
  expect(running.source).toContain('>STORMTROOPER  x2</text>')
  expect(running.source).toContain('BASH ECHO TWO')
  expect(running.source).toContain('>THRAWN → STORMTROOPER #2 [HAIKU]</text>')

  await complete($, 'a1', 3_000)
  const half = await draw($)
  expect(half.source).toContain('>STORMTROOPER #1 [HAIKU] → THRAWN</text>')
  expect(half.source).toContain('BASH ECHO TWO')
  expect(half.source).not.toContain('BASH ECHO ONE')
  expect(half.source).not.toContain('  x2<')

  await complete($, 'a2', 5_000)
  const done = await draw($)
  expect(done.source).toContain('>STORMTROOPER #2 [HAIKU] → THRAWN</text>')
  expect(done.source).toContain('>T+5s</text>')
})

test('an unknown subagent type takes a spare station', async ($, on) => {
  setUp(on, ['a1'])
  await spawn($, 'u1', 'Explore', 'Look around')
  const { source } = await draw($)
  expect(source).toContain('>EXPLORE</text>')
  expect(source).not.toContain('>SPARE STATION</text>')
})

test('the drawing stays under the size limit with every station busy', async ($, on) => {
  const types = ROSTER.map(agent => agent.type)
  setUp(on, types.map((_, index) => `a${index}`))
  for (const [index, type] of types.entries()) await spawn($, `u${index}`, `galacticempire:${type}`, `Task ${index}`, 'x'.repeat(300))
  await spawn($, 'u-extra', 'Explore', 'Look around')
  const { source } = await draw($)
  expect(source.length).toBeLessThan(131_072)
})

test('the terminal surface lists the transmissions as text', async ($, on) => {
  setUp(on, ['a1'])
  await spawn($, 'u1', 'galacticempire:inquisitor', 'Hunt defects')
  const { source, lines } = await draw($, 'terminal')
  expect(source).toBe('')
  expect(lines[0]).toContain('Inquisitor #1')
  expect(lines[0]).toContain('Hunt defects')
})

test('transmission log lines are clipped to the console width and stay inside the frame', () => {
  const events = Array.from({ length: 8 }, (_, index) => ({
    at: START + index * 1000,
    agent: `galacticempire:imperial-architect-with-a-very-long-name #${index}`,
    event: 'reported' as const,
    caption: `A very long description that keeps going well past the right edge of the console ${'word '.repeat(30)}`,
  }))
  const source = drawTransmissions([], events, START)
  const rows = [...source.matchAll(/<text x="52" y="([\d.]+)" font-size="13.5"[^>]*>(.*?)<\/text>/g)]
  expect(rows).toHaveLength(8)
  for (const [, baseline, markup] of rows) {
    const content = [...markup.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map(match => match[1]).join('').replaceAll('&gt;', '>')
    expect(content.length).toBeLessThanOrEqual(LOG_COLUMNS)
    expect(content.trimEnd().endsWith('…')).toBe(true)
    expect(Number(baseline)).toBeLessThan(HEIGHT - 24 - 8)
  }
})

test('an idle station shows its default model dimmed and Thrawn carries an OPUS marker', async ($, on) => {
  setUp(on, [])
  const { source } = await draw($)
  expect(source).toContain('>SONNET</text>')
  expect(source).toContain('>HAIKU</text>')
  expect(source).toContain('<g opacity="0.4">')
  expect(source).toContain('>OPUS</text>')
  expect(source).not.toContain('ESCALATED')
})

test('a running instance shows an outlined badge for its model and no escalation at the default', async ($, on) => {
  setUp(on, ['a1'])
  await spawn($, 'u1', 'galacticempire:stormtrooper', 'Run the checks')
  const { source } = await draw($)
  expect(source).toContain('fill="#020805" stroke="#4fd8ff"')
  expect(source).toContain('fill="#4fd8ff" font-size="9"')
  expect(source).not.toContain('ESCALATED')
})

test('a model stronger than the station default is marked as escalated', async ($, on) => {
  setUp(on, ['a1'], 'claude-opus-4-7')
  await spawn($, 'u1', 'galacticempire:stormtrooper', 'Run the checks')
  const { source } = await draw($)
  expect(source).toContain('>ESCALATED</text>')
  expect(source).toContain('fill="#ff4438" stroke="#ff4438"')
  expect(source).toContain('fill="#020805" font-size="9"')
  expect(source).toContain('THRAWN → STORMTROOPER #1 [OPUS]')
})

test('a weaker model than the default is not an escalation', () => {
  expect(isEscalated('claude-haiku-4-5', 'sonnet')).toBe(false)
  expect(isEscalated('claude-sonnet-4-6', 'sonnet')).toBe(false)
  expect(isEscalated('claude-opus-4-7', 'sonnet')).toBe(true)
  expect(isEscalated('claude-opus-4-7', undefined)).toBe(false)
})

test('the spawn model replaces the guess in the log and in the terminal lines', async ($, on) => {
  setUp(on, ['a1'], 'claude-sonnet-4-6')
  await spawn($, 'u1', 'galacticempire:isb-agent', 'Audit the mod')
  const { source, lines } = await draw($, 'terminal')
  expect(source).toBe('')
  expect(lines[0]).toContain('ISB Agent #1 [SONNET]')
  expect(modelTag('claude-haiku-4-5')).toBe(' [HAIKU]')
  expect(modelTag(undefined)).toBe('')
  expect(formatEvent({ at: START, agent: 'ISB Agent #1', event: 'spawned', caption: 'x', model: 'haiku' })).toContain('ISB Agent #1 [HAIKU]  spawned')
})

test('log rows name the model after the rank', () => {
  const events = [{ at: START, agent: 'ISB Agent #1', event: 'spawned' as const, caption: 'Audit', model: 'haiku' }]
  expect(drawTransmissions([], events, START)).toContain('THRAWN → ISB AGENT #1 [HAIKU]')
})

const LIMITS: UsageLimit[] = [
  { kind: 'five_hour', percentUsed: 23.5, resetsAt: new Date(2026, 9, 14, 16, 14).toISOString() },
  { kind: 'seven_day', percentUsed: 41, resetsAt: new Date(2026, 9, 15, 9, 0).toISOString() },
]
const USAGE_NOW = new Date(2026, 9, 14, 14, 0).getTime()

test('usage figures are formatted as percent, local reset time and countdown', () => {
  expect(formatPercent(23.5)).toBe('23%')
  expect(formatPercent(99.9)).toBe('99%')
  expect(formatPercent(100)).toBe('100%')
  expect(formatReset(LIMITS[0]!.resetsAt!, false)).toBe('16:14')
  expect(formatReset(LIMITS[1]!.resetsAt!, true)).toBe('Thu 09:00')
  expect(formatCountdown(2 * 3_600_000 + 14 * 60_000)).toBe('in 2h 14m')
  expect(formatCountdown(3 * 86_400_000 + 4 * 3_600_000 + 59 * 60_000)).toBe('in 3d 4h')
  expect(formatCountdown(14 * 60_000)).toBe('in 14m')
  expect(formatCountdown(20_000)).toBe('in <1m')
  expect(formatCountdown(-5)).toBe('now')
})

test('the usage console shows each limit with its reset and countdown, and the spend limit only when present', () => {
  const source = drawUsage(LIMITS, USAGE_NOW)
  expect(source).toContain('>23%</text>')
  expect(source).toContain('>41%</text>')
  expect(source).toContain('>RESETS 16:14  in 2h 14m</text>')
  expect(source).toContain('>RESETS Thu 09:00  in 19h 0m</text>')
  expect(source).not.toContain('IMPERIAL TREASURY')
  const spend = drawUsage([...LIMITS, { kind: 'spend_limit', percentUsed: 112 }], USAGE_NOW)
  expect(spend).toContain('>IMPERIAL TREASURY  SPEND</text>')
  expect(spend).toContain('>112%</text>')
})

test('the usage console turns amber then red as a limit fills', () => {
  expect(drawUsage([{ kind: 'five_hour', percentUsed: 75 }], USAGE_NOW)).toContain(`fill="#ffb54a"`)
  const high = drawUsage([{ kind: 'five_hour', percentUsed: 96 }], USAGE_NOW)
  expect(high).toContain('>96%</text>')
  expect(high).toContain(`fill="#ff4438"`)
})

test('before any reading the usage console waits for telemetry, after an empty one it reports no limit', () => {
  expect(drawUsage(undefined, USAGE_NOW)).toContain('>AWAITING TELEMETRY_</text>')
  expect(formatUsageLines(undefined, USAGE_NOW)).toEqual(['Usage: awaiting telemetry'])
  expect(drawUsage([], USAGE_NOW)).toContain('>NO LIMIT REPORTED</text>')
  expect(drawUsage([], USAGE_NOW)).not.toContain('AWAITING')
  expect(formatUsageLines([], USAGE_NOW)).toEqual(['Usage: no limit reported'])
})

test('a reset already past reads now, and a missing or invalid reset shows no reset line', () => {
  const past = drawUsage([{ kind: 'five_hour', percentUsed: 10, resetsAt: new Date(USAGE_NOW - 60_000).toISOString() }], USAGE_NOW)
  expect(past).toContain('>RESETS 13:59  now</text>')
  for (const resetsAt of [undefined, 'not a date']) {
    const source = drawUsage([{ kind: 'five_hour', percentUsed: 10, resetsAt }], USAGE_NOW)
    expect(source).toContain('>10%</text>')
    expect(source).not.toContain('RESETS')
    expect(formatUsageLines([{ kind: 'five_hour', percentUsed: 10, resetsAt }], USAGE_NOW)).toEqual(['Usage: 5-hour 10%'])
  }
  expect(formatReset('not a date', false)).toBe('')
})

test('three gauges share the console in equal columns and an unknown kind keeps its own name', () => {
  const source = drawUsage([...LIMITS, { kind: 'spend_limit', percentUsed: 10 }, { kind: 'opus_week', percentUsed: 5 }], USAGE_NOW)
  const bars = [...source.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="14" fill="#0b2a1b"/g)].map(match => [Number(match[1]), Number(match[2])] as const)
  expect(bars).toHaveLength(4)
  for (const [left, width] of bars) {
    expect(left).toBeGreaterThanOrEqual(56)
    expect(left + width + 64).toBeLessThanOrEqual(1000 - 56 + 40)
  }
  expect(new Set(bars.map(bar => bar[1])).size).toBe(1)
  expect(source).toContain('>OPUS_WEEK</text>')
  expect(formatUsageLines([{ kind: 'opus_week', percentUsed: 5 }], USAGE_NOW)).toEqual(['Usage: opus_week 5%'])
})

test('the usage console stays below the log inside the drawing', () => {
  const top = Number(new RegExp(`<rect x="24" y="([\\d.]+)" width="952" height="${USAGE.height}"`).exec(drawUsage(LIMITS, USAGE_NOW))?.[1])
  expect(top).toBe(USAGE.top)
  expect(top).toBeGreaterThanOrEqual(LOG.top + LOG.height)
  expect(top + USAGE.height + 24).toBe(HEIGHT)
})

test('the pane reads the limits when it opens and follows session.measure', async ($, on) => {
  setUp(on, ['a1'], 'claude-haiku-4-5', LIMITS.slice(0, 1))
  await spawn($, 'u1', 'galacticempire:stormtrooper', 'Run the checks')
  const opened = await draw($)
  expect(opened.source).toContain('>23%</text>')
  expect(opened.source).not.toContain('FLEET CYCLE')
  await $.session.measure({ context: {}, rateLimits: LIMITS, changed: ['rateLimits'] } as never)
  const measured = await draw($)
  expect(measured.source).toContain('>FLEET CYCLE  7 DAY</text>')
  expect(measured.source).toContain('>41%</text>')
})

test('the terminal surface adds a usage line', async ($, on) => {
  setUp(on, [])
  expect((await draw($, 'terminal')).lines).toEqual(['Usage: awaiting telemetry'])
  await $.session.measure({ context: {}, rateLimits: LIMITS, changed: ['rateLimits'] } as never)
  const [usage] = (await draw($, 'terminal')).lines
  expect(usage).toContain('5-hour 23%, resets ')
  expect(usage).toContain('weekly 41%')
  expect(usage).not.toContain('  ')
  await $.session.measure({ context: {}, rateLimits: [], changed: ['rateLimits'] } as never)
  expect((await draw($, 'terminal')).lines).toEqual(['Usage: no limit reported'])
})

test('session.start registers the command and reads the limits', async ($, on) => {
  const registered: string[] = []
  setUp(on, [], 'claude-haiku-4-5', LIMITS)
  on('command.register', (_$, e) => (registered.push(e.name), { value: { isRegistered: true } }) as never)
  await $.session.start({ cwd: '/work' } as never)
  expect(registered).toEqual(['bridge'])
  expect((await draw($)).source).toContain('>23%</text>')
})

test('a failing usage read is logged and never breaks session.start', async ($, on) => {
  const registered: string[] = []
  const logged: string[] = []
  setUp(on, [], 'claude-haiku-4-5', new Error('no telemetry'))
  on('ui.log', (_$, e) => (logged.push(e.text), { value: undefined }) as never)
  on('command.register', (_$, e) => (registered.push(e.name), { value: { isRegistered: true } }) as never)
  await $.session.start({ cwd: '/work' } as never)
  expect(registered).toEqual(['bridge'])
  expect(logged.join()).toContain('usage unavailable')
})
