import {
  getStoredDebugBarSnapshot,
  getStoredDebugBarSnapshotsForRequest,
  isDebugBarEnabled,
} from './manager.js'
import { getDebugBarAsset, getDebugBarScript } from './assets.js'

interface DebugBarRouter {
  get(path: string, handler: (ctx: any) => any): void
}

const registeredDebugBarRouters = new WeakSet<DebugBarRouter>()

export function registerDebugBarRoutes(router: DebugBarRouter) {
  if (!isDebugBarEnabled() || registeredDebugBarRouters.has(router)) {
    return
  }

  router.get('/_debug/:id', async ({ params, response }) => {
    response.header('cache-control', 'no-store')
    const snapshot = getStoredDebugBarSnapshot(params.id)

    if (!snapshot) {
      return response.notFound({ error: 'Debug snapshot not found' })
    }

    return response.json(snapshot)
  })

  router.get('/_debug/request/:id', async ({ params, response }) => {
    response.header('cache-control', 'no-store')
    return response.json(getStoredDebugBarSnapshotsForRequest(params.id))
  })

  router.get('/_debug/assets/debugbar.js', async ({ response }) => {
    response.header('content-type', 'application/javascript; charset=utf-8')
    response.header('cache-control', 'no-cache')
    return response.send(getDebugBarScript())
  })

  const assetPaths = [
    'client/app.js',
    'client/boot.js',
    'client/network.js',
    'client/state.js',
    'client/utils.js',
  ]

  for (const assetPath of assetPaths) {
    router.get(`/_debug/assets/${assetPath}`, async ({ response }) => {
      response.header('content-type', 'application/javascript; charset=utf-8')
      response.header('cache-control', 'no-cache')
      return response.send(getDebugBarAsset(assetPath))
    })
  }

  registeredDebugBarRouters.add(router)
}
