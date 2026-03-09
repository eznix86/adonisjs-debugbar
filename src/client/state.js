const displayModeStorageKey = 'debugbar.display-mode'
const sessionStorageKey = 'debugbar.session-state'

export function createDebugBarState(root) {
  const persistedState = readPersistedState()
  const bootRequestId = root.dataset.debugId || null

  const state = window.__debugBarState || {
    activeTab: 'requests',
    data: null,
    displayMode: localStorage.getItem(displayModeStorageKey) || 'dock',
    history: persistedState?.history ?? [],
    collapsedQueries: persistedState?.collapsedQueries ?? {},
    expandedTimelineRows: persistedState?.expandedTimelineRows ?? {},
    animatePanel: false,
    activeRequestId: persistedState?.activeRequestId ?? null,
    requestId: bootRequestId,
    copiedSourceKey: null,
  }

  window.__debugBarState = state
  state.requestId = bootRequestId || state.requestId
  state.activeRequestId = state.activeRequestId || state.requestId || state.history[0]?.id || null
  state.history = state.history.map((entry) => ({
    ...entry,
    snapshot: normalizeSnapshot(entry.snapshot),
  }))

  const validIds = new Set(state.history.map((entry) => entry.id))
  state.collapsedQueries = pruneStateKeys(state.collapsedQueries, validIds)
  state.expandedTimelineRows = pruneStateKeys(state.expandedTimelineRows, validIds)

  if (!state.data && state.activeRequestId) {
    state.data = state.history.find((entry) => entry.id === state.activeRequestId)?.snapshot ?? null
  } else if (state.data) {
    state.data = normalizeSnapshot(state.data)
  }

  return state
}

export function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return snapshot
  }

  if (!snapshot.request && snapshot.requests) {
    return {
      ...snapshot,
      request: snapshot.requests,
    }
  }

  return snapshot
}

export function persistState(state) {
  localStorage.setItem(displayModeStorageKey, state.displayMode)

  try {
    sessionStorage.setItem(
      sessionStorageKey,
      JSON.stringify({
        history: state.history.slice(0, 15),
        activeRequestId: state.activeRequestId,
        collapsedQueries: state.collapsedQueries,
        expandedTimelineRows: state.expandedTimelineRows,
      })
    )
  } catch {
    /* silent */
  }
}

export function writePersistedState(state) {
  persistState(state)
}

export function readPersistedState() {
  try {
    const raw = sessionStorage.getItem(sessionStorageKey)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)
    const history = Array.isArray(parsed?.history)
      ? parsed.history
          .filter((entry) => entry?.id && entry?.snapshot)
          .map((entry) => ({
            ...entry,
            snapshot: normalizeSnapshot(entry.snapshot),
          }))
      : []

    return {
      history,
      activeRequestId: typeof parsed?.activeRequestId === 'string' ? parsed.activeRequestId : null,
      collapsedQueries:
        parsed?.collapsedQueries && typeof parsed.collapsedQueries === 'object'
          ? parsed.collapsedQueries
          : {},
      expandedTimelineRows:
        parsed?.expandedTimelineRows && typeof parsed.expandedTimelineRows === 'object'
          ? parsed.expandedTimelineRows
          : {},
    }
  } catch {
    return null
  }
}

function pruneStateKeys(obj, validIds) {
  if (!obj || typeof obj !== 'object') {
    return {}
  }

  const pruned = Object.create(null)

  for (const key of Object.keys(obj)) {
    const requestKey = key.split(':')[0]

    if (requestKey === 'latest' || validIds.has(requestKey)) {
      pruned[key] = obj[key]
    }
  }

  return pruned
}
