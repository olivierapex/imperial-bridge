export type AgentRun = {
  agentId?: string
  toolUseId: string
  agentType: string
  ordinal: number
  description: string
  model: string
  status: 'working' | 'reported' | 'aborted'
  startedAt: number
  finishedAt?: number
  durationMs?: number
  activity?: string
}

export type BridgeEvent = {
  at: number
  agent: string
  event: 'spawned' | 'reported' | 'aborted'
  caption: string
}

declare module 'claude-code' {
  interface PluginState {
    'imperial-bridge': { runs: AgentRun[]; events: BridgeEvent[]; now: number }
  }
}
