export interface DebugBarTimelineEntry {
  type: 'request' | 'query' | 'render'
  label: string
  startMs: number
  durationMs: number | null
  meta?: string | null
}

export interface DebugBarQuery {
  connection: string
  method: string
  model: string | null
  sql: string
  bindings: unknown[]
  durationMs: number | null
  source: string | null
}

export interface DebugBarRequestInfo {
  method: string
  url: string
  path: string
  route: string | null
  statusCode: number
  requestHeaders: Record<string, unknown>
  responseHeaders: Record<string, unknown>
  query: Record<string, unknown>
  body: Record<string, unknown>
  params: Record<string, unknown>
  session: Record<string, unknown> | null
}

export interface DebugBarSnapshot {
  enabled: true
  requestMs: number
  queryCount: number
  queryTimeMs: number
  request: DebugBarRequestInfo
  timeline: DebugBarTimelineEntry[]
  queries: DebugBarQuery[]
}

export interface DebugBarStoredSnapshot {
  id: string
  snapshot: DebugBarSnapshot
}
