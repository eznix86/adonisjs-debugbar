# Adonis JS Debug Bar

Debug bar for AdonisJS.

It adds a bottom panel in development to inspect:

- request details
- SQL queries, bindings, duration, duplicates, and source
- a timeline of the request lifecycle
- previous request snapshots in the same browser session

## Install

```bash
pnpm add @eznix/adonisjs-debugbar
```

## Setup

### 1. Register the provider

In `adonisrc.ts`:

```ts
providers: [
  // ...
  () => import('@eznix/adonisjs-debugbar/provider'),
]
```

### 2. Register the middleware

In `start/kernel.ts`:

```ts
router.use([
  // ...
  () => import('@eznix/adonisjs-debugbar/middleware'),
])
```

If you use Inertia, place it after `@adonisjs/inertia/inertia_middleware` so render timings are captured.

Example with Inertia:

```ts
router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/shield/shield_middleware'),
  () => import('@adonisjs/inertia/inertia_middleware'),
  () => import('@eznix/adonisjs-debugbar/middleware'),
])
```

Example without Inertia:

```ts
router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/shield/shield_middleware'),
  () => import('@eznix/adonisjs-debugbar/middleware'),
])
```

Non-Inertia apps still get request, query, and timeline data. Only Inertia-specific render entries are unavailable.

### 3. Render the debug bar

Add `@debugbar()` near the end of your Edge layout:

```edge
<!DOCTYPE html>
<html>
  <body>
    @!section('content')
    @debugbar()
    </body>
  </html>
```

## Configuration

The debug bar is enabled by default when `NODE_ENV=development`.

You can override it with `DEBUGBAR_ENABLED`:

```env
DEBUGBAR_ENABLED=true
```

or

```env
DEBUGBAR_ENABLED=false
```

## Extending DebugBar

Most apps only need the provider, middleware, and `@debugbar()`.

If you need manual instrumentation, these are the useful public helpers:

- `isDebugBarEnabled()` - check whether the debug bar is active
- `runWithDebugBar(fn)` - run custom async work inside a debug bar context
- `recordDebugRender(label, startedAt, meta?)` - add a custom render/timing entry to the timeline
- `recordDebugQuery(event)` - record a custom query event when you are not using Lucid's built-in instrumentation

Types are available from `@eznix/adonisjs-debugbar/types`.

## License

MIT
