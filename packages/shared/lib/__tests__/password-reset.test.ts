// Regression for the 2026-10-13 audit: the reset email had no redirectTo (landing on
// the staff login with no reset form) and a failed send still said "check your email".

jest.mock('../supabase')

import { supabase } from '../supabase'

const mockSupabase = supabase as unknown as { auth: { resetPasswordForEmail: jest.Mock } }

beforeEach(() => {
  mockSupabase.auth = { resetPasswordForEmail: jest.fn() }
})

function load() {
  process.env.EXPO_PUBLIC_API_URL = 'https://queue-web-omega.vercel.app/'
  let mod: typeof import('../password-reset')
  jest.isolateModules(() => { mod = require('../password-reset') })
  return mod!
}

it('sends the link to the web reset page, marked as coming from the app', async () => {
  mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null })

  expect(await load().requestPasswordReset('  Patient@Example.com ')).toEqual({ ok: true })
  expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('patient@example.com', {
    redirectTo: 'https://queue-web-omega.vercel.app/reset-password?from=app',
  })
})

it('reports a failed send instead of claiming success', async () => {
  mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 60 seconds.' } })

  expect(await load().requestPasswordReset('a@b.co')).toEqual({ ok: false, error: 'For security purposes, you can only request this after 60 seconds.' })
})
