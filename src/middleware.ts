import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import {
  getDebugBarRequestId,
  isDebugBarEnabled,
  recordDebugRender,
  recordRequestMatched,
  runWithDebugBar,
  storeDebugBarSnapshot,
} from './manager.js'

const debugBarLastSnapshotCookie = 'debugbar_last_snapshot'
const debugBarSnapshotCookieMaxAgeSeconds = 120

interface ViewRenderer {
  share(payload: Record<string, string | null>): void
}

interface InertiaRenderer {
  share(payload: Record<string, string | null>): void
  render(component: string, pageProps?: unknown, viewProps?: unknown): Promise<unknown>
}

export default class DebugBarMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (!isDebugBarEnabled() || isDebugRoute(ctx.request.url())) {
      return next()
    }

    return runWithDebugBar(async () => {
      const view = 'view' in ctx ? (ctx.view as ViewRenderer) : null
      const inertia = 'inertia' in ctx ? (ctx.inertia as InertiaRenderer) : null
      const previousDebugBarId = ctx.request.cookie(debugBarLastSnapshotCookie) ?? null

      recordRequestMatched(ctx.route?.pattern ?? null)
      const debugBarId = getDebugBarRequestId()

      if (view && debugBarId) {
        view.share({ debugBarId, debugBarPrevId: previousDebugBarId })
      }

      if (inertia) {
        if (debugBarId) {
          inertia.share({ debugBarId, debugBarPrevId: previousDebugBarId })
        }

        const originalRender = inertia.render.bind(inertia)

        inertia.render = async (component, pageProps, viewProps) => {
          const startedAt = performance.now()
          const result = await originalRender(component, pageProps, viewProps)
          recordDebugRender('Inertia response rendered', startedAt, component)
          return result
        }
      }

      const response = await next()
      const snapshotId = storeDebugBarSnapshot(ctx)

      if (snapshotId) {
        ctx.response.header('x-debug-bar-id', snapshotId)
        ctx.response.cookie(debugBarLastSnapshotCookie, snapshotId, {
          path: '/',
          maxAge: debugBarSnapshotCookieMaxAgeSeconds,
          sameSite: 'lax',
          httpOnly: true,
        })
      }

      return response
    })
  }
}

function isDebugRoute(url: string) {
  return url.startsWith('/_debug')
}
