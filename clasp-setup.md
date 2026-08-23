# clasp Setup (owner-only, one time)

This repo is pushed to the Google Apps Script project that is **bound** to
the Income Sheet Companion Google Sheet
(`1Qly9tW7HHAIuHFbxxqgdwrfaYw1-H2QWlKo_RkEDTzc`). Claude Code cannot reach
your Google account, so every step below is performed by you.

## ⚠️ Read this before running `clasp push`

The bound project already contains a file, `Code.gs` (the number
beautifier), that was written directly in the Apps Script online editor. It
does **not** exist in this repo yet. `clasp push` mirrors your local
`appsscript/` folder onto the remote project **and deletes any remote file
that has no local counterpart**. If you push before pulling, `Code.gs` is
permanently deleted from the bound project.

**The rule: pull first, always, before the first push. Never edit
`Code.gs` afterward — it is committed to this repo read-only.**

## 1. Enable the Apps Script API

Visit <https://script.google.com/home/usersettings> and turn on the Apps
Script API for your account (one-time, needed for `clasp` to work at all).

## 2. Install and log in to clasp

```sh
npm i -g @google/clasp
clasp login
```

This opens a browser window to authorize clasp against your Google account.

## 3. Find the Script ID

1. Open the sheet: <https://docs.google.com/spreadsheets/d/1Qly9tW7HHAIuHFbxxqgdwrfaYw1-H2QWlKo_RkEDTzc>
2. **Extensions → Apps Script**. This opens the bound project.
3. **Project Settings** (gear icon, left sidebar) → copy the **Script ID**.

## 4. Pull the existing project into this repo — BEFORE any push

From the repo root:

```sh
clasp clone <SCRIPT_ID> --rootDir appsscript
```

If `appsscript/` already has files in it (from this repo's own commits) and
`clasp clone` refuses to run, use the pull form instead:

1. Edit `.clasp.json` at the repo root and put your real Script ID in place
   of `<SCRIPT_ID>`.
2. Run:

   ```sh
   clasp pull
   ```

Either way, confirm afterward that `appsscript/Code.gs` and
`appsscript/appsscript.json` now exist locally and match what you see in the
online editor. Commit them.

## 5. Verify the manifest

`appsscript/appsscript.json` is pulled from the remote project, so the
remote version wins on any conflict with what this repo ships. After
pulling, open it and confirm it has:

- `"runtimeVersion": "V8"`
- a `timeZone` matching your locale
- a `"webapp"` block with `"executeAs": "USER_DEPLOYING"` and
  `"access": "MYSELF"`

If any of these differ, edit the file to match before your first
`clasp push` — see `DEPLOY.md` for the deployment step itself.

## 6. Day-to-day workflow

- Never run `clasp push` without first confirming `Code.gs` is present
  locally (it will be, once committed — this warning is for anyone cloning
  this repo fresh without following step 4 first).
- Never edit `appsscript/Code.gs` — it is the owner's existing beautifier,
  pulled and preserved as-is.
- All new app code lives beside it: `api.gs`, `index.html`, `styles.html`,
  `i18n-js.html`, `app-js.html`.

Next: `DEPLOY.md` for pushing and deploying the web app.
