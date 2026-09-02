import { describe, expect, it } from 'vitest'
import { stateFromSearch } from '../../app/sign-in/state'
import { OWNER_UNCONFIGURED_CODE } from '../../lib/auth/on-first-sign-in'

/**
 * The `/sign-in` URL contract. The one thing this guards is the A3
 * constraint: every callback failure but the fail-closed refusal renders
 * the same causeless state (spec FR-004, Sign in handoff §1.4).
 */
describe('stateFromSearch', () => {
  it('is A1 with nothing in the URL', () => {
    expect(stateFromSearch({})).toBe('ready')
  })

  it('is A4 only for the dedicated fail-closed code', () => {
    expect(stateFromSearch({ error: OWNER_UNCONFIGURED_CODE })).toBe('refused')
    expect(stateFromSearch({ error: OWNER_UNCONFIGURED_CODE, error_description: 'anything' })).toBe('refused')
  })

  it('collapses every other error — and any description — into A3', () => {
    for (const error of ['access_denied', 'unable_to_create_user', 'invalid_code', '', 'owner_unconfigured']) {
      expect(stateFromSearch({ error, error_description: 'a reason the screen must never show' })).toBe(
        'unauthenticated',
      )
    }
    expect(stateFromSearch({ error: ['a', 'b'] })).toBe('unauthenticated')
  })

  it('is A5 after sign-out', () => {
    expect(stateFromSearch({ 'signed-out': '' })).toBe('signedOut')
  })

  it('never yields A2 from a URL — redirecting is client-only', () => {
    expect(stateFromSearch({ state: 'redirecting' })).toBe('ready')
  })
})
