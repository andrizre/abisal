#!/usr/bin/env node
// ============================================================
// ABISAL — server API save (opsional)
// Tanpa dependensi: Node murni, penyimpanan file JSON (data/).
// Bila DATABASE_URL diset & paket `pg` terpasang, dipakai Postgres
// (schema.sql) — selain itu otomatis fallback ke file.
// Jalankan:  node server.js  →  http://localhost:8787
// ============================================================
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const DATA_DIR = path.join(__dirname, 'data');
const STATIC_DIR = __dirname;
const SAVE_FILE = id => path.join(DATA_DIR, `save_${id}.json`);
const LB_FILE = path.join(DATA_DIR, 'leaderboard.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Penyimpanan ----------
// Mode file: seluruh state game (objek S di game.js) disimpan utuh
// sebagai JSON per pemain. Mode Postgres memetakan ke schema.sql.
let pgPool = null;
async function initPg() {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pgPool.query('SELECT 1');
    console.log('[abisal] mode: Postgres (schema.sql)');
    return true;
  } catch (e) {
    console.log('[abisal] pg tidak tersedia, fallback ke file JSON:', e.message);
    return false;
  }
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, val) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(val, null, 2));
  fs.renameSync(tmp, file);
}

// State ↔ baris players/inventory/player_upgrades/journal
function stateToRow(S) {
  return {
    username: S.name, day: S.day, coins: S.coins, energy: S.energy,
    max_energy: S.maxEnergy, safe_depth: S.safeDepth, luck: S.luck,
    finds_per_dive: S.findsPerDive, safety: S.safety, deepest: S.deepest,
    earned: S.earned || 0, prestige: S.prestige || 0,
    upgrades: S.upgrades || {}, journal: S.log || [],
  };
}
function rowToState(row) {
  return {
    name: row.username, day: row.day, coins: Number(row.coins),
    energy: row.energy, maxEnergy: row.max_energy, safeDepth: row.safe_depth,
    luck: Number(row.luck), findsPerDive: row.finds_per_dive, safety: Number(row.safety),
    inventory: {}, deepest: row.deepest, earned: Number(row.earned),
    log: row.journal || [], prestige: row.prestige,
    upgrades: row.upgrades || {},
  };
}

// ---------- Postgres store ----------
async function pgSaveState(state) {
  const r = stateToRow(state);
  const c = await pgPool.connect();
  try {
    await c.query('BEGIN');
    const up = `INSERT INTO players (username, day, coins, energy, max_energy, safe_depth, luck,
      finds_per_dive, safety, deepest, earned, prestige, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
      ON CONFLICT (username) DO UPDATE SET day=EXCLUDED.day, coins=EXCLUDED.coins,
      energy=EXCLUDED.energy, max_energy=EXCLUDED.max_energy, safe_depth=EXCLUDED.safe_depth,
      luck=EXCLUDED.luck, finds_per_dive=EXCLUDED.finds_per_dive, safety=EXCLUDED.safety,
      deepest=EXCLUDED.deepest, earned=EXCLUDED.earned, prestige=EXCLUDED.prestige, updated_at=now()
      RETURNING id`;
    const { rows } = await c.query(up, [r.username, r.day, r.coins, r.energy, r.max_energy,
      r.safe_depth, r.luck, r.finds_per_dive, r.safety, r.deepest, r.earned, r.prestige]);
    const pid = rows[0].id;
    await c.query('DELETE FROM player_upgrades WHERE player_id=$1', [pid]);
    for (const [uid, lvl] of Object.entries(r.upgrades)) {
      await c.query('INSERT INTO player_upgrades (player_id, upgrade_id, level) VALUES ($1,$2,$3)', [pid, uid, lvl]);
    }
    await c.query('DELETE FROM journal WHERE player_id=$1', [pid]);
    for (const l of r.journal) {
      await c.query('INSERT INTO journal (player_id, day, text, kind) VALUES ($1,$2,$3,$4)',
        [pid, l.day, l.text, l.cls || 'info']);
    }
    await c.query('COMMIT');
  } finally { c.release(); }
}
async function pgLoadState(id) {
  const { rows } = await pgPool.query('SELECT * FROM players WHERE username=$1', [id]);
  if (!rows.length) return null;
  const p = rows[0];
  const ups = await pgPool.query('SELECT upgrade_id, level FROM player_upgrades WHERE player_id=$1', [p.id]);
  const jr = await pgPool.query('SELECT day, text, kind FROM journal WHERE player_id=$1 ORDER BY id DESC LIMIT 120', [p.id]);
  const inv = await pgPool.query('SELECT artifact_id, qty FROM inventory WHERE player_id=$1', [p.id]);
  const st = rowToState(p);
  st.upgrades = Object.fromEntries(ups.rows.map(x => [x.upgrade_id, x.level]));
  st.log = jr.rows.map(x => ({ day: x.day, text: x.text, cls: x.kind }));
  st.inventory = Object.fromEntries(inv.rows.map(x => [x.artifact_id, x.qty]));
  return st;
}
async function pgLbGet() {
  const { rows } = await pgPool.query(
    `SELECT username AS name, prestige, earned, deepest FROM players
     ORDER BY earned + 500*prestige + deepest DESC LIMIT 20`);
  return rows.map(r => ({
    name: r.name, prestige: r.prestige, earned: Number(r.earned), deepest: r.deepest,
    score: Number(r.earned) + 500 * r.prestige + r.deepest, ts: 0,
  }));
}

// ---------- Routing ----------
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function body(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', d => { buf += d; if (buf.length > 512 * 1024) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    // API
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, mode: pgPool ? 'postgres' : 'file' });

    if (url.pathname === '/api/save' && req.method === 'POST') {
      const st = await body(req);
      if (!st || !st.name) return json(res, 400, { ok: false, error: 'state.name wajib' });
      if (pgPool) await pgSaveState(st);
      else writeJson(SAVE_FILE(st.name.toLowerCase()), st);
      return json(res, 200, { ok: true });
    }

    const mLoad = url.pathname.match(/^\/api\/load\/(.+)$/);
    if (mLoad && req.method === 'GET') {
      const id = decodeURIComponent(mLoad[1]).slice(0, 64);
      const st = pgPool ? await pgLoadState(id.toLowerCase()) : readJson(SAVE_FILE(id.toLowerCase()), null);
      return json(res, 200, { ok: true, state: st });
    }

    if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
      if (pgPool) return json(res, 200, { ok: true, entries: await pgLbGet() });
      return json(res, 200, { ok: true, entries: readJson(LB_FILE, []) });
    }

    if (url.pathname === '/api/leaderboard' && req.method === 'POST') {
      const e = await body(req);
      if (!e || !e.name) return json(res, 400, { ok: false, error: 'name wajib' });
      const entries = readJson(LB_FILE, []);
      entries.push({ name: String(e.name).slice(0, 32), prestige: e.prestige | 0, earned: e.earned | 0,
        deepest: e.deepest | 0, day: e.day | 0, ts: Date.now() });
      for (const x of entries) x.score = x.earned + 500 * x.prestige + x.deepest;
      entries.sort((a, b) => b.score - a.score);
      writeJson(LB_FILE, entries.slice(0, 20));
      return json(res, 200, { ok: true });
    }

    // Static file (game)
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    p = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(STATIC_DIR, p);
    if (!file.startsWith(STATIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile())
      return json(res, 404, { ok: false, error: 'not found' });
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.sql': 'text/plain' };
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(fs.readFileSync(file));
  } catch (e) {
    json(res, 500, { ok: false, error: e.message });
  }
});

initPg().then(() => {
  server.listen(PORT, () => console.log(`[abisal] server API di http://localhost:${PORT}`));
});
