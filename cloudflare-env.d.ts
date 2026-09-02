export {}

/**
 * The Worker's bindings, declared on `wrangler.jsonc` (local dev/CI only —
 * research.md R10) and read through `@opennextjs/cloudflare`'s
 * `getCloudflareContext()`. `DB` is typed `unknown` here, matching
 * `db/client-d1.ts`'s own `createD1Client(binding: unknown)` — the D1 typing
 * package is not a dependency this feature adds (bundle budget, R10).
 */
declare global {
  interface CloudflareEnv {
    DB: unknown
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    BETTER_AUTH_SECRET: string
    OWNER_EMAIL?: string
  }
}
