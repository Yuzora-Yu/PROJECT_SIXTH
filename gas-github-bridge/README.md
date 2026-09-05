# GitHub publication bridge for the owner-only Gemini Spark Sheet

This is a **separate Apps Script project** for `.github/workflows/publish-predictions.yml`.
Do not merge it into `gas/`, because the existing `gas/` project has an interactive UI and must not be deployed for anonymous access.

## Invariant

The Gemini Spark production spreadsheet must have **no collaborators other than the owner**. In particular, do not share it with a service account, GitHub bot, secondary Google account, or automation account.

The bridge works without sharing the spreadsheet:

1. Apps Script is deployed by the spreadsheet owner.
2. The Web App is configured to **execute as the deployer (Me)**.
3. GitHub Actions sends an HMAC-signed POST to the Web App.
4. Apps Script uses the deployer's Google authorization to read/write the fixed spreadsheet.
5. The owner's Google OAuth token never leaves Apps Script.

The endpoint only permits the fixed spreadsheet, the four publication read ranges, XLSX export, and the exact publication `batchUpdate` shape used by Action 1.

## Deploy

1. Create a new standalone Apps Script project owned by the same Google account that owns the production spreadsheet.
2. Copy `Code.gs` and `appsscript.json` from this directory into that project.
3. In **Project Settings → Script Properties**, create `GITHUB_BRIDGE_SECRET` with a random 64-character lowercase hexadecimal value. For example, generate 32 random bytes locally and hex-encode them.
4. Run `authorizeBridge()` once from the editor. It only reads the fixed spreadsheet/file and forces the owner authorization flow for the declared scopes.
5. Choose **Deploy → New deployment → Web app**.
6. Set **Execute as: Me**.
7. Set **Who has access: Anyone**. Authentication is enforced by the HMAC request signature in `Code.gs`; the Web App does not expose a UI or a generic spreadsheet API.
8. Copy the production `/exec` URL. Do not use a `/dev` test URL.

GitHub repository settings:

- Variable `GEMINI_SPARK_BRIDGE_URL`: the Apps Script production `/exec` URL.
- Secret `GEMINI_SPARK_BRIDGE_SECRET`: exactly the same 64-hex value as the Apps Script Script Property.
- Keep `GOOGLE_SPREADSHEET_ID` (or the same-named variable) pointing to the fixed spreadsheet.
- Remove obsolete `GCP_WIF_PROVIDER` and `GCP_SERVICE_ACCOUNT` variables after migration.

## Remove the old spreadsheet permission

After the Web App and GitHub settings are ready, open the production spreadsheet's **Share** dialog and remove `project-sixth-sheets@project-sixth-ops.iam.gserviceaccount.com` (and any other non-owner editor/viewer). Verify that the owner is the only person/account listed before re-enabling the scheduled publication workflow.

The old Google Cloud Workload Identity Pool/provider and service account are no longer used by this repository. They may be disabled/deleted after the new bridge passes a GitHub `dry_run=true` run.

## First verification

Run `Publish approved predictions` manually with `dry_run=true`. It must complete its live Sheet reads and XLSX export through the bridge while making no Git, Cloudflare, or Sheet changes. Then run a normal publication only when a READY item exists.

If the HMAC secret, deployment URL, spreadsheet contract, allowed ranges, or publication write shape does not match, the bridge fails closed.
