import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

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

function spawn($: Engine, toolUseId: string, subagentType: string, description: string) {
  return $.agent.spawn({
    tool_use_id: toolUseId,
    prompt: 'brief',
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

function complete($: Engine, agentId: string, durationMs: number, isAborted = false) {
  return $.turn.complete({
    answer: 'done',
    durationMs,
    isAborted,
    turnId: `turn-${agentId}`,
    agentId,
    reason: isAborted ? 'aborted' : 'answer',
  } as never)
}

async function draw($: Engine) {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'desktop',
    component: 'Pane',
    props: PANE_PROPS,
    requestId: 'imperial-bridge',
  })
  const source = String((await ui.find({ type: 'Svg' }))?.props.source)
  const lines = (await ui.findAll({ type: 'Text' })).map(line => line.text)
  await ui.unmount()

  return { source, lines }
}

test('a spawn lights its station, beams out with the brief and opens the pane once', async ($, on) => {
  const { opened } = setUp(on, ['a1', 'a2'])
  await spawn($, 'u1', 'galacticempire:viper-probe-droid', 'Scan the logs')
  await spawn($, 'u2', 'galacticempire:stormtrooper', 'Run the checks')
  const { source, lines } = await draw($)
  expect(opened).toEqual(['imperial-bridge'])
  expect(source).toContain('Viper Probe Droid')
  expect(source).toContain('Scan the logs')
  expect(source).toContain('stroke-dasharray')
  expect(lines[0]).toContain('Stormtrooper #1')
  expect(lines[0]).toContain('spawned')
  expect(lines[0]).toContain('Run the checks')
})

test('tool activity shows the tool and the first 40 characters of a command', async ($, on) => {
  setUp(on, ['a1'])
  await spawn($, 'u1', 'galacticempire:krennic', 'Build the mod')
  await useTool($, 'a1', 'x'.repeat(60))
  const { source } = await draw($)
  expect(source).toContain(`Bash ${'x'.repeat(40)}`)
  expect(source).not.toContain('x'.repeat(41))
})

test('a completion beams back in green, shows the duration and fades after ten seconds', async ($, on) => {
  const { clock } = setUp(on, ['a1'])
  await spawn($, 'u1', 'galacticempire:krennic', 'Build the mod')
  await clock.advance(1_000)
  await complete($, 'a1', 4_200)
  const reported = await draw($)
  expect(reported.source).toContain('#3ddc84')
  expect(reported.source).toContain('reported 4s')
  expect(reported.lines[0]).toContain('reported')
  await clock.advance(11_000)
  expect((await draw($)).source).not.toContain('reported 4s')
})

test('an aborted run shows red', async ($, on) => {
  setUp(on, ['a1'])
  await spawn($, 'u1', 'galacticempire:dr-pershing', 'Review')
  await complete($, 'a1', 2_000, true)
  const { source, lines } = await draw($)
  expect(source).toContain('aborted 2s')
  expect(source).toContain('#ff3b3b')
  expect(lines[0]).toContain('aborted')
})

test('two instances of one type run and finish independently', async ($, on) => {
  setUp(on, ['a1', 'a2'])
  await spawn($, 'u1', 'galacticempire:stormtrooper', 'First task')
  await spawn($, 'u2', 'galacticempire:stormtrooper', 'Second task')
  await useTool($, 'a1', 'echo one')
  await useTool($, 'a2', 'echo two')
  const running = await draw($)
  expect(running.source).toContain('×2')
  expect(running.source).toContain('Bash echo one')
  expect(running.source).toContain('Bash echo two')

  await complete($, 'a1', 3_000)
  const half = await draw($)
  expect(half.source).toContain('reported 3s')
  expect(half.source).toContain('Bash echo two')
  expect(half.source).not.toContain('Bash echo one')
  expect(half.source).not.toContain('×2')

  await complete($, 'a2', 5_000)
  const done = await draw($)
  expect(done.source).toContain('reported 5s')
  expect(done.lines.filter(line => line.includes('spawned'))).toHaveLength(2)
  expect(done.lines.filter(line => line.includes('reported'))).toHaveLength(2)
})

test('an unknown subagent type appears as an extra station', async ($, on) => {
  setUp(on, ['a1'])
  await spawn($, 'u1', 'Explore', 'Look around')
  expect((await draw($)).source).toContain('Explore')
})
