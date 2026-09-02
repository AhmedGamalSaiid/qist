/**
 * The whole schema, in one place for Drizzle Kit.
 *
 * Every domain table carries `household_id NOT NULL` with an index and a
 * `UNIQUE(household_id, id)` key, and every cross-table foreign key is
 * composite `(household_id, id)` against that key (T028). Scoped reads alone
 * would not stop a transaction in household A referencing an account in
 * household B; Principle IX is structural, so the structure carries it.
 */
export * from './tenancy'
export * from './holdings'
export * from './ledger'
export * from './rates'
export * from './history'
export * from './audit'
export * from './auth'
