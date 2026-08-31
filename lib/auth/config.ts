import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import type { AppClient } from '../../db/client'
import { authAccounts, authSessions, authVerifications, users } from '../../db/schema/index'
import { assertSignInAllowed, onFirstSignIn } from './on-first-sign-in'
import { newId, now } from '../runtime/index'

/**
 * The env shape every route handler and `createAuth` read from
 * (contracts/data-layer.md, research.md R2/R4). Mirrors `.dev.vars.example`.
 * Defined here (not in `app/api/_lib/runtime.ts`) because it is fundamentally
 * an auth-configuration shape; the route-handler runtime seam imports it from
 * here instead of the other way around.
 */
export interface AppEnv {
  readonly GOOGLE_CLIENT_ID: string
  readonly GOOGLE_CLIENT_SECRET: string
  readonly BETTER_AUTH_SECRET: string
  /** From the Wrangler env/secret; `null` when unset (research.md R4). */
  readonly OWNER_EMAIL: string | null
}

/**
 * The Better Auth instance (T016, research.md R1/R2).
 *
 * Google is the **only** provider — no `emailAndPassword`, no other social
 * provider, no passkeys or magic links (spec FR-001, research.md R2). The
 * Drizzle adapter maps Better Auth's `user`/`session`/`account`/`verification`
 * models onto the existing `users` table and the `auth_`-prefixed identity
 * plane (data-model.md); nothing outside `lib/auth/` imports Better Auth.
 *
 * `transaction: false` because D1 has no interactive transactions (R9a) — the
 * adapter runs its own multi-statement operations sequentially rather than
 * wrapping them in a callback transaction, matching this project's
 * `atomically` discipline.
 */
export function createAuth(client: AppClient, env: AppEnv) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(client.db, {
      provider: 'sqlite',
      transaction: false,
      schema: {
        users,
        auth_sessions: authSessions,
        auth_accounts: authAccounts,
        auth_verifications: authVerifications,
      },
    }),
    user: { modelName: 'users' },
    session: { modelName: 'auth_sessions' },
    account: { modelName: 'auth_accounts' },
    verification: { modelName: 'auth_verifications' },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    databaseHooks: {
      account: {
        create: {
          /**
           * Sign-in is the only Google use — no Google API is ever called
           * again after the profile exchange, so no bearer credential is
           * retained (spec FR-001). No offline access is requested either
           * (research.md R2), so Google issues no refresh token in the
           * first place; this hook is what guarantees the columns hold
           * NULL even so.
           */
          before: async (account) => ({
            data: {
              ...account,
              accessToken: null,
              refreshToken: null,
              idToken: null,
            },
          }),
        },
      },
      user: {
        create: {
          /**
           * Runs before every new user is persisted (T028, research.md R4):
           * refuses the sign-in outright — nothing written, not even the
           * user row — while an unclaimed migrated household exists and no
           * owner is configured. Inert otherwise.
           */
          before: async () => {
            await assertSignInAllowed(client, env.OWNER_EMAIL)
          },
          /**
           * Fires after Better Auth persists the new `users` row (T020,
           * research.md R4). Ids and the timestamp are captured here, at the
           * boundary, and passed in explicitly — `lib/data/` stays
           * clock-free and id-free (research.md R5).
           */
          after: async (user) => {
            await onFirstSignIn(client, {
              userId: user.id,
              email: user.email,
              emailVerified: user.emailVerified,
              ownerEmail: env.OWNER_EMAIL,
              ids: { householdId: newId(), membershipId: newId(), auditId: newId() },
              at: now(),
            })
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
