# Above the Lines · Learn

Quizlet Learn-style study sets (First 10 → Ninth 10). Each card shows only the number; fill in one box per line from the doc (name, year & major, hometown, title(s), ΓΑ number). Missed cards repeat until each one is right in two separate rounds.

The study content is encrypted (AES-256-GCM, key derived from the password with PBKDF2-SHA256). The page asks for the password and decrypts in the browser; nothing readable is stored in this repo.

## Rebuilding after an edit

The plain app lives in `src/app.html`, which is git-ignored and must never be committed.

```
ATL_PASSWORD='<password>' node tools/encrypt.mjs src/app.html index.html
```
