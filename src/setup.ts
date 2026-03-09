import { isDebugBarEnabled, recordDebugQuery } from './manager.js'
import { ModelQueryBuilder } from '@adonisjs/lucid/orm'
import type { DbQueryEventNode } from '@adonisjs/lucid/types/database'
import { extractDebugSource } from './source.js'

interface DebugQueryEventNode extends DbQueryEventNode {
  source?: string | null
}

interface DebugBarEmitter {
  on(event: 'db:query', listener: (event: DebugQueryEventNode) => void): void
}

interface DebugBarDbClient {
  query(): { constructor: { prototype: any } }
  insertQuery(): { constructor: { prototype: any } }
  rawQuery(sql: string): { constructor: { prototype: any } }
}

let queryRunnerPatched = false
let querySourcePatched = false

export function setupDebugBar(emitter: DebugBarEmitter, db?: DebugBarDbClient | null) {
  if (!isDebugBarEnabled()) {
    return
  }

  if (!querySourcePatched && db) {
    patchBuilderExecWithSource(db)
    querySourcePatched = true
  }

  if (!queryRunnerPatched) {
    emitter.on('db:query', (event) => {
      recordDebugQuery(event)
    })

    queryRunnerPatched = true
  }
}

function patchBuilderExecWithSource(db: DebugBarDbClient) {
  patchExecPrototype(db.query().constructor.prototype)
  patchExecPrototype(db.insertQuery().constructor.prototype)
  patchExecPrototype(db.rawQuery('SELECT 1').constructor.prototype)
  patchExecPrototype(ModelQueryBuilder.prototype)
}

function patchExecPrototype(prototype: any) {
  if (!prototype) {
    return
  }

  patchExecutionMethod(prototype, 'exec')
  patchExecutionMethod(prototype, 'execQuery')
}

function patchExecutionMethod(prototype: any, method: 'exec' | 'execQuery') {
  const marker = method === 'exec' ? '__debugBarExecPatched' : '__debugBarExecQueryPatched'

  if (typeof prototype[method] !== 'function' || prototype[marker]) {
    return
  }

  const originalMethod = prototype[method]

  prototype[method] = function patchedMethod(...args: any[]) {
    if (typeof this.reporterData === 'function') {
      this.reporterData({
        source: extractDebugSource(new Error().stack),
      })
    }

    return originalMethod.apply(this, args)
  }

  prototype[marker] = true
}
