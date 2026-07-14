export async function register() {
  // Only install in Node.js runtime — not available in Edge Runtime (middleware)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if ((process as any).__queueHandlersInstalled) return
  ;(process as any).__queueHandlersInstalled = true

  process.on('unhandledRejection', (reason) => {
    if (!(reason instanceof Error)) return
    if (reason instanceof SyntaxError) return         // corrupted cookie JSON parse
    if (reason.message?.includes('ENOTFOUND')) return // DNS failure (offline)
    if (reason.message?.includes('fetch failed')) return
    if (reason.name === 'AbortError') return          // our 8s timeout
    console.error('[unhandledRejection]', reason)
  })

  process.on('uncaughtException', (err) => {
    if (err instanceof SyntaxError) return
    console.error('[uncaughtException]', err)
  })
}
