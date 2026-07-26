export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }

  // Avoid direct `process.on` tokens so Next's Edge/static analysis
  // doesn't flag Node-only APIs during bundling for Edge runtime.
  const p = (globalThis as any)['process']
  if (!p) return
  // Only install in Node.js runtime — not available in Edge Runtime (middleware)
  if (p.env?.NEXT_RUNTIME !== 'nodejs') return
  if (p.__queueHandlersInstalled) return
  p.__queueHandlersInstalled = true

  const Sentry = await import('@sentry/nextjs')

  p.on('unhandledRejection', (reason: unknown) => {
    if (!(reason instanceof Error)) return
    if (reason instanceof SyntaxError) return         // corrupted cookie JSON parse
    if (reason.message?.includes('ENOTFOUND')) return // DNS failure (offline)
    if (reason.message?.includes('fetch failed')) return
    if ((reason as any).name === 'AbortError') return  // our 8s timeout
    console.error('[unhandledRejection]', reason)
    Sentry.captureException(reason)
  })

  p.on('uncaughtException', (err: unknown) => {
    if (err instanceof SyntaxError) return
    console.error('[uncaughtException]', err)
    Sentry.captureException(err)
  })
}

export async function onRequestError(...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.captureRequestError(...args)
}
