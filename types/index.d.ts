export type AgentRun = {
  agentId?: string
  toolUseId: string
  agentType: string
  ordinal: number
  description: string
  order?: string
  model: string
  status: 'working' | 'reported' | 'aborted'
  startedAt: number
  finishedAt?: number
  durationMs?: number
  activity?: string
  report?: string
}

export type BridgeEvent = {
  at: number
  agent: string
  event: 'spawned' | 'reported' | 'aborted'
  caption: string
  model?: string
}

// Same shape as the engine's SessionRateLimit: this contract cannot import it.
export type UsageLimit = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

declare module 'claude-code' {
  interface PluginState {
    'imperial-bridge': { runs: AgentRun[]; events: BridgeEvent[]; now: number; usage?: UsageLimit[] }
  }
}
