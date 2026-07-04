// Loaded via --require BEFORE Next.js initialises its own error handlers.
// Prevents corrupted Supabase auth cookie from crashing the dev server.
process.on('uncaughtException', function(err) {
  if (err instanceof SyntaxError) return   // JSON.parse on corrupted cookie
  if (err.name === 'AbortError') return    // fetch timeout
  process.stderr.write('[uncaughtException] ' + (err && err.stack || err) + '\n')
})

process.on('unhandledRejection', function(reason) {
  if (!reason) return
  if (reason instanceof SyntaxError) return
  if (reason instanceof Error) {
    if (reason.name === 'AbortError') return
    if (reason.message && (
      reason.message.includes('ENOTFOUND') ||
      reason.message.includes('fetch failed')
    )) return
  }
})
