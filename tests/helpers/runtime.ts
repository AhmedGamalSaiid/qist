import { __resetRuntime, __setTestRuntime } from '../../app/api/_lib/runtime'
import type { AppClient } from '../../db/client'
import { TEST_AUTH_ENV } from './auth'

/**
 * Points the route-handler runtime seam (`app/api/_lib/runtime.ts`) at a
 * test database, so a route handler can be invoked as a plain function
 * (`GET(request)`) against a real test database with no Cloudflare Workers
 * runtime context (research.md R9, R12; contracts/http-api.md contract test
 * obligations).
 */
export function useTestRuntime(client: AppClient): void {
  __setTestRuntime(() => ({ client, env: TEST_AUTH_ENV }))
}

export function resetTestRuntime(): void {
  __resetRuntime()
}
