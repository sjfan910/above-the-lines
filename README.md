# Above the Lines · Learn

> **Currently open:** the password screen and name sign-in are switched off; progress saves on each device only. To turn them back on, rebuild with `ATL_PASSWORD='<password>' node tools/encrypt.mjs src/app.html index.html` and push.

Quizlet Learn-style study sets (First 10 → Ninth 10). Each card shows only the number; fill in one box per line from the doc (name, year & major, hometown, title(s), ΓΑ number). Missed cards repeat until each one is right in two separate rounds.

History Sheets #1–#4 are laid out like the printed pages with fill-in boxes where the text sits. Full sheet mode blanks every line; Key facts mode blanks names, dates and numbers.

The study content is encrypted (AES-256-GCM, key derived from the password with PBKDF2-SHA256). The page asks for the password and decrypts in the browser; nothing readable is stored in this repo.

## Rebuilding after an edit

The plain app lives in `src/app.html`, which is git-ignored and must never be committed.

```
ATL_PASSWORD='<password>' node tools/encrypt.mjs src/app.html index.html
```

## Accounts & sync

After unlocking, each person enters their name; a returning name is matched ("Is this you?"). Progress is stored per account in Upstash Redis through `api/atl.js` and syncs across devices. Requests need a token that exists only inside the encrypted app; `api/_auth.json` holds hashes only. `#admin` lists accounts (needs the admin code).
