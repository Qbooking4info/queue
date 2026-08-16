import { NextResponse } from 'next/server'

// For authenticated (Bearer-token) routes called cross-origin by the mobile/doctors
// Expo apps running in a browser (e.g. localhost:8095/8081 -> localhost:3000) --
// distinct from PUBLIC_CORS_HEADERS in public-hospital-select.ts, which only needs
// Allow-Origin for simple unauthenticated GETs. A request carrying an `Authorization`
// header and using POST/PATCH/DELETE is a non-simple request, so the browser sends a
// preflight OPTIONS first and checks Allow-Headers/Allow-Methods too, not just
// Allow-Origin. Wildcard origin is safe here specifically because these routes read
// the caller's identity from the Authorization header, never from a cookie --
// `Access-Control-Allow-Origin: *` is only unsafe to combine with
// `Access-Control-Allow-Credentials: true` (cookie-based auth), which none of these
// routes use.
export const AUTH_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

export function corsOptions() {
  return NextResponse.json({}, { headers: AUTH_CORS_HEADERS })
}
