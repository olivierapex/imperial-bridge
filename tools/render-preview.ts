import { mkdirSync, writeFileSync } from 'node:fs'

import type { AgentRun, BridgeEvent } from '../types'
import { ROSTER } from '../hooks/bridge'
import { drawBridge } from '../hooks/scene'

const NOW = 1_700_000_100_000
const REPORT = 'Found 3 failing checks in the mod folder.\nThe roster test passes; the scene test needs the new station names.\nNothing else changed.'

function run(agentType: string, ordinal: number, overrides: Partial<AgentRun>): AgentRun {
  return {
    toolUseId: `${agentType}-${ordinal}`,
    agentType: `galacticempire:${agentType}`,
    ordinal,
    description: 'Run the checks',
    order: 'Run the unit tests of the mod and report every failure',
    model: 'haiku',
    status: 'working',
    startedAt: NOW - 20_000,
    ...overrides,
  }
}

const idle: AgentRun[] = []
const working: AgentRun[] = [
  run('stormtrooper', 1, { activity: 'Bash npm test --silent', description: 'Run the checks' }),
  run('stormtrooper', 2, { activity: 'Read bridge.test.ts', description: 'Scan the fixtures', order: 'Read the fixtures and list the stale names' }),
  run('imperial-engineer', 1, { model: 'sonnet', activity: 'Edit scene.ts', description: 'Build the bridge scene', order: 'Redraw the bridge scene as an Imperial Star Destroyer command deck' }),
]
const reporting: AgentRun[] = [
  run('viper-probe-droid', 1, { status: 'reported', finishedAt: NOW - 1_500, durationMs: 18_500, report: REPORT, description: 'Scan the logs', order: 'Scan the deployment logs for failed runs' }),
  run('isb-agent', 1, { activity: 'Bash grep -rn "ssh" hooks', description: 'Audit the mod' }),
]
const aborted: AgentRun[] = [
  run('science-officer', 1, { status: 'aborted', finishedAt: NOW - 2_000, durationMs: 9_000, report: 'Run interrupted before the review finished.', description: 'Review the plan', order: 'Review the migration plan for risks' }),
  run('inquisitor', 1, { activity: 'Read register.tsx', description: 'Hunt hidden defects' }),
]

const busy: AgentRun[] = [
  ...ROSTER.map(agent => run(agent.type, 1, { activity: 'Bash ls -la hooks', description: `Task for ${agent.name}` })),
  run('stormtrooper', 2, { activity: 'Read scene.ts' }),
  run('stormtrooper', 3, { activity: 'Edit notes.md' }),
  run('Explore', 1, { activity: 'Grep roster' }),
  run('general-purpose', 1, { activity: 'Read README.md' }),
]

function events(runs: AgentRun[]): BridgeEvent[] {
  return runs.flatMap((one, index): BridgeEvent[] => {
    const agent = `${one.agentType.replace('galacticempire:', '')} #${one.ordinal}`
    const spawned: BridgeEvent = { at: NOW - 30_000 + index * 4_000, agent, event: 'spawned', caption: one.description }
    return one.status === 'working' ? [spawned] : [spawned, { at: one.finishedAt ?? NOW, agent, event: one.status, caption: one.description }]
  })
}

const longLog: AgentRun[] = Array.from({ length: 8 }, (_, index) =>
  run('imperial-architect', index + 1, {
    status: index % 3 === 2 ? 'aborted' : 'reported',
    finishedAt: NOW - 1_000 * (8 - index),
    durationMs: 12_000,
    activity: undefined,
    description: `Redesign the transmission console so that every long description stays inside its frame number ${index + 1}`,
    report: 'The console grew taller and wider; every line is now clipped to the frame with an ellipsis and nothing leaves the screen. '.repeat(3),
    order: 'Make the console taller and wider and clip every long line cleanly with an ellipsis, never overflowing the frame at all.',
  }),
)

mkdirSync('preview', { recursive: true })
for (const [name, runs] of Object.entries({ idle, working, reporting, aborted, busy, 'long-log': longLog })) {
  const source = drawBridge(runs, events(runs), NOW)
  writeFileSync(`preview/${name}.svg`, source)
  console.log(name, source.length)
}
