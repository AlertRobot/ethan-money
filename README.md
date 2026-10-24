# Ethan's Money

A phone app (PWA) for the **E&S Budgie** Google Sheet. It lets you:
- log payments on the go,
- see what's left this pay period,
- sort your pots on payday,
- change the blue input cells.

The sheet stays the master copy: the app writes payments into the Expense log, and every total comes from the sheet's own formulas.

- **App:** https://alertrobot.github.io/ethan-money/
- **Link to the sheet:** `apps-script/Code.gs`, a Google Apps Script web app bound to the sheet.

## One-off setup (about 5 minutes, on a computer)
1. Open the sheet, then go to **Extensions → Apps Script**.
2. Delete what's in `Code.gs`, paste in the whole of `apps-script/Code.gs`, and click **Save**.
3. Pick **setup** in the function dropdown, then click **Run**.
   - Google asks for permission. Choose your account, then **Advanced → Go to (project) → Allow**. The script is yours, so Google shows the "unverified app" screen.
   - The log shows your **app key**.
4. Click **Deploy → New deployment**, then the gear icon → **Web app**.
   - Description: `Ethan's Money`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
5. Paste that URL into `WEB_APP_URL` at the top of the script, click **Save**, then run **connectLink**.
   - The log shows a link. Open it on your phone in Chrome and the app connects itself.
   - If you'd rather, paste the URL and key into the app's connect screen instead.
6. In Chrome on the phone, open ⋮ → **Add to Home screen / Install app**.

"Anyone" means anyone with the URL **and** the app key. Without the key, the script refuses every request.
To change the key, run `newKey` and reconnect.

## Updating the script later
Paste the new code, then go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**.
The URL stays the same.

## How the app reads the sheet
- **Pay periods, budgets and savings** come from the Budget tab, found by their labels in column A, so moving rows is fine.
- **Pots for the payday sorter** come from the App settings tab.
- **Editable cells** are those with **blue text and no formula**, plus checkboxes. That matches the sheet's own rule: blue means an input.
- **Payments you add** go into the first empty row of the Expense log. The App ID in column I stops duplicates, including Monzo re-imports.
- **Offline**, payments wait on the phone and sync when you're back online.
