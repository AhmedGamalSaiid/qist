# Design handoff 02 of 02 — App shell + Home

**To**: Claude Design (owner-supplied visual design)
**From**: the headless application built in Feature 004

This is **prompt 2 of 2**, run with the **Emotex Design System** attached.
The product is **Qist**; its mark was promoted into the system in handoff 01.
**Prerequisite: handoff 01** audited Emotex against the application's
requirements and extended it — the editable-vs-read-only grammar, the installment
status treatments, the staleness treatment, the "not recorded" treatment,
≥44px touch targets, tabular numerals and RTL mirroring — then applied it to
the sign-in screen.

**Apply that system. Do not reinvent it.** Where this document needs a treatment
that already exists — staleness, "not recorded", read-only, stated-vs-derived,
superseded, status — reference the Emotex token or component handoff 01 settled,
rather than inventing a second one. If handoff 01 left the palette question open,
it is still open: flag it, do not resolve it in a mockup.

This document is **not a design**. It is the complete list of *data, states and
constraints* Home must account for. Layout, composition and hierarchy are yours.

---

## 1. Why Home is the screen that matters

Everything the application can currently do is reachable through four endpoints:

| Endpoint | What it gives | Built |
|---|---|---|
| `GET /api/auth/*` (Google only) | sign in, session, sign out | ✅ |
| `GET /api/state` | the household's entire financial state in one read | ✅ |
| `GET/POST/PATCH /api/cards` | list, create, update credit cards | ✅ |
| `POST /api/corrections/card-consolidation` | the one-time D7 correction (owner/admin) | ⏳ in progress |

Home is fed **entirely** by `GET /api/state` — one request, no pagination. It
needs no new backend work. Cards is the natural next screen after this one
(it is the only write surface that exists, so it is where the editability
grammar gets proven), but it is **not** part of this handoff.

**Perceived speed is constitutional here:** initial state arrives in one
aggregated read; revisits render from cache **before** any network call.

---

## 2. The app shell

Home is the first screen that shows it, so it is decided here.

- **Bottom bar** as primary navigation, ≥44px targets, fully mirrored in RTL.
- **Header**, carrying the Qist mark in the small form handoff 01 settled. The
  layout mirrors under RTL; **the mark does not flip**.
- Deciding **what the bar contains** is in scope. Designing the destinations
  behind it is not — see §7.

---

## 3. The data Home receives

One request returns all of this.

```jsonc
{
  "householdId": "…", "timezone": "Africa/Cairo", "today": "2026-08-27",
  "role": "owner",                      // owner | admin | member | viewer
  "accounts":       [ { id, name, kind, assetClass, isInvestment,
                        quantityMinor, balanceMode, openingQuantityMinor, openingDate } ],
  "propertyHoldings":[ { id, name, paidToDateMinor } ],
  "liabilities":    [ { id, name, amountMinor, reversesId, cardId } ],
  "installments":   [ { id, planName, dueOn, amountMinor, paidAt } ],
  "transactions":   [ { id, occurredOn, kind, amountMinor, currency, rateId, reversesId, egpMinor } ],
  "rates":          [ { id, assetClass, rateMinor, asOf, source } ],
  "snapshots":      [ { id, takenOn, liquidMinor, investmentsMinor, propertyPaidMinor,
                        shortTermLiabilitiesMinor, remainingInstallmentsMinor,
                        netWorthExclInstallmentsMinor, netWorthInclInstallmentsMinor, source } ],
  "cards":          [ { id, name, limitMinor, statementDay, dueDay, sortOrder, balanceMinor } ],
  "cardPayments":   [ … ],              // genuinely empty today
  "derived": {
    "totalHoldings":      { EGP|USD|GOLD|SILVER: { nativeMinor, egpMinor, converted } },
    "investmentHoldings": { …same shape… },
    "liquidTotal":  0, "shortTermLiabilities": 0, "totalOfAll": 0, "investmentTotal": 0,
    "netWorth": { totalAssets, shortTermLiabilities, remainingInstallments,
                  totalLiabilities, excludingInstallments, includingInstallments },
    "installmentSummary": { totalScheduled, totalPaid, totalRemaining,
                            nextDueOn, nextAmountDue, due3m, due6m, due12m, overdue },
    "unpaidByYear": [ { year, amountMinor } ],       // 21 fixed years, 2025–2045
    "assetMix":     [ { label, sheetRef, egpMinor, conversions } ],
    "monthlyRollup":[ { month, incomeMinor, expenseMinor, netMinor, savingsRate } ],
    "cardBalances": [ { cardId, balanceMinor } ]
  }
}
```

**Every monetary value is integer minor units (piastres).** `38977439` means
`389,774.39 EGP`. Minor units are never shown raw.

### Two rules that constrain labelling, not layout

1. **Neither net-worth figure may be labelled "net worth" unqualified.**
   `excludingInstallments` omits all future property installments;
   `includingInstallments` charges every one of them against today's assets.
   Both must be shown as distinctly named values, and any figure that omits
   committed future obligations **must say so where it is shown**. This is a
   settled decision — the spreadsheet's habit of showing one unqualified number
   caused a real misreading of this household's position.
2. **An account's balance mode must be visible wherever its balance is shown.**
   `stated` (someone typed it) vs `derived` (computed from movements). All 17
   accounts are `stated` today. "67,000" means something different under each.

---

## 4. Real data to design against

Do not invent numbers. This is the actual migrated household on 2026-08-27.

**Headline figures**

| Figure | Value |
|---|---|
| Net worth, excluding future installments | 389,774.39 EGP |
| Net worth, after all future installments | **−7,824,830.81 EGP** |
| Total assets | 469,883.39 EGP |
| Liquid (EGP equivalent) | 189,824.20 EGP |
| Investments (in EGP) | 280,059.19 EGP |
| Short-term liabilities | 80,109.00 EGP → **80,709.00** after the D7 correction |
| Remaining property installments | 8,214,605.20 EGP |
| Total liabilities | 8,294,714.20 EGP |
| Next installment due | 2026-09-15, 14,752.80 EGP |

**Rates** — USD 50.2554 · gold 7,500/g · silver 102/g, all `asOf 2026-08-17`,
which is **10 days old and therefore STALE** (threshold: 7 days).

**Cards (4)** — `ADIB CC`, `HSBC CC`, `CASHBACK CC`, `Valu CC`.
Every one has `limitMinor: null`, `statementDay: null`, `dueDay: null` — the
spreadsheet never recorded them, and the system refuses to invent them.
Balances after the D7 correction: ADIB **600.00**, the other three **0.00**.

**Liabilities (7)** — `فرش` 60,000.00 · `CASHBACK` 10,109.00 ·
`storia share` 10,000.00 · `NOOR` 0.00 · `storia mine` 0.00 ·
`CC ADIB` 0.00 · `CC HSBC` 0.00.

**Accounts (17)** — `HSBC EGP` 67,000.00 is the only non-zero EGP account;
`HSBC USD` 2,444.00 USD; investments `Thndr` 33,000.00 EGP, `SABIKA` 22.5 g
gold, `SILVER` 750 g, `Binance` 36.00 USD. **Ten accounts sit at exactly zero.**

**Volumes** — 56 installments · 3 property holdings · **1 transaction** ·
1 snapshot · 3 rates.

Two consequences worth designing for: the transactions section is effectively
**empty** in real life, and `monthlyRollup.savingsRate` is **`null` in almost
every month** — it is null whenever income is zero, and must not render as 0%.

---

## 5. Home — the case matrix

Every case below is real and reachable. Each needs an answer; two cases sharing
one treatment is a legitimate answer, stated explicitly.

### Session
- **B1** Signed in, session valid.
- **B2** Session expires while the screen is open → the next read returns 401 →
  the user lands back at sign-in. Anything cached must not keep showing.
- **B3** Signed in but the account holds **no household membership** — safe,
  diagnosable, discloses nothing, no partial state.
- **B4** Signed in with **more than one** household membership. Membership
  management is deferred, so this is not yet reachable in practice, but every
  operation acts on exactly one unambiguous household — never a merged view.
  The screen must not silently pick one without saying so.

### Household content
- **B5 Brand-new household, completely empty.** Zero accounts, cards,
  installments, transactions, rates, snapshots. Every derived figure is `0`,
  `nextDueOn` is `null`, `unpaidByYear` is still 21 rows of zero, `assetMix`
  rows all zero. A new user must reach this state in under a minute. **This is
  the first thing most new users ever see** — it carries more weight than the
  fully-populated state.
- **B6 The migrated household, before the D7 correction** — §4's numbers.
- **B7 The migrated household, after the D7 correction** — short-term
  liabilities 80,709.00, both net-worth figures 600.00 lower, one ADIB card at
  600.00. Nothing else moves.
- **B8 Partially populated** — some sections real, others empty. Today's data is
  already exactly this: 56 installments but 1 transaction.

### Role (`role` in the payload)
- **B9 owner / admin** — everything, including the D7 correction action.
- **B10 member** — may write cards; the correction is refused.
- **B11 viewer** — read-only. **No write affordance may be shown at all** — not
  a disabled one that fails on tap.

### Data quality that must stay visible
- **B12 Rate age.** Three states: fresh (`0d`), dated (`≤7d`), **stale (`>7d`)**.
  The current data is stale at 10 days. Every converted figure must be able to
  carry its rate's age — **a stale rate must never be able to pass as current.**
- **B13 Balance mode** — `stated` vs `derived`, beside every balance.
- **B14 Corrected rows.** The payload **includes** liability rows that have been
  reversed, flagged via `reversesId`. A superseded row and a live row must be
  distinguishable. After D7 the household contains both the original `CC ADIB`
  0.00 row and the correcting 600.00 row; only the latter counts.
- **B15 Recorded-as-absent vs zero.** The imported snapshot's
  `netWorthInclInstallmentsMinor` is **`null`** — never recorded, not
  recoverable, and emphatically not zero. `savingsRate` is `null` for any month
  with no income. `limitMinor`/`statementDay`/`dueDay` are `null` on all four
  cards. **"Not recorded" and "zero" must never look the same.**
- **B16 Missing rate.** A conversion with no rate on or before its date is an
  **error, never a zero** — the read fails loudly rather than quietly
  under-reporting. Home needs a state for "this household's figures cannot
  currently be computed".

### Language & direction
- **B17** English, LTR.
- **B18** Arabic, RTL — full mirror including the bottom bar and any chart legend.
- **B19** Mixed direction — `فرش` inside an English list, and Latin account
  names (`HSBC EGP`, `Thndr`, `SABIKA`) inside an Arabic one.
- **B20** Latin digits and `mm/dd/yyyy` in both languages, always.

### Network & speed
- **B21** Cold load — before the aggregated read returns.
- **B22** Cached revisit — renders from cache first, then reconciles.
- **B23** Read fails, cache present — stale data must be marked as stale.
- **B24** Read fails, no cache.

### Scale & overflow
- **B25** `−7,824,830.81 EGP` — a 13-character negative number, on a phone, in
  both directions, without truncating or wrapping into nonsense.
- **B26** 56 installments and 21 fixed year-buckets (2025–2045, most of them zero).
- **B27** Long or mixed-script names in narrow rows.
- **B28** Ten accounts at exactly zero — a full list that is mostly nothing.

---

## 6. The three that decide whether this holds up

If anything gets less attention, it must not be these:

- **B5** the empty household — what most new users see first, and the state most
  often skipped in design.
- **B12** the stale-rate treatment — the whole point of showing rate age is that
  a stale figure cannot masquerade as a current one.
- **B15** `null` vs zero — rendering "never recorded" as `0` states a falsehood
  about the household's money.

---

## 7. Out of scope

These need endpoints that do not exist yet. Do not design screens that imply
them: logging a transaction, marking an installment paid, editing an account
balance or liability, property paid-to-date, snapshots, card payments, income
settings, inviting household members, changing roles, deleting or archiving a
card, refreshing a rate on demand.

The bottom bar will eventually need destinations for these. Deciding what the
bar contains is in scope; designing those destinations is not.

---

## 8. What comes back

1. **The app shell** — bottom bar and header, in both directions.
2. **Home**, covering B1–B28, in EN and AR.
3. **States as first-class artboards, not annotations** — empty, loading,
   cached, error, viewer-role, Arabic.
4. Any **additions to the Emotex system** that Home forced, called out
   explicitly so Emotex, handoff 01's extensions and the implementation stay in
   sync.
