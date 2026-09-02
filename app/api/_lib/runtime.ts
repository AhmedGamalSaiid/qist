import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { AppClient } from '../../../db/client'
import { createD1Client } from '../../../db/client-d1'
import type { AppEnv } from '../../../lib/auth/config'

export type { AppEnv }

export interface AppRuntime {
  readonly client: AppClient
  readonly env: AppEnv
}

function productionRuntime(): AppRuntime {
  const { env } = getCloudflareContext()
  return {
    client: createD1Client(env.DB),
    env: {
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      OWNER_EMAIL: env.OWNER_EMAIL ?? null,
    },
  }
}

let resolve: () => AppRuntime = productionRuntime

/**
 * The one seam every route handler uses to reach the D1 binding and
 * configured env. Swappable in tests (`tests/contract/**`) so a route
 * handler can be invoked as a plain function against a test database, on
 * either driver — no real Workers runtime context required (research.md R9,
 * R12).
 */
export function getRuntime(): AppRuntime {
  return resolve()
}

export function __setTestRuntime(factory: () => AppRuntime): void {
  resolve = factory
}

export function __resetRuntime(): void {
  resolve = productionRuntime
}
