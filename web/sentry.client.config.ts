import * as Sentry from '@sentry/nextjs'

// No-ops if NEXT_PUBLIC_SENTRY_DSN is unset — safe to leave in place until
// a Sentry project/DSN exists.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
})
