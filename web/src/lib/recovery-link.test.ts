import { describe, it, expect } from 'vitest'
import { parseRecoveryHash } from './recovery-link'

// Regression for the 2026-10-13 audit: a patient's reset link (implicit flow,
// tokens in the fragment) never opened the reset form.
describe('parseRecoveryHash', () => {
  it('reads tokens from a recovery fragment', () => {
    expect(parseRecoveryHash('#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery'))
      .toEqual({ accessToken: 'a.b.c', refreshToken: 'r1' })
  })

  it('ignores fragments that are not password recovery', () => {
    expect(parseRecoveryHash('#access_token=a&refresh_token=r&type=magiclink')).toBeNull()
    expect(parseRecoveryHash('#access_token=a&refresh_token=r&type=invite')).toBeNull()
  })

  it('ignores an empty or partial fragment', () => {
    expect(parseRecoveryHash('')).toBeNull()
    expect(parseRecoveryHash('#type=recovery&access_token=a')).toBeNull()
    expect(parseRecoveryHash('#error=access_denied&error_code=otp_expired&type=recovery')).toBeNull()
  })
})
