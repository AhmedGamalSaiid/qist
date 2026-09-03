# Qist — Project Design Context Brief

**For**: the designer / design tool starting screen work
**Purpose**: functional truth only. You own every visual decision — this document
contains no colours, spacing, type, or component names, and does not want any.
Where the project plan is silent, this says **"not in plan"** rather than guessing.
Treat "not in plan" as a real answer: do not design around it, and do not invent it.

---

## 1. Product summary

Qist is a private personal-finance application for a household's money: what it
holds, what it owes, and what it has already committed to pay years into the
future. It is built for the Egyptian market — everything settles in Egyptian
pounds, with US dollar, gold and silver holdings converted to EGP at a rate that
carries a date and can be out of date. It ships in English and Egyptian Arabic,
with a genuine right-to-left layout in Arabic rather than translated strings in a
left-to-right shell. It is phone-first and multi-user: each person signs in, sees
exactly one household's data and nothing else, and holds a role that decides
whether they may change anything at all.

---

## 2. Screen map (build-priority order)

1. **Sign in** — ① **DESIGN FIRST.** One action, no form. The screen the brand mark carries.
2. **App shell** (header + primary bottom navigation) — decided together with Home, not a destination of its own.
3. **Home** — ② **DESIGN SECOND.** The household's whole financial position in one screen.
4. **Cards — list** — the four credit cards of the household. The only surface in the product where anything can be written today.
5. **Cards — create / edit** — name plus three optional values. This is where the editable-vs-read-only grammar gets proven.
6. **The one-time ADIB/HSBC consolidation action** — an owner/admin-only correction, not a screen. Where it lives is **not in plan**.

Everything else is **not in plan** and must not be designed, or implied by an
affordance: logging a transaction, marking an installment paid, editing an
account balance or a liability, property paid-to-date, snapshots, card payments,
income settings, inviting household members, changing roles, deleting or
archiving a card, and refreshing a rate on demand. Deciding *what the bottom bar
contains* is in scope; designing the destinations behind it is not.

---

## 3. Sign in — functional spec

### Authentication methods

**Google account sign-in, and nothing else.** This is fixed, not a starting point.

Explicitly ruled out by the plan, all of them: email + password (the product
never stores a credential of any kind), phone number + OTP, any second social
provider, magic links, passkeys, and biometrics. None of these is a future
option to leave room for.

### Fields and validation

**There are no fields.** No email field, no password field, no phone field, no
"remember me", no captcha. The screen holds the brand mark and a single
sign-in action, and almost nothing else.

Consequently there are **no validation rules** — there is nothing on the screen
to validate. Every refusal below arrives after the round trip to Google, not
before it.

### Flows

- **Sign in.** The person triggers the single action, leaves the app for Google,
  and comes back. On success they land on Home.
- **Sign-up entry point.** There is **no separate sign-up flow, screen, or link**.
  First-time and returning people use the same single action. On a first-ever
  sign-in the household is created behind the scenes and the person arrives at an
  empty Home — the target is under a minute, with nothing for them to fill in.
- **Password / account recovery.** **Not in plan.** No password exists anywhere
  in the product, so there is no forgot-password, no reset, no recovery, and no
  "trouble signing in?" path. If designing this screen creates an urge to add
  one, that urge is out of scope.
- **Sign out.** The capability exists and ends the session on the server
  immediately. **Where the sign-out control lives is not in plan** — the app
  shell work decides it. Afterwards the person returns to this screen in state A5.

### Every state and refusal this screen can be in

| | State | What must be conveyed |
|---|---|---|
| **A1** | Ready | The Qist mark and the single Google sign-in action. There is almost nothing else on this screen. |
| **A2** | Redirecting | The hop is leaving the app. |
| **A3** | Returned unauthenticated | The attempt produced no session. **Nothing about why.** |
| **A4** | Fail-closed refusal | This deployment's owner account has not been configured yet. Sign-in is refused and **nothing at all is created** — no account, no household, no session. Needs an operator-facing explanation, not a generic error. |
| **A5** | Signed out | Returning here after signing out. The session is already dead on the server. |

**A hard constraint on A3.** An expired session, a session that was revoked, and
never having signed in at all are **indistinguishable by design**. The screen must
not try to tell them apart and must not hint at which one happened. This is
deliberate, not an omission to be helpfully filled in.

**A4 — approved copy, use it verbatim.** It is long on purpose; lay it out as
real content, not as a one-line error.

> **Sign-in is closed until an owner is set**
>
> This deployment holds a household migrated from the spreadsheet, and no owner
> has been designated for it. Signing in now would create a second, empty
> household competing with it — so nothing was created: no account, no
> household, no session.
>
> Set `OWNER_EMAIL` to the Google account that should own the migrated
> household, then sign in again. That account's first sign-in claims it.
> Everyone else who signs in gets their own fresh household, as normal.

Three things that copy is doing, so they survive editing: it states first that
nothing was written (the reader's first fear is a half-created account); it names
the actual fix, because the person reading this *is* the administrator; and it
says the refusal is deliberate, so the reader does not simply retry forever.

The Arabic version of this message must be **written by a native Egyptian Arabic
speaker, not translated** from the English.

Both directions are required: English LTR and Arabic RTL. The layout mirrors.
**The mark does not.**

---

## 4. Home — functional spec

Home is fed by **one single read** that returns the household's entire financial
state. There is no pagination and no second request.

### The data Home receives

**Context** — which household this is, the person's role in it (owner, admin,
member, or viewer), the household's timezone (Cairo), and today's date.

**Headline figures**

- **Two net-worth figures, never one.** One excludes all future property
  installments; the other charges every one of them against today's assets. They
  are 8,214,605.20 EGP apart in the real household — the second one is
  −7,824,830.81 EGP. **Neither may be labelled
  "net worth" unqualified**, and any figure that omits committed future
  obligations must say so where it is shown. This is settled: the old
  spreadsheet's single unqualified number caused a real misreading of this
  household's position.
- Total assets · liquid total (EGP equivalent) · investments total (EGP
  equivalent) · short-term liabilities · remaining property installments · total
  liabilities.

**Holdings breakdown** — total holdings and investment holdings, each split by
EGP, US dollars, gold and silver, each carrying its native amount, its EGP
equivalent, and whether it was converted. Plus a labelled asset-mix breakdown of
where the money actually sits.

**Installments summary** — total scheduled, total paid, total remaining, the next
due date and next amount due, amounts falling due within 3 / 6 / 12 months, and
anything overdue. Plus unpaid-by-year: **21 fixed year buckets, 2025–2045**, which
always exist even when most of them are zero.

**Monthly rollup** — per month: income, expense, net, and savings rate. The
savings rate is **absent, not 0%**, in almost every month — it has no value
whenever income is zero.

**Accounts** — 17 today. Each carries a name, what kind of account it is, its
asset class, whether it is an investment, its balance or quantity, and its
**balance mode**: *stated* (a person typed it) versus *derived* (computed from
movements). The balance mode must be visible wherever a balance is shown —
"67,000" means something materially different under each. Ten of the seventeen
accounts sit at exactly zero.

**Cards** — 4 today: ADIB CC, HSBC CC, CASHBACK CC, Valu CC. Each has a name and
a balance. Each also has a credit limit, a statement day and a due day — and on
**all four cards all three are unrecorded**. The spreadsheet never captured them
and the system refuses to invent them.

**Liabilities** — 7 named rows with amounts, including Arabic-named ones. Some
rows have been superseded by a correction and are still present alongside their
correction; a superseded row and a live one must be distinguishable, and only the
live one counts.

**Property holdings** — 3, each with an amount paid to date.

**Transactions** — effectively empty. There is exactly **one** in real life today.
Design for a section that is genuinely empty, not a populated feed.

**Rates** — 3: US dollar, gold per gram, silver per gram. Each carries an "as of"
date. Rate age is not a constant: it is computed client-side from the rate's
`asOf` against the payload's `today`, in whole Cairo days — fresh 0 / dated 1–7 /
stale 8+. The real rates were 16 days old, and therefore stale, on 2026-09-02.
Every converted figure must be able to carry the age of the rate behind it.
**A stale rate must never be able to pass as a current one.**

**Snapshots** — 1 historical snapshot, one of whose figures was **never recorded**
and is absent — emphatically not zero.

**Card payments** — genuinely empty.

### Primary actions

The plan gives Home deliberately few, because almost nothing is writable yet.

- Navigate to **Cards** — the only write surface that exists.
- **Owner and admin only:** apply the one-time ADIB/HSBC consolidation
  correction. Refused for member and viewer. **Where this action lives is not in
  plan.**
- **Sign out** — the capability exists; **its placement is not in plan**.
- **Language switch** — both languages are required, but **where the switch lives
  is not in plan**.
- Anything else listed as out of scope in §2 must not appear on Home, including
  as a disabled or "coming soon" affordance.

### Refresh nature of each piece

- **Live: nothing.** No figure on Home updates on its own. There is no polling,
  no streaming, no push, and no auto-refresh. Rates in particular do not refresh
  inside the app — the scheduled rate refresh is not in plan, and there is **no
  manual refresh control** either. Rate freshness is communicated, never fixed by
  the user.
- **Per-session / per-visit: everything else.** Every item in the list above —
  headline figures, holdings, installments, accounts, cards, liabilities,
  property, transactions, rates, snapshots — arrives together in the single read
  when the screen opens. On a revisit the screen renders **from cache first**, then
  reconciles against a fresh read. Perceived speed is a stated product
  requirement, so a blank screen waiting on the network is a failure state.
  A failed cold read with no cache is a page state with one retry action, with
  sign-out reachable. A failed reconcile keeps the cached screen and shows a
  page state. Neither is a toast.
- **Static: nothing is built into the app.** No card, name, balance, limit, or
  schedule is application-defined; all of it belongs to the household. The only
  fixed-shape element is the 21 year buckets, 2025–2045.
- **Optimistic writes** (relevant to Cards, not Home itself): a write updates the
  screen immediately, then **visibly rolls back with an error toast** if it fails.
  There is a "not yet confirmed" moment that needs an answer.

### States Home must account for

All of these are real and reachable. Two states sharing one treatment is a valid
answer, as long as it is a stated one.

**Session** — signed in and valid · the session expires while the screen is open,
the next read is refused, and the person lands back at sign-in with nothing cached
still showing · signed in but holding no household membership at all, which must
fail safely and disclose nothing · signed in with more than one membership, which
is not reachable yet but must never silently pick one without saying so.

**Household content** — **a brand-new, completely empty household**: no accounts,
cards, installments, transactions, rates or snapshots, every figure zero, no next
due date, the 21 year buckets still present and all zero. **This is the first
thing most new users ever see and it carries more weight than the fully populated
state.** · the migrated household before the correction · the same household after
it: accounts 17→15, liabilities 7→9, short-term liabilities +600.00, both
net-worth figures and the total of all −600.00, the ADIB card balance 600.00 ·
partially populated, which is today's reality: 56 installments against 1
transaction.

**Role** — owner/admin see everything including the correction action · member may
write cards but is refused the correction · **viewer is read-only and must be shown
no write affordance at all**, not even a disabled one that fails on tap.

**Data quality that must stay visible** — rate age in three degrees, fresh / dated
/ stale, currently stale · stated versus derived balances beside every balance ·
superseded rows next to their live correction · **"never recorded" versus zero,
which must never look the same** · and a household whose figures cannot be computed
at all because a conversion has no rate for its date — that is a loud error state,
never a quiet zero.

**Scale and overflow** — the 13-character figure −7,824,830.81 EGP on a phone in
both directions without truncating or wrapping into nonsense · 56 installments and
21 year buckets, most of them zero · long or mixed-script names in narrow rows ·
ten accounts at exactly zero, a full list that is mostly nothing.

**The three that decide whether this holds up**, if anything gets less attention:
the empty household; the stale-rate treatment; and "never recorded" versus zero.
Rendering a value that was never recorded as `0` states a falsehood about this
household's money.

---

## 5. Localization

### What is bilingual, and what is not

- **Every UI string is bilingual** — English and Egyptian Arabic, both
  first-class. Nothing is English-only.
- **Household data is not translated.** Account names, card names, liability
  names and plan names are the household's own text and appear exactly as
  entered, in whatever script they were entered in. Arabic names sit inside
  English screens; Latin names like `HSBC EGP`, `Thndr` and `SABIKA` sit inside
  Arabic ones. Both are normal, not edge cases.
- The operator refusal message in §3 needs an Arabic version **written**, not
  translated.

### Direction

- Arabic flips the **entire** layout: navigation, forms, tables, and chart
  legends all mirror. Half-done RTL — translated strings in a left-to-right
  shell — is worse than English-only.
- **The Qist mark does not mirror.** Everything around it moves; the mark itself
  does not flip. Whether an Arabic lockup is used or the Latin mark carries both
  languages is a decision the design system owns — but there must be an answer
  rather than a gap discovered mid-screen.

### Numbers, currency and dates

- **Latin digits in both languages, always.** Never Arabic-Indic digits, not even
  on a fully Arabic screen. This is fixed and non-negotiable — it preserves
  correspondence with the archived source and with the owner's own habits.
- **Grouping:** comma for thousands, dot for decimals. Money carries two
  decimals. Amounts are held internally in piastres and are **never shown raw**.
- **Currency:** EGP. In the plan's own English examples the code sits alongside
  the amount — `600.00 EGP`, `−7,824,830.81 EGP`. **Where the currency code sits
  on an Arabic screen is not in plan.**
- **Negatives** take a leading minus, and the full 13-character case must hold on
  a phone in both directions.
- **Non-EGP quantities** keep their own unit — dollars for USD, **grams** for gold
  and silver (22.5 g, 750 g) — shown alongside their EGP equivalent and the age of
  the rate used to convert.
- **Dates are `mm/dd/yyyy` in both languages**, always. The household's timezone
  is Cairo.
- Columns of figures must align down the column.

### The LTR-inside-RTL rule

**Digits, amounts and dates inside an Arabic screen stay left-to-right.** They
must be direction-isolated so they never reorder against the Arabic text around
them — an amount, a date, or a Latin account name embedded in an Arabic sentence
or table cell reads in its own direction while the surrounding layout stays
mirrored. The same isolation applies in reverse for Arabic text inside English
screens.

**Phone numbers: not in plan.** The product does not collect, store, or display a
phone number anywhere — there is no phone-based sign-in and no profile phone
field. If phone numbers ever arrive, the same isolation rule would apply, but
nothing in the current plan puts one on a screen.
