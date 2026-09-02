'use client'

import { createAuthClient } from 'better-auth/react'

/**
 * The browser-side Better Auth client. Same origin, so no `baseURL`; it
 * talks to the mounted handler at `/api/auth/[...all]`.
 *
 * Google is the only provider (spec FR-001). Nothing here may grow a
 * second sign-in method.
 */
export const authClient = createAuthClient()
