import type { ApplicationService } from '@adonisjs/core/types'
import { renderDebugBarShell } from './assets.js'
import { isDebugBarEnabled } from './manager.js'
import { registerDebugBarRoutes } from './routes.js'
import { setupDebugBar } from './setup.js'

export default class DebugBarProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {
    if (this.app.getEnvironment() !== 'web' || !isDebugBarEnabled()) {
      return
    }

    const emitter = await this.app.container.make('emitter')
    const router = await this.app.container.make('router')
    let lucidDb: unknown = null

    try {
      lucidDb = await this.app.container.make('lucid.db')
    } catch {
      lucidDb = null
    }

    registerDebugBarRoutes(router)
    setupDebugBar(emitter, lucidDb as any)

    if (this.app.usingEdgeJS) {
      const edge = await import('edge.js')

      edge.default.global(
        'renderDebugBar',
        (debugBarId?: string | null, previousDebugBarId?: string | null) => {
          if (!debugBarId) {
            return ''
          }

          return renderDebugBarShell(debugBarId, previousDebugBarId)
        }
      )

      edge.default.registerTag({
        tagName: 'debugbar',
        block: false,
        seekable: true,
        noNewLine: true,
        compile(_parser, buffer, token) {
          buffer.outputExpression(
            'state.renderDebugBar(state.debugBarId, state.debugBarPrevId)',
            token.filename,
            token.loc.start.line,
            false
          )
        },
      })
    }
  }
}
