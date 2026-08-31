import { toNextJsHandler } from 'better-auth/next-js'
import { createAuth } from '../../../../lib/auth/config'
import { getRuntime } from '../../_lib/runtime'

/**
 * The mounted Better Auth handler (T021, contracts/http-api.md): sign-in
 * initiation, OAuth callback, session read, sign-out. Sign-out invalidates
 * the server-side session row, so a subsequent call answers `401`.
 *
 * The runtime (D1 binding + env) is resolved **per request** rather than
 * once at module scope, so a test can swap it (`app/api/_lib/runtime.ts`)
 * and so Cloudflare's per-request execution context is respected.
 */
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler((request: Request) => {
  const { client, env } = getRuntime()
  return createAuth(client, env).handler(request)
})
