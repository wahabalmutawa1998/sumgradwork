/* =====================================================================
   server.js — سيرفر النظام: يقدّم الملفات + يخزّن البيانات المشتركة
   عشان أي تعديل من أي موظف يبين لكل الفريق.

   التخزين:
   - لو فيه متغير بيئة DATABASE_URL → يخزّن في Postgres (وضع DigitalOcean)
   - غير كذا → يخزّن في ملف data/db.json (وضع التشغيل المحلي أو Droplet)

   الحماية من التعارض: كل مفتاح له رقم نسخة (version). أي حفظ لازم يرسل
   آخر نسخة شافها (If-Match) — لو أحد ثاني حفظ قبله يرجع 409 بدل ما يمسح
   شغل زميله.
   ===================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const MAX_BODY = 10 * 1024 * 1024; // 10MB

/* ---------------- التخزين: ملف ---------------- */
function fileStore(dir) {
  const file = path.join(dir, 'db.json');
  fs.mkdirSync(dir, { recursive: true });
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  let writing = Promise.resolve();
  function persist() {
    writing = writing.then(() => new Promise(res => {
      const tmp = file + '.tmp';
      fs.writeFile(tmp, JSON.stringify(data), err => {
        if (!err) fs.rename(tmp, file, () => res());
        else res();
      });
    }));
    return writing;
  }
  return {
    async get(k) { return data[k] || null; },
    async set(k, value, ifMatch) {
      const cur = data[k];
      if (cur && ifMatch !== cur.version) return 'conflict';
      const version = (cur ? cur.version : 0) + 1;
      data[k] = { value, version };
      await persist();
      return { version };
    },
    async del(k) { delete data[k]; await persist(); },
    async list() { return Object.keys(data); }
  };
}

/* ---------------- التخزين: Postgres ---------------- */
function pgStore(url) {
  const { Pool } = require('pg');
  const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: url, ssl });
  const ready = pool.query(
    'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, version BIGINT NOT NULL DEFAULT 1)'
  );
  return {
    async get(k) {
      await ready;
      const r = await pool.query('SELECT value, version FROM kv WHERE key=$1', [k]);
      if (!r.rows.length) return null;
      return { value: r.rows[0].value, version: Number(r.rows[0].version) };
    },
    async set(k, value, ifMatch) {
      await ready;
      const u = await pool.query(
        'UPDATE kv SET value=$2, version=version+1 WHERE key=$1 AND version=$3 RETURNING version',
        [k, value, ifMatch]
      );
      if (u.rows.length) return { version: Number(u.rows[0].version) };
      const ins = await pool.query(
        'INSERT INTO kv (key, value, version) VALUES ($1,$2,1) ON CONFLICT (key) DO NOTHING RETURNING version',
        [k, value]
      );
      if (ins.rows.length) return { version: 1 };
      return 'conflict';
    },
    async del(k) { await ready; await pool.query('DELETE FROM kv WHERE key=$1', [k]); },
    async list() {
      await ready;
      const r = await pool.query('SELECT key FROM kv');
      return r.rows.map(x => x.key);
    }
  };
}

const store = process.env.DATABASE_URL
  ? pgStore(process.env.DATABASE_URL)
  : fileStore(process.env.DATA_DIR || path.join(ROOT, 'data'));

/* ---------------- أدوات ---------------- */
function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(b);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too-big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // api, kv|version, key?
  const key = parts[2] ? decodeURIComponent(parts[2]) : null;

  if (parts[1] === 'version' && req.method === 'GET' && key) {
    const row = await store.get(key);
    return json(res, 200, { key, version: row ? row.version : 0 });
  }
  if (parts[1] !== 'kv') return json(res, 404, { error: 'not-found' });

  if (req.method === 'GET' && !key) return json(res, 200, { keys: await store.list() });
  if (req.method === 'GET') {
    const row = await store.get(key);
    if (!row) return json(res, 404, { error: 'not-found', key });
    return json(res, 200, { key, value: row.value, version: row.version });
  }
  if (req.method === 'PUT' && key) {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { return json(res, 400, { error: 'bad-body' }); }
    if (typeof body.value !== 'string') return json(res, 400, { error: 'value-must-be-string' });
    const ifMatch = parseInt(req.headers['if-match'] || '0', 10) || 0;
    const r = await store.set(key, body.value, ifMatch);
    if (r === 'conflict') {
      const cur = await store.get(key);
      return json(res, 409, { error: 'conflict', key, version: cur ? cur.version : 0 });
    }
    return json(res, 200, { key, version: r.version });
  }
  if (req.method === 'DELETE' && key) {
    await store.del(key);
    return json(res, 200, { key, deleted: true });
  }
  return json(res, 405, { error: 'method-not-allowed' });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep) || p.includes('..')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      // SPA: أي مسار غير معروف يرجع الواجهة
      fs.readFile(path.join(ROOT, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
        res.end(idx);
      });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const vendor = p.startsWith('/vendor/');
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': vendor ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    try { json(res, 500, { error: 'server-error' }); } catch (_) {}
  }
}).listen(PORT, () => console.log('sumgradwork server on :' + PORT +
  (process.env.DATABASE_URL ? ' (Postgres)' : ' (file storage)')));
