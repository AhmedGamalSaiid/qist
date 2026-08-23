# Quickstart & Validation: Income Sheet Companion

How to get the app running against the real sheet and prove it works. Steps
marked 👤 need the owner's Google account — Claude Code cannot perform them.

## Prerequisites

- Node.js ≥ 18 and `npm i -g @google/clasp`
- Owner access to the sheet (`1Qly9tW7HHAIuHFbxxqgdwrfaYw1-H2QWlKo_RkEDTzc`)
- Google Apps Script API enabled at <https://script.google.com/home/usersettings> 👤

## Setup (once)

1. 👤 Follow `clasp-setup.md`: get the scriptId (sheet → Extensions → Apps
   Script → Project Settings → Script ID), run `clasp login`.
2. 👤 **Pull before any push** — `clasp clone <scriptId> --rootDir appsscript`
   (or write `.clasp.json` and `clasp pull`). Confirm the existing beautifier
   `Code.gs` now exists in `appsscript/`. It is committed and never edited;
   pushing without it locally would delete it remotely (research R1).
3. Development adds `api.gs`, `index.html`, `styles.html`, `i18n-js.html`,
   `app-js.html` beside it.

## Deploy loop

1. 👤 `clasp push`
2. 👤 First time: Apps Script editor → Deploy → New deployment → Web app →
   Execute as **Me**, Who has access **Only myself** → copy the `/exec` URL.
   Updates: Deploy → Manage deployments → edit → New version (URL stable).
   Full detail + Add-to-Home-Screen (Android/iOS): `DEPLOY.md`.
3. 👤 Open the `/exec` URL on the phone.

## Validation scenarios

Run after each deploy; full matrix in `TEST-CHECKLIST.md`. Each maps to spec
success criteria (SC-*).

| # | Scenario | Steps | Expected | SC |
|---|---|---|---|---|
| V1 | Cold load, one RPC | Open /exec in a fresh tab; watch network/execution log | All Home figures match Dashboard tab; exactly one `getState` execution; data visible ≤ 4 s | SC-007 |
| V2 | Cached revisit | Reload the tab (same session) | Figures render ≤ 1 s before any RPC completes; net worth + next installment visible ≤ 2 s | SC-001 |
| V3 | Log expense | Home → Add (1 tap) → category chip → amount → submit | ≤ 10 s, ≤ 3 taps + digits; row lands in first empty Transactions row, real Date in A, number in E, G computed by sheet, monthly summary updates | SC-002 |
| V4 | Rollback | Airplane mode → submit a transaction | Optimistic entry appears, then rolls back with error toast; sheet unchanged; cache does not retain it | SC-002/FR-016 |
| V5 | Mark installment paid | Installments → tap unpaid row → confirm | Exactly 2 taps; `E{row}`="Yes"; colors/groups re-render; dashboard slice reconciles | SC-003, SC-006 |
| V6 | Status parity | Compare app colors vs. sheet conditional formatting, same day | 100% of 56 rows match (green/red/amber/neutral) | SC-006 |
| V7 | Rate update | Rates → change USD → save | `B2` new value, `C2` = today (auto); after refresh every EGP figure in app == sheet | SC-004 |
| V8 | Allowlist negative | 👤 In editor, run temporary `test_allowlistRejections()` (attempts writes to `Dashboard!A3`, `Transactions!G2`, a header, `History!A2`) | Every attempt throws `RANGE_DENIED`; sheet unchanged; delete the test function afterwards | SC-005 |
| V9 | Account/liability/property edits | Edit one of each; add one account | Only the intended cell(s) change; new account row after last real account; appears in Add form after refresh | SC-005, US5 |
| V10 | Arabic RTL | Settings → عربي → walk all 10 screens | Full RTL mirror incl. nav/forms/tables/chart legends; Latin digits `#,##0`; `mm/dd/yyyy`; "فرش" renders isolated; preference survives new session | SC-008 |
| V11 | Snapshot | History → Take snapshot → confirm | One new static row after last snapshot; new chart point; double-tap creates no duplicate | SC-009 |
| V12 | Editable = yellow audit | Walk all screens in both languages | Every editable control yellow-tinted; zero read-only figures tinted | SC-010 |
| V13 | Sheet standalone | Close the app; use the sheet directly (edit cells, existing snapshot menu) | Everything works as before the app existed | SC-011 |

## References

- Payload & entities: [data-model.md](data-model.md)
- RPC surface & errors: [contracts/rpc-contract.md](contracts/rpc-contract.md)
- Writable ranges: [contracts/write-allowlist.md](contracts/write-allowlist.md)
- Decisions & gotchas: [research.md](research.md)
