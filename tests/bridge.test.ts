import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { ROSTER, displayName, wrapText } from '../hooks/bridge'
import { HEIGHT } from '../hooks/scene'
import { LOG_COLUMNS, drawTransmissions } from '../hooks/transmissions'

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
function setUp(on: On, agentIds: string[]) {
  const clock = mock.clock(on, { now: START })
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: agentIds.shift() }))
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('turn.complete', () => ({ text: '' }))
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
  expect(source).toContain('>THRAWN → STORMTROOPER #1</text>')
  expect(source).toContain('>RUN THE CHECKS</text>')
  expect(source).toContain('>THRAWN → VIPER PROBE DROID #1  ')
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
  expect(reported.source).toContain('>IMPERIAL ENGINEER #1 → THRAWN</text>')
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
  expect(source).toContain('SCIENCE OFFICER #1 → THRAWN')
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
  expect(running.source).toContain('>THRAWN → STORMTROOPER #2</text>')

  await complete($, 'a1', 3_000)
  const half = await draw($)
  expect(half.source).toContain('>STORMTROOPER #1 → THRAWN</text>')
  expect(half.source).toContain('BASH ECHO TWO')
  expect(half.source).not.toContain('BASH ECHO ONE')
  expect(half.source).not.toContain('  x2<')

  await complete($, 'a2', 5_000)
  const done = await draw($)
  expect(done.source).toContain('>STORMTROOPER #2 → THRAWN</text>')
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
