/**
 * Boundary-only identifiers and timestamps (research.md R5).
 *
 * `crypto.randomUUID()` is native on Workers and Node 22 — zero dependencies
 * against a hard bundle budget. `lib/` write functions keep taking explicit
 * `id` / `at` parameters, exactly as Feature 003 demands: these two helpers
 * are called at the boundary (route handlers, auth hooks) and the results
 * passed in, which is what keeps `lib/` clock-free and id-free and every
 * test able to pin both.
 */

export function newId(): string {
  return crypto.randomUUID()
}

export function now(): number {
  return Date.now()
}
