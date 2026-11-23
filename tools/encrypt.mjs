// Builds the password-protected index.html from the plain app.
// Usage: ATL_PASSWORD=... node tools/encrypt.mjs src/app.html index.html
// The plain app (src/) is git-ignored and must never be committed.
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const [, , srcPath = 'src/app.html', outPath = 'index.html'] = process.argv;
const password = process.env.ATL_PASSWORD;
if (!password) { console.error('Set ATL_PASSWORD'); process.exit(1); }

const ITER = 1_000_000;
const enc = new TextEncoder();
const b64 = (u8) => Buffer.from(u8).toString('base64');

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(readFileSync(srcPath, 'utf8'))));

const payload = JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) });

const gate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Above the Lines</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--mid-0:#060a24;--mid-1:#0b1238;--mid-2:#111a4b;--mid-3:#1c2763;--mid-4:#2a3780;--electric:#1f8bff;--electric-2:#4cc3ff;--orange:#ff8a1f;--orange-2:#ffb15c;--text:#eef2ff;--muted:#9aa6d6;--dim:#6772a8}
*{box-sizing:border-box}
html{background:var(--mid-0)}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;font-family:Inter,system-ui,sans-serif;color:var(--text);
  background:radial-gradient(1000px 520px at 10% -10%,rgba(31,139,255,.2),transparent 60%),radial-gradient(800px 480px at 110% 10%,rgba(255,138,31,.12),transparent 60%),linear-gradient(180deg,var(--mid-1),var(--mid-0));background-attachment:fixed}
.box{width:100%;max-width:380px;background:linear-gradient(180deg,var(--mid-2),#0e1642);border:1px solid var(--mid-3);border-radius:22px;padding:30px 26px;box-shadow:0 20px 50px rgba(0,0,0,.4);text-align:center}
.logo{width:56px;height:56px;margin:0 auto 14px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,var(--electric),var(--electric-2));font-family:'Space Grotesk';font-weight:700;color:#04102e;font-size:24px;box-shadow:0 0 28px rgba(31,139,255,.45)}
h1{font-family:'Space Grotesk';font-size:24px;margin:0 0 6px}
p{color:var(--muted);font-size:14px;margin:0 0 22px}
input[type=password]{width:100%;background:var(--mid-0);border:2px solid var(--mid-3);color:var(--text);border-radius:12px;padding:14px;font-size:18px;text-align:center;letter-spacing:4px;outline:none;font-family:inherit;transition:.15s}
input[type=password]:focus{border-color:var(--electric);box-shadow:0 0 0 4px rgba(31,139,255,.18)}
input.bad{border-color:var(--orange);animation:shake .35s}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
button{width:100%;margin-top:14px;border:0;border-radius:12px;padding:13px;font:600 15px Inter,sans-serif;color:#fff;cursor:pointer;background:linear-gradient(135deg,var(--electric),#1468e0);box-shadow:0 6px 20px rgba(31,139,255,.35)}
button:disabled{opacity:.6;cursor:wait}
label{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:14px;font-size:13px;color:var(--muted);cursor:pointer}
label input{accent-color:var(--orange);width:16px;height:16px}
.err{min-height:20px;margin-top:12px;font-size:13px;color:var(--orange-2)}
</style>
</head>
<body>
<form class="box" id="gate" autocomplete="off">
  <div class="logo">ΓΑ</div>
  <h1>Above the Lines</h1>
  <p>Enter the password to open the study sets.</p>
  <input type="password" id="pw" placeholder="••••••" autofocus>
  <button id="go" type="submit">Unlock</button>
  <label><input type="checkbox" id="rem" checked> Remember on this device</label>
  <div class="err" id="err"></div>
</form>
<script>
const P = ${payload};
const KEY = 'atl-key-v1';
const u8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
async function open(key){
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:u8(P.iv)}, key, u8(P.ct));
  const html = new TextDecoder().decode(pt);
  document.open(); document.write(html); document.close();
}
async function derive(pw){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt:u8(P.salt), iterations:P.iter, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, true, ['decrypt']);
}
(async () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const key = await crypto.subtle.importKey('raw', u8(saved), 'AES-GCM', false, ['decrypt']);
      await open(key); return;
    }
  } catch (e) { try { localStorage.removeItem(KEY); } catch (_) {} }
})();
document.getElementById('gate').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const pw = document.getElementById('pw'), go = document.getElementById('go'), err = document.getElementById('err');
  if (!pw.value) return;
  const remember = document.getElementById('rem').checked;
  go.disabled = true; go.textContent = 'Unlocking…'; err.textContent = ''; pw.classList.remove('bad');
  try {
    const key = await derive(pw.value);
    const raw = await crypto.subtle.exportKey('raw', key);
    const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:u8(P.iv)}, key, u8(P.ct)); // throws on wrong password
    if (remember) { try { localStorage.setItem(KEY, b64(raw)); } catch (_) {} }
    document.open(); document.write(new TextDecoder().decode(pt)); document.close();
  } catch (e) {
    go.disabled = false; go.textContent = 'Unlock';
    pw.classList.add('bad'); pw.select(); err.textContent = 'Wrong password';
  }
});
</script>
</body>
</html>
`;
writeFileSync(outPath, gate);
console.log('Wrote', outPath, gate.length, 'bytes');
