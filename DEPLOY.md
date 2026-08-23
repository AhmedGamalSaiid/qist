# Deploying Income Sheet Companion

Everything here happens in **your** Google account. Do `clasp-setup.md` first —
in particular the pull that puts the existing `Code.gs` beautifier into
`appsscript/`. Pushing without it deletes the beautifier from the cloud
project.

---

## 1. Push the code

From the repository root:

```bash
clasp push
```

Expected output lists the files that were pushed:

```
└─ appsscript/appsscript.json
└─ appsscript/Code.gs
└─ appsscript/api.gs
└─ appsscript/index.html
└─ appsscript/styles.html
└─ appsscript/i18n-js.html
└─ appsscript/app-js.html
Pushed 7 files.
```

**If `Code.gs` is missing from that list, stop.** Run `clasp pull` first and
confirm `appsscript/Code.gs` exists locally, then push again.

If clasp asks to overwrite the manifest, say yes only after checking that
`appsscript/appsscript.json` still has:

```json
"webapp": { "executeAs": "USER_DEPLOYING", "access": "MYSELF" }
```

The version in the cloud wins on conflict, so verify it either way in
step 2.

---

## 2. First deployment (once)

1. Open the sheet → **Extensions → Apps Script**.
2. Confirm the new files (`api.gs`, `index.html`, …) are there alongside
   `Code.gs`.
3. Click **Deploy → New deployment**.
4. Click the gear next to "Select type" → **Web app**.
5. Fill in:
   - **Description**: `Income Sheet Companion v1`
   - **Execute as**: **Me (your@email)**
   - **Who has access**: **Only myself**
6. Click **Deploy**.
7. Google asks you to authorize the script the first time. Review the scopes
   (Sheets access + running as you) and **Allow**. If the "unverified app"
   screen appears, click **Advanced → Go to Income Sheet Companion (unsafe)**
   — this is your own script in your own account.
8. Copy the **Web app URL**. It ends in `/exec`. That is the app.

> The `/dev` URL also works but only for you while logged into the editor,
> and it always serves the latest saved code. Use `/exec` on the phone.

---

## 3. Re-deploying after a change

The `/exec` URL stays the same forever if you update the existing deployment
instead of creating a new one:

1. `clasp push`
2. Apps Script editor → **Deploy → Manage deployments**
3. Click your deployment → the **pencil (edit)** icon
4. **Version**: `New version` → optionally describe the change
5. **Deploy**

Creating a *New deployment* instead would give you a second, different URL —
avoid that unless you want a separate test copy.

---

## 4. Add to Home Screen

There is no service worker and no offline mode (see `README.md`). Adding the
app to the home screen just gives it an icon and a chrome-less window; it
still needs a connection.

### Android (Chrome)

1. Open the `/exec` URL in Chrome.
2. Tap the **⋮** menu (top right).
3. Tap **Add to Home screen** (on some versions: **Install app**).
4. Name it `Income` → **Add**.
5. Chrome may then offer "Add automatically" or let you drag the icon.

### iPhone / iPad (Safari)

1. Open the `/exec` URL in **Safari** (not Chrome — only Safari can add to the
   home screen on iOS).
2. Tap the **Share** button (square with an arrow, bottom center).
3. Scroll down → **Add to Home Screen**.
4. Name it `Income` → **Add**.

On both platforms the icon opens the app full-screen. Because Apps Script
serves the app inside an iframe, the first paint after a cold start still
takes a couple of seconds; a revisit within the same session renders from the
session cache immediately.

---

## 5. Verify the deployment

Run the checklist in `TEST-CHECKLIST.md`, starting with the allowlist
negative tests in section 2 — those confirm the sheet's formulas are
unreachable before you start trusting the write buttons.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Blank page at `/exec` | Deployment not updated after a push | Manage deployments → edit → New version |
| "Script function not found: doGet" | `api.gs` was not pushed | `clasp push`, check the file list |
| Charts missing, everything else fine | Chart.js blocked (offline, or CDN unreachable) | Check the connection; the SRI hash in `index.html` must match cdnjs Chart.js 4.4.1 |
| "Can't reach your sheet." screen | Cold load failed with no cache | Tap Retry; check connectivity and that the deployment is still active |
| Every write fails with a safety error | Sheet structure drifted (renamed tab, moved rows) | Compare against `specs/001-income-sheet-companion/contracts/write-allowlist.md` |
| The beautifier menu vanished from the sheet | `Code.gs` was deleted by a push without a pull | Restore it from this repo (`appsscript/Code.gs`) or the script's version history, then push |
