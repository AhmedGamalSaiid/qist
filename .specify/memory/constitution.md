<!--
Sync Impact Report
==================
Version change: (template) → 1.0.0
Modified principles: n/a (initial ratification)
Added sections:
  - Core Principles (8): I. Sheet Is the Single Source of Truth;
    II. Formula Safety Is Absolute; III. No External Backend;
    IV. Phone-First UX; V. Bilingual EN/AR With Real RTL;
    VI. Perceived Speed Over Actual Speed;
    VII. Visual Continuity With the Sheet; VIII. Honest Scope
  - Technology & Deployment Constraints
  - Development Workflow & Quality Gates
  - Governance
Removed sections: none (all template placeholders filled)
Templates status:
  - .specify/templates/plan-template.md ✅ compatible (Constitution Check gate is
    dynamic; plans must gate against Principles I–VIII, especially II and III)
  - .specify/templates/spec-template.md ✅ compatible (no mandatory-section changes)
  - .specify/templates/tasks-template.md ✅ compatible (task phases map cleanly to
    allowlist config, i18n dictionary, and cache-layer tasks)
  - .specify/templates/checklist-template.md ✅ compatible
Follow-up TODOs: none
-->

# Income Sheet Companion Constitution

## Core Principles

### I. Sheet Is the Single Source of Truth

The Google Sheet with ID `1Qly9tW7HHAIuHFbxxqgdwrfaYw1-H2QWlKo_RkEDTzc` is the
only canonical data store. The app MUST NOT persist canonical data anywhere
else: no databases, no server-side storage beyond the sheet, and no
localStorage as a source of record. Client-side storage is permitted only as a
session cache (sessionStorage) that can be discarded at any time without data
loss. The sheet MUST remain fully usable on its own — every workflow the sheet
supports today keeps working if the app is deleted; the app is strictly
additive.

**Rationale**: The sheet already works. Duplicating state creates sync bugs and
silently demotes the sheet from source of truth to stale mirror.

### II. Formula Safety Is Absolute

The app writes ONLY to an explicit server-side allowlist of input ranges,
defined in exactly one config object in the Apps Script backend. Every write
RPC MUST validate its target range against that allowlist before touching the
sheet and MUST reject any target outside it. Formulas, computed cells, and
header rows are never overwritten under any circumstance. Reads are
unrestricted. No client-supplied range may bypass server-side validation —
the client is never trusted to know what is writable.

**Rationale**: One overwritten formula can silently corrupt every derived
number in the sheet. A single server-side allowlist is auditable; scattered
per-endpoint checks are not.

### III. No External Backend

The backend is a Google Apps Script project bound to the sheet, deployed as a
Web App with "Execute as: me" and "Who has access: only myself". No
third-party servers, no analytics, no telemetry, and no secrets in client
code. The only permitted CDN is `cdnjs.cloudflare.com` (for Chart.js); every
other asset MUST be served inline from the Apps Script deployment.

**Rationale**: Personal financial data stays inside the owner's Google
account. Every external dependency is an attack surface and an availability
risk the app does not need.

### IV. Phone-First UX

Every daily action — add a transaction, mark an installment paid, update a
rate — MUST complete in 3 taps or fewer from the home screen. Touch targets
MUST be ≥ 44px. Primary navigation is a bottom bar. Desktop is a responsive
enlargement of the phone layout, not a separate design; no feature may exist
only on desktop.

**Rationale**: Daily finance entries happen on a phone in the moment. Any
friction above three taps means entries get skipped and the sheet goes stale.

### V. Bilingual EN/AR With Real RTL

All UI strings live in one i18n dictionary with English and Arabic
translations; no string may be hard-coded in markup or script. Switching to
Arabic MUST flip the layout to `dir="rtl"` properly — navigation, forms,
tables, and chart legends all mirror. Numbers remain Latin digits formatted
`#,##0` and dates remain `mm/dd/yyyy` in both languages. Mixed-direction
content (Arabic account names such as "فرش" inside English UI, and vice
versa) MUST render correctly using unicode-bidi isolation.

**Rationale**: Half-done RTL (translated strings in an LTR shell) is worse
than English-only. Keeping digits and dates format-stable preserves 1:1 visual
correspondence with the sheet.

### VI. Perceived Speed Over Actual Speed

Apps Script calls cost 1–3 seconds, so the architecture MUST compensate: one
aggregated read RPC returns the entire app state as a single JSON payload;
the client caches that payload in sessionStorage and renders instantly on
revisit; writes are optimistic — the UI updates immediately, then rolls back
with an error toast if the RPC fails; a manual pull-to-refresh / refresh
button re-fetches the full state. Chained or per-widget RPCs on load are
prohibited.

**Rationale**: The latency floor cannot be lowered, but it can be hidden.
One round-trip plus instant cached render makes a 3-second backend feel
immediate.

### VII. Visual Continuity With the Sheet

The app uses the sheet's own visual language: navy `#1F3864` for headers and
navigation, blue `#2E75B6` for accents, and yellow `#FFF2CC` marking every
editable field (the sheet's yellow-cell convention). Installment status uses
green `#E2EFDA` (paid), amber `#FFF3CD` (due), and red `#FCE4E4` (overdue).
Read-only values MUST be visually distinct from editable ones everywhere in
the app.

**Rationale**: The owner already reads the sheet fluently. Reusing its color
grammar means zero relearning and makes "what can I edit here?" answerable at
a glance — reinforcing Principle II in the UI.

### VIII. Honest Scope

No service worker and no offline mode — Apps Script cannot serve a service
worker, and the app MUST NOT approximate a fake PWA. Instead, provide an
"Add to Home Screen" shortcut experience. The README MUST state this
limitation plainly rather than papering over it.

**Rationale**: A half-working offline mode that silently drops writes is a
data-integrity hazard for a finance app. Stating the limitation honestly
beats faking the capability.

## Technology & Deployment Constraints

- **Backend**: Google Apps Script, container-bound to the sheet; deployed as a
  Web App ("Execute as: me", "Who has access: only myself").
- **Frontend**: HTML/CSS/JavaScript served by the Apps Script deployment
  (`HtmlService`), single-page. Charts via Chart.js from
  `cdnjs.cloudflare.com` — the sole permitted external origin.
- **Data access**: `google.script.run` RPCs only. One aggregated read endpoint;
  write endpoints validate against the single allowlist config object
  (Principle II).
- **State**: sessionStorage cache of the last full payload; no other
  client-side persistence of canonical data (Principle I).
- **Secrets**: none in client code; the deployment model requires none.

## Development Workflow & Quality Gates

- **Constitution Check**: every `/speckit-plan` MUST gate its design against
  Principles I–VIII and record violations in Complexity Tracking. Principles I,
  II, and III admit no justified violations.
- **Write-path review**: any change touching a write RPC or the allowlist
  config MUST list exactly which ranges become writable and why; expanding the
  allowlist is a reviewed, deliberate act, never a side effect.
- **Sheet-safety verification**: before release, verify that write RPCs reject
  a non-allowlisted range and that no formula, computed cell, or header can be
  reached by any code path.
- **UX gates**: each daily action demonstrably completes in ≤ 3 taps; both
  `dir="ltr"` and `dir="rtl"` layouts are checked for every new screen.
- **Perceived-speed gates**: cold load performs one read RPC; revisit renders
  from cache before any network call; failed optimistic writes visibly roll
  back with a toast.

## Governance

This constitution supersedes all other development practices for Income Sheet
Companion. All specs, plans, tasks, and code reviews MUST verify compliance
with it; conflicts resolve in favor of the lower-numbered principle (they are
in priority order).

**Amendments**: an amendment is a documented edit to this file that states
what changed and why, bumps the version, and updates dependent templates in
the same change.

**Versioning**: semantic versioning — MAJOR for removing or redefining a
principle in a backward-incompatible way, MINOR for adding a principle or
materially expanding guidance, PATCH for clarifications and wording fixes.

**Compliance review**: the Constitution Check gate in the plan template is the
enforcement point; any violation must appear in Complexity Tracking with a
justification, and Principles I–III may not be waived.

**Version**: 1.0.0 | **Ratified**: 2026-08-17 | **Last Amended**: 2026-08-17
