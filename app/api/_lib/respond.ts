import {
  AlreadyAppliedError,
  CardNotFoundError,
  CardValidationError,
  MultipleHouseholdsError,
  NoHouseholdError,
  NotApplicableError,
  UnauthenticatedError,
  UnauthorizedRoleError,
} from '../../../lib/errors'

/**
 * The single error → HTTP mapping table (contracts/http-api.md, Universal
 * semantics). Every route handler funnels its catch block through this —
 * never a per-handler status-code decision — so `401`/`404`/`403`/`422`/`409`
 * mean the same thing everywhere in the surface.
 *
 * Anything not recognised here is rethrown: an unmapped error is a bug to
 * surface loudly, not a case to guess a status code for.
 */
export function respondToError(error: unknown): Response {
  if (error instanceof UnauthenticatedError) {
    return json(401, { error: 'unauthenticated' })
  }

  // FR-007: a caller with no membership in a household reads exactly as if
  // that household did not exist — the same answer as any other household
  // this caller does not belong to.
  if (error instanceof NoHouseholdError || error instanceof CardNotFoundError) {
    return json(404, { error: 'not_found' })
  }

  if (error instanceof UnauthorizedRoleError) {
    return json(403, { error: 'forbidden', requires: error.requires })
  }

  if (error instanceof CardValidationError) {
    return json(422, { error: 'invalid', reasons: error.reasons })
  }

  if (error instanceof AlreadyAppliedError) {
    return json(409, { error: 'already_applied' })
  }

  if (error instanceof NotApplicableError) {
    return json(409, { error: 'not_applicable' })
  }

  // Structurally possible, operationally impossible until membership
  // management ships (research.md R3): failing loudly rather than guessing
  // which of the user's households was meant.
  if (error instanceof MultipleHouseholdsError) {
    return json(500, { error: 'ambiguous_household' })
  }

  throw error
}

/** The one success-envelope constructor every route handler uses (contracts/http-api.md). */
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
