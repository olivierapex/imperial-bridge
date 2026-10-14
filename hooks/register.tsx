import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface, Register, StateDollar } from 'claude-code'

import type { AgentRun, BridgeEvent } from '../types'
import { MAX_EVENTS, MAX_RUNS, TICK_MS, agentLabel, clip, describeActivity, firstLine, formatEvent, hasMotion, locate } from './bridge'
import { drawBridge } from './scene'
import { formatUsageLines } from './usage'

const ORDER_LENGTH = 200
const REPORT_LENGTH = 600
const PANE = 'imperial-bridge'
const TITLE = 'Imperial Bridge'
const runsState = atom({ plugin: 'imperial-bridge', key: 'runs' } as const, [])
const eventsState = atom({ plugin: 'imperial-bridge', key: 'events' } as const, [])
const nowState = atom({ plugin: 'imperial-bridge', key: 'now' } as const, 0)
const usageState = atom({ plugin: 'imperial-bridge', key: 'usage' } as const, undefined)

const logEvent = ($: StateDollar, event: BridgeEvent) =>
  update($, eventsState, list => [...list, event].slice(-MAX_EVENTS))

const COUNTDOWN_MS = 60_000

/** Reads the rate-limit windows once and notes the time; a failure is logged and never breaks the caller. */
const refreshUsage = async ($: Pick<CoreEngineInterface, 'state' | 'session' | 'clock' | 'ui'>) => {
  try {
    const { rateLimits } = await $.session.usage()
    const now = await $.clock.now()
    if (rateLimits.length > 0) await update($, usageState, () => rateLimits)
    await update($, nowState, () => now)
  } catch (error) {
    $.ui.log(`usage unavailable: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
  }
}

export const register: Register = on => {
  let stopTicking: (() => void) | undefined
  let stopCountdown: (() => void) | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'bridge', description: 'Open the Imperial Bridge pane' })
    const result = await next(e)
    await refreshUsage($)

    return result
  })

  on('ui.open', { id: PANE }, async ($, e, next) => {
    const result = await next(e)
    await refreshUsage($)
    stopCountdown ??= $.clock.every(COUNTDOWN_MS, async () => {
      const tickNow = await $.clock.now()
      await update($, nowState, () => tickNow)
    }).cancel

    return result
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    stopCountdown?.()
    stopCountdown = undefined

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usageState, () => e.rateLimits)
    const now = await $.clock.now()
    await update($, nowState, () => now)

    return next(e)
  })

  on('command.run', { command: 'bridge' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Imperial Bridge opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const now = await $.clock.now()
    const runs = await read($, runsState)
    const run: AgentRun = {
      toolUseId: e.tool_use_id,
      agentType: e.subagentType,
      ordinal: runs.filter(one => one.agentType === e.subagentType).length + 1,
      description: e.description,
      order: firstLine(e.prompt, ORDER_LENGTH),
      model: e.model ?? e.parentModel,
      status: 'working',
      startedAt: now,
    }
    await update($, runsState, list => [...list, run].slice(-MAX_RUNS))
    await logEvent($, { at: now, agent: agentLabel(run), event: 'spawned', caption: run.description, model: run.model })
    await update($, nowState, () => now)
    if (runs.length === 0) void $.ui.open({ id: PANE, title: TITLE })
    if (stopTicking === undefined) {
      stopTicking = $.clock.every(TICK_MS, async () => {
        const tickNow = await $.clock.now()
        await update($, nowState, () => tickNow)
        if (!hasMotion(await read($, runsState), tickNow)) {
          stopTicking?.()
          stopTicking = undefined
        }
      }).cancel
    }

    const started = await next(e)
    if (started.deny !== undefined) {
      await update($, runsState, list => list.filter(one => one.toolUseId !== run.toolUseId || one.agentId !== undefined))
      return started
    }
    await update($, eventsState, list =>
      list.map(event => (event.at === now && event.agent === agentLabel(run) && event.event === 'spawned' ? { ...event, model: started.model } : event)),
    )
    await update($, runsState, list => {
      const index = list.findIndex(one => one.toolUseId === run.toolUseId && one.ordinal === run.ordinal && one.agentType === run.agentType)
      const bound = list[index]

      return bound === undefined
        ? list
        : list.map((one, position) =>
            position === index ? { ...one, agentId: bound.agentId ?? started.agentId, model: started.model } : one,
          )
    })

    return started
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const agentId = e.agentId
      const activity = describeActivity(e)
      await update($, runsState, list => {
        const index = locate(list, agentId)

        return list.map((one, position) => (position === index ? { ...one, agentId, activity } : one))
      })
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const agentId = e.agentId
      const now = await $.clock.now()
      const status: AgentRun['status'] = e.isAborted ? 'aborted' : 'reported'
      const runs = await read($, runsState)
      const run = runs[locate(runs, agentId)]
      if (run !== undefined && run.status === 'working') {
        await update($, runsState, list =>
          list.map(one => (one === run || one.agentId === agentId ? { ...one, agentId, status, finishedAt: now, durationMs: e.durationMs, activity: undefined, report: clip(e.answer.trim(), REPORT_LENGTH) } : one)),
        )
        await logEvent($, { at: now, agent: agentLabel(run), event: status, caption: run.description, model: run.model })
        await update($, nowState, () => now)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const runs = await read($, runsState)
    const events = await read($, eventsState)
    const now = await read($, nowState)
    const usage = await read($, usageState)
    const lines = [...events].reverse().map(event => <Text key="event">{formatEvent(event)}</Text>)
    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          {lines}
          {formatUsageLines(usage, now).map(content => (
            <Text key="usage">{content}</Text>
          ))}
        </Box>
      )
    }
    const { Svg } = $.ui.resolve(e)
    const active = runs.filter(run => run.status === 'working').length

    return (
      <Box flexDirection="column">
        <Svg source={drawBridge(runs, events, now, usage)} alt={`Imperial Star Destroyer command bridge, ${active} agents working`} />
      </Box>
    )
  })
}
