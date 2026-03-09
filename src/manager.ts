import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import type { DbQueryEventNode } from '@adonisjs/lucid/types/database'
import { getSnapshot, getSnapshotsForRequest, storeSnapshot } from './snapshot_store.js'
import { extractDebugSource } from './source.js'
import type {
  DebugBarQuery,
  DebugBarRequestInfo,
  DebugBarSnapshot,
  DebugBarTimelineEntry,
} from './types.js'

export type {
  DebugBarQuery,
  DebugBarRequestInfo,
  DebugBarSnapshot,
  DebugBarTimelineEntry,
} from './types.js'

interface DebugBarStore {
  id: string
  startedAt: number
  queries: DebugBarQuery[]
  timeline: DebugBarTimelineEntry[]
  lastQuerySource: string | null
}

interface DebugQueryEvent extends DbQueryEventNode {
  source?: string | null
}

const debugBarStorage = new AsyncLocalStorage<DebugBarStore>()

export function isDebugBarEnabled() {
  const explicit = process.env.DEBUGBAR_ENABLED
  if (explicit !== undefined) return explicit === 'true' || explicit === '1'
  return process.env.NODE_ENV === 'development'
}

export async function runWithDebugBar<T>(callback: () => Promise<T>): Promise<T> {
  if (!isDebugBarEnabled()) {
    return callback()
  }

  return debugBarStorage.run(
    {
      id: randomUUID(),
      startedAt: performance.now(),
      queries: [],
      lastQuerySource: null,
      timeline: [
        {
          type: 'request',
          label: 'Request received',
          startMs: 0,
          durationMs: 0,
          meta: null,
        },
      ],
    },
    callback
  )
}

export function getDebugBarSnapshot(ctx: HttpContext): DebugBarSnapshot | null {
  if (!isDebugBarEnabled()) {
    return null
  }

  const store = debugBarStorage.getStore()

  if (!store) {
    return null
  }

  const requestMs = roundMs(performance.now() - store.startedAt)
  const queries = fillMissingQuerySources(store.queries)
  const queryTimeMs = roundMs(queries.reduce((total, query) => total + (query.durationMs ?? 0), 0))
  const requestInfo = buildRequestInfo(ctx)
  const timeline = [
    ...store.timeline,
    {
      type: 'request' as const,
      label: 'Request finished',
      startMs: requestMs,
      durationMs: 0,
      meta: `${requestInfo.statusCode} ${requestInfo.route ?? requestInfo.path}`,
    },
  ]

  return {
    enabled: true,
    requestMs,
    queryCount: queries.length,
    queryTimeMs,
    request: requestInfo,
    timeline: dedupeFinishedRequestEntries(timeline).sort(
      (left, right) => left.startMs - right.startMs
    ),
    queries,
  }
}

export function getDebugBarRequestId() {
  return debugBarStorage.getStore()?.id ?? null
}

export function storeDebugBarSnapshot(ctx: HttpContext) {
  const snapshot = getDebugBarSnapshot(ctx)
  const id = getDebugBarRequestId()

  if (!snapshot || !id) {
    return null
  }

  storeSnapshot(id, snapshot, ctx.request.header('x-debug-request-id'))

  return id
}

export function getStoredDebugBarSnapshot(id: string) {
  return getSnapshot(id)
}

export function getStoredDebugBarSnapshotsForRequest(id: string) {
  return getSnapshotsForRequest(id)
}

export function recordDebugQuery(event: DebugQueryEvent) {
  const store = debugBarStorage.getStore()

  if (!store) {
    return
  }

  const durationMs = durationToMs(event.duration)
  const recordedAt = performance.now()
  const eventSource = event.source ?? extractDebugSource(new Error().stack)
  const source = eventSource ?? store.lastQuerySource
  const query = {
    connection: event.connection,
    method: event.method,
    model: event.model ?? null,
    sql: event.sql,
    bindings: event.bindings ?? [],
    durationMs,
    source,
  }

  if (source) {
    store.lastQuerySource = source
  }

  store.queries.push(query)
  store.timeline.push({
    type: 'query',
    label: `${event.method.toUpperCase()} ${event.model ?? event.connection}`,
    startMs: relativeStartMs(store.startedAt, recordedAt, durationMs),
    durationMs,
    meta: query.source,
  })
}

export function recordDebugRender(label: string, startedAt: number, meta?: string | null) {
  const store = debugBarStorage.getStore()

  if (!store) {
    return
  }

  const durationMs = roundMs(performance.now() - startedAt)
  store.timeline.push({
    type: 'render',
    label,
    startMs: roundMs(startedAt - store.startedAt),
    durationMs,
    meta: meta ?? null,
  })
}

export function recordRequestMatched(route: string | null) {
  const store = debugBarStorage.getStore()

  if (!store) {
    return
  }

  store.timeline.push({
    type: 'request',
    label: 'Route matched',
    startMs: roundMs(performance.now() - store.startedAt),
    durationMs: 0,
    meta: route,
  })
}

export function durationToMs(duration?: [number, number]) {
  if (!duration) {
    return null
  }

  return roundMs(duration[0] * 1000 + duration[1] / 1_000_000)
}

function buildRequestInfo(ctx: HttpContext): DebugBarRequestInfo {
  const rawResponse = ctx.response.response
  const session = 'session' in ctx ? (ctx.session as { all(): Record<string, unknown> }) : null

  return {
    method: ctx.request.method(),
    url: safeCall(() => ctx.request.completeUrl(), ctx.request.url(true)),
    path: ctx.request.url(),
    route: safeCall(() => ctx.route?.pattern ?? null, null),
    statusCode: rawResponse.statusCode,
    requestHeaders: normalizeRecord(ctx.request.request.headers),
    responseHeaders: normalizeRecord(
      typeof rawResponse.getHeaders === 'function' ? rawResponse.getHeaders() : {}
    ),
    query: normalizeRecord(safeCall(() => ctx.request.qs(), {})),
    body: normalizeRecord(safeCall(() => ctx.request.all(), {})),
    params: normalizeRecord(safeCall(() => ctx.params ?? {}, {})),
    session: session ? normalizeRecord(safeCall(() => session.all(), {})) : null,
  }
}

function relativeStartMs(requestStartedAt: number, recordedAt: number, durationMs: number | null) {
  const offset = durationMs ?? 0
  return roundMs(Math.max(0, recordedAt - requestStartedAt - offset))
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function dedupeFinishedRequestEntries(entries: DebugBarTimelineEntry[]) {
  let seenFinishedRequest = false

  return [...entries]
    .reverse()
    .filter((entry) => {
      if (entry.label !== 'Request finished') {
        return true
      }

      if (seenFinishedRequest) {
        return false
      }

      seenFinishedRequest = true
      return true
    })
    .reverse()
}

function safeCall<T>(callback: () => T, fallback: T): T {
  try {
    return callback()
  } catch {
    return fallback
  }
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}

function fillMissingQuerySources(queries: DebugBarQuery[]) {
  const firstKnownSource = queries.find((query) => query.source)?.source ?? null

  if (!firstKnownSource) {
    return queries
  }

  return queries.map((query) => ({
    ...query,
    source: query.source ?? firstKnownSource,
  }))
}
