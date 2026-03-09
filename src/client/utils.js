export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function fmt(value) {
  return JSON.stringify(value, null, 2)
}

export function hasEntries(value) {
  return Boolean(value && Object.keys(value).length)
}

export function statusClass(code) {
  const normalizedCode = Number.parseInt(code, 10)

  if (normalizedCode >= 500) return 'dbg-pill--err'
  if (normalizedCode >= 400) return 'dbg-pill--warn'
  if (normalizedCode >= 200 && normalizedCode < 300) return 'dbg-pill--ok'
  return ''
}

export function scaleTicks(total) {
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    label: `${Math.round(total * ratio * 100) / 100}ms`,
    offset: ratio * 100,
  }))
}

export function layoutRows(data) {
  const total = Math.max(data.requestMs || 1, 1)
  const laneEnds = []

  return (data.timeline || []).map((entry) => {
    const duration = entry.durationMs || 0
    const end = entry.startMs + Math.max(duration, 0.8)
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= entry.startMs)

    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }

    return {
      ...entry,
      lane,
      width: Math.max((duration / total) * 100, 1.5),
      offset: (entry.startMs / total) * 100,
    }
  })
}

export function barModifier(type) {
  return type === 'request'
    ? 'dbg-bar--request'
    : type === 'render'
      ? 'dbg-bar--render'
      : 'dbg-bar--query'
}

export const getBarModifier = barModifier
