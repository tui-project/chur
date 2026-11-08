import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createCsrfService } from '../../server/services/csrf.ts'

describe('CSRF tokens', () => {
  it('binds tokens to their session and signing key', () => {
    const key = randomBytes(32)
    const csrf = createCsrfService(key)
    const anonymous = csrf.issue()
    const signedIn = csrf.issue('session-one')
    expect(csrf.valid(anonymous)).toBe(true)
    expect(csrf.valid(anonymous, 'session-one')).toBe(false)
    expect(csrf.valid(signedIn, 'session-one')).toBe(true)
    expect(csrf.valid(signedIn, 'session-two')).toBe(false)
    expect(csrf.valid(signedIn)).toBe(false)
    expect(createCsrfService(key).valid(signedIn, 'session-one')).toBe(true)
    expect(createCsrfService(randomBytes(32)).valid(signedIn, 'session-one')).toBe(false)
    expect(csrf.issue('session-one')).not.toBe(signedIn)
  })

  it('rejects malformed or tampered tokens without throwing', () => {
    const csrf = createCsrfService(randomBytes(32))
    const token = csrf.issue()
    const tampered = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
    for (const input of [undefined, '', 'invalid', token + 'x', 'x'.repeat(10000), tampered]) {
      expect(csrf.valid(input)).toBe(false)
    }
  })
})
