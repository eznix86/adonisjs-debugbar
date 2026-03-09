import { bootApp } from './app.js'

export function bootDebugBar() {
  const root = document.getElementById('_debug')
  if (!root) {
    console.error('[AdonisJS Debugbar] Root element #_debug not found')
    return
  }

  try {
    bootApp(root)
  } catch (error) {
    console.error('[AdonisJS Debugbar] Failed to initialize:', error)
  }
}
