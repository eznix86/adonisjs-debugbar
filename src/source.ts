import { fileURLToPath } from 'node:url'

let applicationRoot: string | null = null

function getApplicationRoot() {
  if (applicationRoot === null) {
    applicationRoot = process.cwd()
  }
  return applicationRoot
}

const ignoredFramePathFragments = [
  '/node_modules/',
  '/src/adonisjs_debugbar/manager.',
  '/src/adonisjs_debugbar/setup.',
  '/packages/adonisjs-debugbar/src/manager.',
  '/packages/adonisjs-debugbar/src/setup.',
]

export function extractDebugSource(stack?: string) {
  if (!stack) {
    return null
  }

  const frames = stack.split('\n').slice(1)

  for (const frame of frames) {
    const parsedFrame = parseStackFrame(frame)

    if (!parsedFrame) {
      continue
    }

    const normalizedPath = normalizeFramePath(parsedFrame.path)

    if (!normalizedPath || shouldIgnoreFrame(normalizedPath)) {
      continue
    }

    if (!normalizedPath.startsWith(getApplicationRoot())) {
      continue
    }

    const relativePath = normalizedPath.slice(getApplicationRoot().length + 1)
    return `${relativePath}:${parsedFrame.line}`
  }

  return null
}

function shouldIgnoreFrame(normalizedPath: string) {
  if (normalizedPath.startsWith('node:internal')) {
    return true
  }

  return ignoredFramePathFragments.some((fragment) => normalizedPath.includes(fragment))
}

function parseStackFrame(frame: string) {
  const normalizedFrame = frame.trim().replace(/^at\s+/, '')
  const location = normalizedFrame.includes('(')
    ? normalizedFrame.slice(normalizedFrame.lastIndexOf('(') + 1, normalizedFrame.length - 1)
    : normalizedFrame
  const match = location.match(/^(.*):(\d+):(\d+)$/)

  if (!match) {
    return null
  }

  return {
    path: match[1],
    line: Number(match[2]),
  }
}

function normalizeFramePath(framePath: string) {
  if (framePath.startsWith('file://')) {
    return fileURLToPath(framePath)
  }

  return framePath
}
