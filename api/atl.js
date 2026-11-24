// Above the Lines sync API (Vercel serverless function, Upstash Redis over REST).
// Every request must carry x-atl-token, which only exists inside the encrypted app,
// so only people with the site password can reach the data.
const crypto = require('crypto');
const AUTH = require('./_auth.json'); // { tokenHash, adminHash } — hashes only

const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const sha = (s) => crypto.createHash('sha256').update(String(s || '')).digest('hex');
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function redis(...cmd) {
  const r = await fetch(RURL, { method: 'POST', headers: { Authorization: `Bearer ${RTOK}` }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const pairs = (arr) => { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = arr[i + 1]; return o; };

const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s'-]/g, '').replace(/\s+/g, ' ').trim();
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, j) => j), c = new Array(n + 1);
  for (let i = 1; i <= m; i++) { c[0] = i; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [p, c] = [c, p]; }
  return p[n];
}
function score(qFirst, qLast, u) {
  const f = normName(u.first), l = normName(u.last), qf = normName(qFirst), ql = normName(qLast);
  if (!qf) return 0;
  if (qf === f && ql === l) return 100;
  const full = lev(`${qf} ${ql}`.trim(), `${f} ${l}`.trim());
  if (full <= 2) return 90 - full;
  if (qf === f && ql && l && (l.startsWith(ql) || ql.startsWith(l))) return 80;
  if (qf === f && !ql) return 70;
  if (qf === f) return 50;
  if (lev(qf, f) <= 1 && ql && ql === l) return 60;
  return 0;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  const send = (code, obj) => res.status(code).json(obj);
  const tok = req.headers['x-atl-token'] || '';
  if (!eq(sha(tok), AUTH.tokenHash)) return send(401, { error: 'unauthorized' });
  if (!RURL || !RTOK) return send(503, { error: 'database not connected' });

  const b = (req.method === 'POST' ? req.body : req.query) || {};
  const a = b.a || req.query.a;
  try {
    if (a === 'health') { await redis('PING'); return send(200, { ok: true }); }

    if (a === 'find') {
      const all = pairs(await redis('HGETALL', 'users'));
      const found = Object.entries(all).map(([id, j]) => { const u = JSON.parse(j); return { id, name: `${u.first} ${u.last}`.trim(), s: score(b.first, b.last, u) }; })
        .filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 3);
      return send(200, { matches: found.map(({ id, name }) => ({ id, name })) });
    }

    if (a === 'create') {
      const first = clean(b.first), last = clean(b.last);
      if (!first) return send(400, { error: 'name required' });
      const id = crypto.randomBytes(8).toString('hex'), now = Date.now();
      await redis('HSET', 'users', id, JSON.stringify({ first, last, created: now, seen: now }));
      return send(200, { id, name: `${first} ${last}`.trim() });
    }

    if (a === 'pull' || a === 'push') {
      const id = String(b.id || '');
      const uj = /^[0-9a-f]{16}$/.test(id) ? await redis('HGET', 'users', id) : null;
      if (!uj) return send(404, { error: 'no such user' });
      const key = `d:${id}`;
      if (a === 'push') {
        const inc = b.entries && typeof b.entries === 'object' ? b.entries : {};
        const keys = Object.keys(inc).filter((k) => k.length < 80).slice(0, 2000);
        if (keys.length) {
          const cur = await redis('HMGET', key, ...keys);
          const upd = [];
          keys.forEach((k, i) => {
            const e = inc[k]; if (!e || typeof e.t !== 'number') return;
            const old = cur[i] ? JSON.parse(cur[i]) : null;
            if (!old || e.t > old.t) upd.push(k, JSON.stringify({ v: e.v === undefined ? null : e.v, t: e.t }));
          });
          if (upd.length) await redis('HSET', key, ...upd);
        }
      }
      const u = JSON.parse(uj); u.seen = Date.now();
      await redis('HSET', 'users', id, JSON.stringify(u));
      const raw = pairs(await redis('HGETALL', key));
      const entries = {}; for (const k in raw) entries[k] = JSON.parse(raw[k]);
      return send(200, { name: `${u.first} ${u.last}`.trim(), entries });
    }

    if (a === 'admin') {
      if (!eq(sha(req.headers['x-atl-admin'] || ''), AUTH.adminHash)) return send(403, { error: 'wrong admin code' });
      const all = pairs(await redis('HGETALL', 'users'));
      const out = [];
      for (const [id, j] of Object.entries(all)) {
        const u = JSON.parse(j), raw = pairs(await redis('HGETALL', `d:${id}`));
        let mastered = 0, learning = 0; const best = {};
        for (const k in raw) {
          const v = JSON.parse(raw[k]).v; if (v == null) continue;
          if (k.startsWith('p:')) { if (v.lv >= 2) mastered++; else if (v.seen) learning++; }
          if (k.startsWith('sb:')) best[k.slice(3)] = v;
        }
        out.push({ id, name: `${u.first} ${u.last}`.trim(), created: u.created, seen: u.seen, mastered, learning, best });
      }
      out.sort((x, y) => y.seen - x.seen);
      return send(200, { users: out });
    }

    if (a === 'remove') {
      if (!eq(sha(req.headers['x-atl-admin'] || ''), AUTH.adminHash)) return send(403, { error: 'wrong admin code' });
      const id = String(b.id || '');
      await redis('HDEL', 'users', id); await redis('DEL', `d:${id}`);
      return send(200, { ok: true });
    }
    return send(400, { error: 'unknown action' });
  } catch (e) {
    return send(500, { error: 'server error' });
  }
};
