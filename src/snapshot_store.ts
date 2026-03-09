import type { DebugBarSnapshot, DebugBarStoredSnapshot } from './types.js'

interface SnapshotEntry {
  expiresAt: number
  snapshot: DebugBarSnapshot
}

interface RequestSnapshotEntry {
  expiresAt: number
  snapshots: DebugBarStoredSnapshot[]
}

const snapshotTtlMs = 2 * 60 * 1000
const maxSnapshots = 200
const snapshotsById = new Map<string, SnapshotEntry>()
const snapshotsByRequestId = new Map<string, RequestSnapshotEntry>()

export function storeSnapshot(
  id: string,
  snapshot: DebugBarSnapshot,
  clientRequestId?: string | null
) {
  pruneExpiredSnapshots()

  if (snapshotsById.size >= maxSnapshots) {
    const oldestKey = snapshotsById.keys().next().value
    if (oldestKey !== undefined) {
      snapshotsById.delete(oldestKey)
    }
  }

  snapshotsById.set(id, {
    expiresAt: Date.now() + snapshotTtlMs,
    snapshot,
  })


  if (clientRequestId) {
    storeRequestSnapshot(clientRequestId, { id, snapshot })
  }
}

export function getSnapshot(id: string) {
  pruneExpiredSnapshots()
  return snapshotsById.get(id)?.snapshot ?? null
}

export function getSnapshotsForRequest(id: string) {
  pruneExpiredSnapshots()
  return snapshotsByRequestId.get(id)?.snapshots ?? []
}

function pruneExpiredSnapshots() {
  const now = Date.now()

  for (const [key, value] of snapshotsById.entries()) {
    if (value.expiresAt <= now) {
      snapshotsById.delete(key)
    }
  }

  for (const [key, value] of snapshotsByRequestId.entries()) {
    if (value.expiresAt <= now) {
      snapshotsByRequestId.delete(key)
    }
  }
}

function storeRequestSnapshot(clientRequestId: string, snapshot: DebugBarStoredSnapshot) {
  const existingSnapshots = snapshotsByRequestId.get(clientRequestId)?.snapshots ?? []
  const snapshots = existingSnapshots.filter((entry) => entry.id !== snapshot.id)

  snapshots.unshift(snapshot)
  snapshotsByRequestId.set(clientRequestId, {
    expiresAt: Date.now() + snapshotTtlMs,
    snapshots: snapshots.slice(0, 10),
  })
}
