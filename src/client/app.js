import { initNetworkPanel, loadSnapshot } from './network.js'
import { readPersistedState, writePersistedState } from './state.js'
import { statusClass, layoutRows, scaleTicks, barModifier } from './utils.js'

let $root = null
let state = null

const TABS = [
  { id: 'requests', label: 'Request' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'queries', label: 'Queries' },
]

export function bootApp(rootEl) {
  $root = rootEl

  const initialState = readPersistedState()
  state = {
    // UI State
    isPanelOpen: initialState?.isPanelOpen ?? true,
    activeTab: initialState?.activeTab ?? 'requests',

    // Core Data
    requestId: $root.dataset.debugId,
    activeRequestId: initialState?.activeRequestId || $root.dataset.debugId,
    data: initialState?.data || null,
    history: initialState?.history || [],

    // User preferences
    collapsedQueries: initialState?.collapsedQueries || {},
    expandedTimelineRows: initialState?.expandedTimelineRows || {},
  }

  // Ensure activeRequestId is in history
  if (state.activeRequestId && !state.history.some((h) => h.id === state.activeRequestId)) {
    state.history.unshift({ id: state.activeRequestId, method: '⏳', url: 'Loading...' })
  }

  // Bind static listeners
  $root.querySelector('#dbg-launcher').addEventListener('click', () => togglePanel())
  $root.querySelector('#dbg-btn-expand').addEventListener('click', () => toggleExpand())
  $root.querySelector('#dbg-btn-close').addEventListener('click', () => togglePanel(false))

  const historySelect = $root.querySelector('#dbg-history-select')
  historySelect.addEventListener('change', (e) => switchHistory(e.target.value))

  // Initialization
  render()
  initNetworkPanel(state, render)

  if ($root.dataset.debugPrevId) {
    loadSnapshot($root.dataset.debugPrevId, state, render)
  }
}

// ── Actions ──────────────────────────────────────────────────────────────

function togglePanel(forcedState) {
  state.isPanelOpen = forcedState !== undefined ? forcedState : !state.isPanelOpen
  persistState()
  render()
}

function toggleExpand() {
  const panel = $root.querySelector('#dbg-panel')
  panel.classList.toggle('dbg-panel--expanded')
}

function switchTab(tabId) {
  state.activeTab = tabId
  persistState()
  render()
}

function switchHistory(reqId) {
  state.activeRequestId = reqId
  persistState()
  render()
  loadSnapshot(reqId, state, render)
}

function toggleQuery(index) {
  const key = `${state.activeRequestId}:${index}`
  state.collapsedQueries[key] = !state.collapsedQueries[key]
  persistState()
  renderQueriesTab()
}

function toggleTimelineRow(index) {
  const key = `${state.activeRequestId}:${index}`
  state.expandedTimelineRows[key] = !state.expandedTimelineRows[key]
  persistState()
  renderTimelineTab()
}

function persistState() {
  writePersistedState(state)
}

// ── Rendering ────────────────────────────────────────────────────────────

export function render() {
  if (!$root) return

  // 1. Shell visibility
  $root.querySelector('#dbg-launcher').style.display = state.isPanelOpen ? 'none' : 'inline-flex'
  $root.querySelector('#dbg-panel').style.display = state.isPanelOpen ? 'block' : 'none'
  $root.querySelector('#dbg-panel-content').style.display = state.isPanelOpen ? 'block' : 'none'

  if (!state.isPanelOpen) return

  // 2. Header
  renderHeader()

  // 3. Tabs
  renderTabs()

  // 4. Content visibility
  const hasData = !!state.data
  $root.querySelector('#dbg-loading').style.display = hasData ? 'none' : 'block'

  $root.querySelector('#tab-requests').style.display =
    hasData && state.activeTab === 'requests' ? 'grid' : 'none'
  $root.querySelector('#tab-timeline').style.display =
    hasData && state.activeTab === 'timeline' ? 'grid' : 'none'
  $root.querySelector('#tab-queries').style.display =
    hasData && state.activeTab === 'queries' ? 'grid' : 'none'

  if (!hasData) return

  // 5. Active Tab Content
  if (state.activeTab === 'requests') renderRequestsTab()
  if (state.activeTab === 'timeline') renderTimelineTab()
  if (state.activeTab === 'queries') renderQueriesTab()
}

function renderHeader() {
  const metaDisplay = state.data ? 'flex' : 'none'
  $root.querySelector('#dbg-meta-data').style.display = metaDisplay

  if (state.data) {
    const { request, queryTimeMs, requestMs } = state.data
    $root.querySelector('#dbg-path').textContent = request.url

    const statusEl = $root.querySelector('#dbg-status-pill')
    statusEl.textContent = request.statusCode
    statusEl.className = 'dbg-pill ' + statusClass(request.statusCode)

    $root.querySelector('#dbg-query-time').textContent = queryTimeMs?.toFixed(2) ?? '0'
    $root.querySelector('#dbg-request-time').textContent = requestMs?.toFixed(2) ?? '0'
  } else {
    $root.querySelector('#dbg-path').textContent = 'Loading...'
    $root.querySelector('#dbg-status-pill').textContent = '...'
    $root.querySelector('#dbg-status-pill').className = 'dbg-pill'
  }

  // History Select
  const select = $root.querySelector('#dbg-history-select')
  select.style.display = state.history.length > 0 ? 'inline-block' : 'none'

  if (state.history.length > 0) {
    const activeVal = state.activeRequestId || state.requestId
    let html = ''
    state.history.forEach((entry) => {
      const isSelected = entry.id === activeVal ? 'selected' : ''
      const method =
        entry.method || entry.snapshot?.request?.method || entry.snapshot?.requests?.method || 'GET'
      const url =
        entry.url ||
        entry.snapshot?.request?.path ||
        entry.snapshot?.request?.url ||
        entry.snapshot?.requests?.path ||
        entry.snapshot?.requests?.url ||
        '/'
      const label = entry.id === state.requestId ? 'Latest' : `${method} ${url}`
      html += `<option value="${entry.id}" ${isSelected}>${label}</option>`
    })
    select.innerHTML = html
  }
}

function renderTabs() {
  const container = $root.querySelector('#dbg-tabs-container')
  container.innerHTML = ''

  const tpl = document.getElementById('tpl-tab')

  TABS.forEach((tabDef) => {
    const clone = tpl.content.cloneNode(true)
    const btn = clone.querySelector('button')

    if (state.activeTab === tabDef.id) btn.classList.add('is-active')

    btn.querySelector('.dbg-tab-label').textContent = tabDef.label

    const countEl = btn.querySelector('.dbg-tab-count')
    if (state.data) {
      if (tabDef.id === 'queries' && state.data.queries.length > 0) {
        countEl.textContent = state.data.queries.length
        countEl.style.display = 'inline-flex'
      } else if (tabDef.id === 'timeline' && state.data.timeline.length > 0) {
        countEl.textContent = state.data.timeline.length
        countEl.style.display = 'inline-flex'
      }
    }

    btn.addEventListener('click', () => switchTab(tabDef.id))
    container.appendChild(clone)
  })
}

// ── Tab Renderers ────────────────────────────────────────────────────────

function renderRequestsTab() {
  const req = state.data.request

  // Summary
  $root.querySelector('#dbg-summary-method').textContent = req.method
  $root.querySelector('#dbg-summary-url').textContent = req.path

  const statusEl = $root.querySelector('#dbg-summary-status')
  statusEl.textContent = req.statusCode
  statusEl.className = 'dbg-pill ' + statusClass(req.statusCode)

  $root.querySelector('#dbg-summary-route').textContent = req.route || ''

  // Key-Value Sections
  renderKVTable('dbg-queries-section', 'dbg-queries-table', req.query)
  renderKVTable('dbg-params-section', 'dbg-params-table', req.params)
  renderKVTable('dbg-req-headers-table', 'dbg-req-headers-table', req.requestHeaders, true)
  renderKVTable('dbg-res-headers-table', 'dbg-res-headers-table', req.responseHeaders, true)

  // Preformatted Sections
  renderPreSection('dbg-body-section', 'dbg-body-pre', req.body)
  renderPreSection('dbg-session-section', 'dbg-session-pre', req.session)
}

function renderKVTable(sectionId, tableId, dataObj, forceShow = false) {
  const section = $root.querySelector(`#${sectionId}`)
  const table = $root.querySelector(`#${tableId}`)

  // If it's a generic section without an explicit wrapper ID, section = table
  const wrapper = section && section !== table ? section : null

  if (!dataObj || Object.keys(dataObj).length === 0) {
    if (wrapper && !forceShow) wrapper.style.display = 'none'
    table.innerHTML = forceShow ? '<tr><td colspan="2" class="dbg-empty">None</td></tr>' : ''
    return
  }

  if (wrapper) wrapper.style.display = 'block'
  table.innerHTML = ''

  const tpl = document.getElementById('tpl-kv-row')
  Object.entries(dataObj).forEach(([key, value]) => {
    const clone = tpl.content.cloneNode(true)
    const tds = clone.querySelectorAll('td')
    tds[0].textContent = key
    tds[1].textContent = typeof value === 'object' ? JSON.stringify(value) : value
    table.appendChild(clone)
  })
}

function renderPreSection(sectionId, preId, dataObj) {
  const section = $root.querySelector(`#${sectionId}`)
  if (!dataObj || Object.keys(dataObj).length === 0) {
    section.style.display = 'none'
    return
  }
  section.style.display = 'block'
  $root.querySelector(`#${preId}`).textContent = JSON.stringify(dataObj, null, 2)
}

function renderTimelineTab() {
  const tl = state.data.timeline
  if (!tl || tl.length === 0) return

  $root.querySelector('#dbg-wf-total').textContent = `${state.data.requestMs.toFixed(2)}ms`

  // Scale Ticks
  const scaleContainer = $root.querySelector('#dbg-wf-scale-container')
  scaleContainer.innerHTML = ''
  const tplTick = document.getElementById('tpl-scale-tick')
  const ticks = scaleTicks(state.data.requestMs)

  ticks.forEach((tick) => {
    const clone = tplTick.content.cloneNode(true)
    const span = clone.querySelector('span')
    span.style.left = `${tick.offset}%`
    span.textContent = tick.label
    scaleContainer.appendChild(clone)
  })

  // Rows
  const rowsContainer = $root.querySelector('#dbg-wf-rows-container')
  rowsContainer.innerHTML = ''
  const layout = layoutRows(state.data)
  const tplRow = document.getElementById('tpl-timeline-row')
  const tplSource = document.getElementById('tpl-timeline-source-row')

  layout.forEach((row, index) => {
    const clone = tplRow.content.cloneNode(true)
    const wrap = clone.querySelector('.dbg-wf-row-wrap')
    const btn = clone.querySelector('.dbg-wf-row-btn')

    // Toggle state
    const isExpanded = state.expandedTimelineRows[`${state.activeRequestId}:${index}`] ?? false
    if (isExpanded) {
      wrap.classList.add('is-expanded')
    } else {
      wrap.classList.remove('is-expanded')
    }

    btn.setAttribute('aria-expanded', isExpanded)
    btn.addEventListener('click', () => toggleTimelineRow(index))

    // Label
    clone.querySelector('.dbg-wf-label strong').textContent = row.label
    clone.querySelector('.dbg-wf-label span').textContent = `${row.durationMs.toFixed(2)}ms`

    // Bar
    const bar = clone.querySelector('.dbg-bar')
    bar.style.left = `${row.offset}%`
    bar.style.width = row.width > 0 ? `${row.width}%` : '2px'
    bar.classList.add(barModifier(row.type))

    if (row.width > 15) {
      const barSpan = clone.querySelector('.dbg-bar span')
      barSpan.style.display = 'block'
      barSpan.textContent = `${row.durationMs.toFixed(2)}ms`
    }

    // Grid ticks behind bar
    const track = clone.querySelector('.dbg-track')
    ticks.forEach((tick) => {
      const gridTick = document.createElement('div')
      gridTick.className = 'dbg-tick'
      gridTick.style.left = `${tick.offset}%`
      track.insertBefore(gridTick, bar)
    })

    // Details Body
    const details = clone.querySelector('.dbg-wf-details')
    details.style.display = isExpanded ? 'grid' : 'none'
    const detailSource = row.source || (row.type === 'query' ? row.meta : null)
    const detailMeta = row.meta && row.meta !== detailSource ? row.meta : null

    if (detailMeta) {
      details.innerHTML += `<div><strong>Details:</strong> ${detailMeta}</div>`
    }

    if (row.sql) {
      const pre = document.createElement('code')
      pre.textContent = row.sql
      details.appendChild(pre)
    }

    if (detailSource) {
      const srcClone = tplSource.content.cloneNode(true)
      srcClone.querySelector('.dbg-source-text').textContent = detailSource
      srcClone.querySelector('button').addEventListener('click', (e) => {
        navigator.clipboard.writeText(detailSource)
        const btnNode = e.currentTarget.querySelector('.dbg-copy-btn')
        btnNode.classList.add('is-copied')
        setTimeout(() => btnNode.classList.remove('is-copied'), 2000)
      })
      details.appendChild(srcClone)
    }

    rowsContainer.appendChild(clone)
  })
}

function renderQueriesTab() {
  const queries = state.data.queries
  $root.querySelector('#dbg-queries-empty').style.display = queries.length === 0 ? 'block' : 'none'

  const container = $root.querySelector('#dbg-queries-container')
  container.innerHTML = ''
  if (queries.length === 0) return

  const seenSql = new Set()
  const duplicateIndices = new Set()
  queries.forEach((q, i) => {
    if (seenSql.has(q.sql)) duplicateIndices.add(i)
    seenSql.add(q.sql)
  })

  const tpl = document.getElementById('tpl-query-row')

  queries.forEach((query, index) => {
    const clone = tpl.content.cloneNode(true)
    const row = clone.querySelector('.dbg-query-row')
    const head = clone.querySelector('.dbg-query-head')
    const conn = clone.querySelector('.dbg-query-conn')

    const isDuplicate = duplicateIndices.has(index)
    if (isDuplicate) {
      row.classList.add('is-duplicate')
      conn.classList.add('dbg-query-conn--duplicate')
      clone.querySelector('.dbg-query-dup-badge').style.display = 'inline-flex'
    }

    // Toggle
    const isCollapsed = state.collapsedQueries[`${state.activeRequestId}:${index}`] ?? false
    if (isCollapsed) {
      row.classList.add('is-collapsed')
      clone.querySelector('.dbg-query-toggle').textContent = '+'
    } else {
      row.classList.remove('is-collapsed')
      clone.querySelector('.dbg-query-toggle').textContent = '−'
    }

    head.setAttribute('aria-expanded', !isCollapsed)
    head.addEventListener('click', () => toggleQuery(index))

    // Info
    conn.textContent = `${query.method} · ${query.model || query.connection}`
    clone.querySelector('.dbg-query-dur').textContent = `${query.durationMs.toFixed(2)}ms`
    clone.querySelector('.dbg-query-sql:not(.dbg-query-bindings)').textContent = query.sql

    if (query.bindings?.length) {
      const bEl = clone.querySelector('.dbg-query-bindings')
      bEl.style.display = 'block'
      bEl.textContent = `bindings: ${JSON.stringify(query.bindings)}`
    }

    // Source
    if (query.source) {
      const srcBtn = clone.querySelector('.dbg-query-source.dbg-source-row--button')
      srcBtn.style.display = 'inline-flex'
      srcBtn.querySelector('.dbg-source-text').textContent = query.source
      srcBtn.addEventListener('click', (e) => {
        navigator.clipboard.writeText(query.source)
        const btnNode = e.currentTarget.querySelector('.dbg-copy-btn')
        btnNode.classList.add('is-copied')
        setTimeout(() => btnNode.classList.remove('is-copied'), 2000)
      })
    } else {
      clone.querySelector('.dbg-query-no-source').style.display = 'block'
    }

    container.appendChild(clone)
  })
}
