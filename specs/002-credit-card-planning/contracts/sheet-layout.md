# Sheet Contract: `CC Payments` tab

**Date**: 2026-08-26 | **Plan**: [../plan.md](../plan.md)

The sheet is an external interface: the owner reads and edits this tab
directly, without the app (FR-043), and the app picks up hand edits on the
next refresh (FR-045). This layout is therefore a contract; the setup
function, the readers, the allowlist and the owner's hand edits all depend
on it.

Created once by the editor-run `setupCreditCardPlanning()` in `planning.gs`
(idempotent; never touches rows holding data). Runtime code never creates or
restructures the tab; if it is absent, `getState()` reports
`creditCards.setup = false`.

## Layout

```
      A            B           C             D                E       F       G   H                I
1  Card         Due Date    Amount (EGP)  Statement Month  Paid    Note         [Settings]
2  ADIB CC      08/25/2026  1,000         08/2026          No      …            Salary Amount    2250
3  …                                                                            Salary Currency  USD
4  (input rows 2–500)                                                           Salary Day       27
5
6                                                                               Cards
7                                                                               ADIB CC
8                                                                               HSBC CC
9                                                                               CASHBACK CC
10                                                                              Valu CC
11–26                                                                           (blank card slots)
```

## Regions

| Region | Range | Role | Writable by app? |
|--------|-------|------|------------------|
| Payments header | `A1:F1` | column titles | never |
| Payments body | `A2:F500` | one payment per row; blank A = empty slot | yes — `addCcPayment`, `updateCcPayment`, `deleteCcPayment` (A–F), `setCcPaymentStatus` (E only) |
| Settings labels | `H2:H4` | `Salary Amount` / `Salary Currency` / `Salary Day` | never |
| Settings values | `I2:I4` | salary configuration | yes — `setSalary` |
| Cards header | `H6` | `Cards` | never |
| Card list | `H7:H26` | one card name per row; blank = free slot | never (adding a card is a hand edit) |

**No cell on this tab contains a formula** — FR-044 holds by construction.

## Formats & validation (applied by setup)

- `B2:B500` date `mm/dd/yyyy`, centered (A-011)
- `C2:C500` number `#,##0`, right-aligned
- `D2:D500` plain text (`@`) — `mm/yyyy`; blank ⇒ due-date month (FR-006)
- `E2:E500` data validation list `Yes`/`No` (reject invalid), centered
- `A2:A500` data validation `requireValueInRange(H7:H26)` (reject invalid) —
  a new card typed into H is instantly selectable
- `I3` data validation list `USD`/`EGP`; `I4` number 1–31
- Input styling: yellow `#FFF2CC` + bold blue on `A2:F500` and `I2:I4`
  (the sheet's "you edit this" convention, constitution VII)
- Conditional formatting on `A2:F500`, same rules and colours as
  Installments: `$E2="Yes"` green `#E2EFDA`; `$E2="No" AND $B2<TODAY()` red
  `#FCE4E4` bold; `$E2="No" AND $B2 between TODAY() and EDATE(TODAY(),3)`
  amber `#FFF3CD` bold (FR-009)
- Tab colour: `#C00000` family (obligation tab, like Installments)

## Conventions shared with the app

- **Empty row** = blank column A (the append scan and the readers use this;
  `getLastRow()` is meaningless on a pre-formatted tab).
- **Deleted payment** = all of A–F blanked; the slot is reused by the next
  append. Hand-deleting a row's contents in the sheet is equivalent.
- **Row 500 is the hard capacity** (499 payments). A full table yields
  `LOG_FULL` from `addCcPayment`.
- Hand edits follow the same column meanings; invalid hand-entered values
  (unknown card, bad date) are surfaced by the app as unreadable rows on
  refresh, never silently dropped — the reader skips only blank-A rows.
