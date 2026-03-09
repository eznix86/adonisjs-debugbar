import { normalizeSnapshot } from './state.js'

function isDebugRequest(input) {
  const url = input instanceof Request ? input.url : String(input)
  return url.includes('/_debug/')
}

function createClientRequestId() {
  return window.crypto?.randomUUID?.() ?? `debug-${Date.now()}-${Math.random()}`
}

export function createDebugBarDataApi(state, render) {
  function setActiveSnapshot(id) {
    const entry = state.history.find((historyEntry) => historyEntry.id === id)

    if (!entry) {
      return
    }

    state.activeRequestId = id
    state.data = entry.snapshot
    render()
  }

  function storeSnapshot(id, snapshot, activate = true) {
    const normalizedSnapshot = normalizeSnapshot(snapshot)
    const nextHistory = state.history.filter((entry) => entry.id !== id)
    nextHistory.unshift({
      id,
      snapshot: normalizedSnapshot,
      method: normalizedSnapshot?.request?.method ?? normalizedSnapshot?.requests?.method ?? 'GET',
      url:
        normalizedSnapshot?.request?.path ??
        normalizedSnapshot?.request?.url ??
        normalizedSnapshot?.requests?.path ??
        normalizedSnapshot?.requests?.url ??
        '',
    })
    state.history = nextHistory.slice(0, 15)

    if (activate) {
      state.activeRequestId = id
      state.data = normalizedSnapshot
    }
  }

  function storeSnapshots(entries, activate = true) {
    if (!entries.length) {
      return
    }

    entries
      .slice()
      .reverse()
      .forEach((entry, index) => {
        storeSnapshot(entry.id, entry.snapshot, activate && index === entries.length - 1)
      })
  }

  async function load(id, activate = true) {
    if (!id) {
      if (activate) {
        state.activeRequestId = null
        state.data = state.history[0]?.snapshot ?? null
      }

      render()
      return
    }

    if (activate) {
      state.requestId = id
      state.activeRequestId = id
    } else if (!state.requestId) {
      state.requestId = id
    }

    render()

    try {
      const response = await fetch(`/_debug/${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })

      if (!response.ok) {
        throw new Error('fetch failed')
      }

      storeSnapshot(id, await response.json(), activate)
    } catch {
      if (activate) {
        state.data = state.history.find((entry) => entry.id === id)?.snapshot ?? null
      }
    }

    render()
  }

  async function syncRequestHistory(clientRequestId) {
    if (!clientRequestId) {
      return
    }

    try {
      const response = await fetch(`/_debug/request/${encodeURIComponent(clientRequestId)}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })

      if (!response.ok) {
        throw new Error('fetch failed')
      }

      storeSnapshots(await response.json())
      render()
    } catch {
      /* silent */
    }
  }

  return {
    load,
    setActiveSnapshot,
    syncRequestHistory,
  }
}

export function installNetworkHooks({ setRequestId, syncRequestHistory }) {
  if (window.__debugBarPatched) {
    return
  }

  const originalFetch = window.fetch.bind(window)
  const originalXhrOpen = XMLHttpRequest.prototype.open
  const originalXhrSend = XMLHttpRequest.prototype.send

  window.fetch = async (...args) => {
    if (isDebugRequest(args[0])) {
      return originalFetch(...args)
    }

    const clientRequestId = createClientRequestId()
    const [input, init] = args
    let response

    if (input instanceof Request) {
      const headers = new Headers(input.headers)
      headers.set('x-debug-request-id', clientRequestId)
      response = await originalFetch(new Request(input, { headers }), init)
    } else {
      const headers = new Headers(init?.headers || {})
      headers.set('x-debug-request-id', clientRequestId)
      response = await originalFetch(input, { ...init, headers })
    }

    setRequestId(response.headers.get('x-debug-bar-id'))
    await syncRequestHistory(clientRequestId)
    return response
  }

  XMLHttpRequest.prototype.open = function (...args) {
    this.__debugRequestUrl = typeof args[1] === 'string' ? args[1] : null
    this.addEventListener(
      'loadend',
      () => {
        setRequestId(this.getResponseHeader('x-debug-bar-id'))
      },
      { once: true }
    )
    return originalXhrOpen.apply(this, args)
  }

  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__debugRequestUrl && !this.__debugRequestUrl.includes('/_debug/')) {
      const clientRequestId = createClientRequestId()
      this.setRequestHeader('x-debug-request-id', clientRequestId)
      this.addEventListener(
        'loadend',
        () => {
          void syncRequestHistory(clientRequestId)
        },
        { once: true }
      )
    }

    return originalXhrSend.apply(this, args)
  }

  window.__debugBarPatched = true
}

function getLegacyApi(state, render) {
  const api = createDebugBarDataApi(state, render)

  installNetworkHooks({
    setRequestId(id) {
      if (id) {
        state.requestId = id
      }
    },
    syncRequestHistory: api.syncRequestHistory,
  })

  return api
}

export function initNetworkPanel(state, render) {
  const api = getLegacyApi(state, render)

  if (state.requestId) {
    void api.load(state.requestId, true)
  }
}

export function loadSnapshot(id, state, render) {
  return getLegacyApi(state, render).load(id, true)
}
