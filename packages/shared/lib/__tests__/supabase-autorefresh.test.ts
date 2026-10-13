// The auth client must follow AppState: refresh timer on in the foreground, off in
// the background (2026-10-13 audit M4, Supabase's documented React Native setup).

jest.mock('expo-secure-store', () => ({}))
jest.mock('react-native-url-polyfill/auto', () => ({}))

const mockAuth = { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() }
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ auth: mockAuth })) }))

import { AppState } from 'react-native'

it('starts token refresh when the app becomes active and stops it in the background', () => {
  let listener: ((s: string) => void) | undefined
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
    listener = cb
    return { remove: jest.fn() }
  }) as never)
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.EXPO_PUBLIC_SUPABASE_PUBLIC_KEY = 'sb_publishable_test'

  jest.isolateModules(() => { require('../supabase') })

  listener?.('active')
  expect(mockAuth.startAutoRefresh).toHaveBeenCalledTimes(1)
  listener?.('background')
  expect(mockAuth.stopAutoRefresh).toHaveBeenCalledTimes(1)
})
