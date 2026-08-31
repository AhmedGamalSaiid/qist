import { describe, expect, it } from 'vitest'
import { assertAdmin, assertWriter } from '../../lib/data/authz'
import type { HouseholdContext } from '../../lib/data/context'
import { UnauthorizedRoleError } from '../../lib/errors'

/**
 * T037 — the role matrix (research.md R8, spec FR-008). Pure: no database
 * involved, `HouseholdContext` is a plain object.
 */

function ctxWithRole(role: string): HouseholdContext {
  return { householdId: 'H', userId: 'U', role, timezone: 'Africa/Cairo', baseCurrency: 'EGP' }
}

describe('assertWriter', () => {
  it.each(['owner', 'admin', 'member'])('allows role %s', (role) => {
    expect(() => assertWriter(ctxWithRole(role))).not.toThrow()
  })

  it('refuses viewer', () => {
    expect(() => assertWriter(ctxWithRole('viewer'))).toThrow(UnauthorizedRoleError)
  })

  it('names "writer" as the required role', () => {
    try {
      assertWriter(ctxWithRole('viewer'))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedRoleError)
      expect((error as UnauthorizedRoleError).requires).toBe('writer')
    }
  })
})

describe('assertAdmin', () => {
  it.each(['owner', 'admin'])('allows role %s', (role) => {
    expect(() => assertAdmin(ctxWithRole(role))).not.toThrow()
  })

  it.each(['member', 'viewer'])('refuses role %s', (role) => {
    expect(() => assertAdmin(ctxWithRole(role))).toThrow(UnauthorizedRoleError)
  })

  it('names "admin" as the required role', () => {
    try {
      assertAdmin(ctxWithRole('member'))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedRoleError)
      expect((error as UnauthorizedRoleError).requires).toBe('admin')
    }
  })
})
