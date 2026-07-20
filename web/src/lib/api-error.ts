import { NextResponse } from 'next/server'

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'BOOKING_LIMIT_MONTHLY'
  | 'BOOKING_LIMIT_DAILY'
  | 'PLAN_LIMIT_DOCTORS'
  | 'STATUS_TERMINAL'
  | 'APPROVAL_TERMINAL'
  | 'INTERNAL'

export interface ApiError {
  error: string
  code: ApiErrorCode
  retry_after?: string
}

export function apiError(
  message: string,
  code: ApiErrorCode,
  status: number,
  extra?: Partial<ApiError>,
): NextResponse {
  return NextResponse.json({ error: message, code, ...extra } satisfies ApiError, { status })
}

export const Errors = {
  unauthenticated: () => apiError('Not authenticated', 'UNAUTHENTICATED', 401),
  forbidden: (msg = 'Forbidden') => apiError(msg, 'FORBIDDEN', 403),
  notFound: (resource = 'Resource') => apiError(`${resource} not found`, 'NOT_FOUND', 404),
  validation: (msg: string) => apiError(msg, 'VALIDATION', 400),
  planLimitDoctors: (max: number) =>
    apiError(`Your plan allows up to ${max} doctors. Upgrade to add more.`, 'PLAN_LIMIT_DOCTORS', 403),
  planLimitMonthly: (max: number) =>
    apiError(`Monthly booking limit of ${max} reached. Upgrade your plan to accept more bookings.`, 'BOOKING_LIMIT_MONTHLY', 403),
  dailyLimit: (max: number) =>
    apiError(`Daily booking limit of ${max} reached.`, 'BOOKING_LIMIT_DAILY', 429),
  internal: (msg?: string) => apiError(msg ?? 'Internal server error', 'INTERNAL', 500),
} as const
