// ============================================================
// ABISAL — game penyelam laut dalam (text-based)
// Save: localStorage | DB-ready: lihat schema.sql (Postgres)
// ============================================================

const SAVE_KEY = 'abisal_save_v1';
const LB_KEY = 'abisal_leaderboard_v1';

// ---------- Data ----------
const ARTIFACTS = [
  { id: 'koral_merah',   name: 'Koral Merah',        minDepth: 10,  value: 15 },
  { id: 'koin_tenggelam',name: 'Koin Tenggelam',     minDepth: 10,  value: 25 },
  { id: 'amfora',        name: 'Pecahan Amfora',      minDepth: 50,  value: 60 },
  { id: 'mutiara',       name: 'Mutiara Liar',        minDepth: 50,  value: 90 },
  { id: 'kompas_kapal',  name: 'Kompas Kapal Karam',  minDepth: 100, value: 180 },
  { id: 'emas_ingot',    name: 'Batang Emas Korban',  minDepth: 100, value: 320 },
  { id: 'ikon_air',      name: 'Ikon Air Kuno',       minDepth: 200, value: 700 },
  { id: 'teropong_sirine',name: 'Teropong Sirine',    minDepth: 200, value: 1100 },
  { id: 'jantung_abisal',name: 'Jantung Abisal',      minDepth: 400, value: 3000 },
];

// Zona dengan field `boss` punya boss makhluk laut & event spesial sendiri.
const SPECIAL_ARTIFACTS = [
  { id: 'topi_kapten', name: 'Topi Kapten Tenggelam', value: 600 },
  { id: 'sisik_baja',  name: 'Sisik Baja Ular Laut',  value: 1100 },
  { id: 'mata_abisal', name: 'Mata Sang Abisal',      value: 3500 },
];

const ZONES = [
  { name: 'Dangkalan Matahari', depth: 30,
    specialGood: ['Kepiting peraksi menyeret kaleng penuh koin ke kakimu.'],
    specialBad: ['Lumpur hisap dangkal menelan kakimu sesaat.'] },
  { name: 'Reruntuhan Amfora', depth: 80,
    specialGood: ['Di antara amfora pecah, kamu menemukan relikui yang masih utuh.'],
    specialBad: ['Rak amfora runtuh dan nyaris menghimpit setelanmu.'] },
  { name: 'Lorong Kapal Karam', depth: 160,
    specialGood: ['Lorong kapal karam menuntunmu ke kabin kapten — peti besinya masih tertutup.'],
    specialBad: ['Pintu lorong berderit lalu mengunci — kamu merobek sedikit selang oksigen.'],
    boss: { id: 'kapten_tenggelam', name: 'Kapten Tenggelam', reward: 'topi_kapten', coin: 250 } },
  { name: 'Palung Sisa', depth: 300,
    specialGood: ['Binar kuning dari celah palung menerangi koloni emas.'],
    specialBad: ['Palung "bernapas" — gelombang tekanan menjentik tubuhmu ke dinding.'],
    boss: { id: 'ular_baja', name: 'Ular Laut Kepala Baja', reward: 'sisik_baja', coin: 450 } },
  { name: 'Zona Abisal', depth: 500,
    specialGood: ['Cahaya organik abisal menyala di sekelilingmu seperti perayaan.'],
    specialBad: ['Keheningan mencekam — sesuatu yang sangat besar sedang mendekat.'],
    boss: { id: 'sang_abisal', name: 'Sang Abisal', reward: 'mata_abisal', coin: 1200 } },
];

const UPGRADES = [
  { id: 'tank',   name: 'Tangki Oksigen',  desc: '+25 energi maks',           baseCost: 100, growth: 1.8, effect: s => s.maxEnergy += 25 },
  { id: 'suit',   name: 'Setelan Tekanan', desc: '+40 m kedalaman aman',      baseCost: 150, growth: 1.9, effect: s => s.safeDepth += 40 },
  { id: 'lamp',   name: 'Lampu Abisal',    desc: '+10% peluang temuan bagus', baseCost: 200, growth: 2.0, effect: s => s.luck += 0.10 },
  { id: 'tool',   name: 'Alat Angkat',     desc: '+1 temuan per selam',       baseCost: 400, growth: 2.2, effect: s => s.findsPerDive += 1 },
  { id: 'reel',   name: 'Neraca Naik',     desc: 'Naik lebih aman (-15% risiko)', baseCost: 350, growth: 2.1, effect: s => s.safety += 0.15 },
];

const ALL_ARTIFACTS = ARTIFACTS.concat(SPECIAL_ARTIFACTS);

// ---------- State ----------
let S = null;

function defaultState(name) {
  return {
    name,
    day: 1,
    coins: 50,
    energy: 100, maxEnergy: 100,
    safeDepth: 50,
    luck: 0, findsPerDive: 2, safety: 0,
    inventory: {},          // artifactId -> qty
    deepest: 0,
    earned: 0,              // total koin sepanjang karier (lifetime)
    log: [],
    prestige: 0,
  };
}

// ---------- Sinkronisasi cloud (opsional) ----------
// Game tetap bisa dimainkan 100% offline (localStorage). Bila API server
// (server.js) tersedia, state & skor disinkronkan otomatis (fire-and-forget).
const API_BASE = ''; // same-origin saat dilayani server.js; kosong = matikan
let CLOUD_OK = null; // null = belum dicek

async function cloudCheck() {
  try {
    const r = await fetch(API_BASE + '/api/health', { signal: AbortSignal.timeout(2000) });
    const j = await r.json();
    CLOUD_OK = !!j.ok;
  } catch { CLOUD_OK = false; }
  renderCloud();
}
function cloudSave() {
  if (!CLOUD_OK || !S) return;
  fetch(API_BASE + '/api/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(S),
  }).catch(() => {});
}
function cloudLb(entry) {
  if (!CLOUD_OK) return;
  fetch(API_BASE + '/api/leaderboard', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}
function renderCloud() {
  const el = $('cloud-status'); if (!el) return;
  el.textContent = CLOUD_OK ? '☁ Tersinkron ke server' : '💾 Mode offline (localStorage)';
}

function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); cloudSave(); }
function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) { try { S = JSON.parse(raw); } catch { S = null; } }
}

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('id-ID');
const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

function addLog(text, cls = '') {
  S.log.unshift({ day: S.day, text, cls });
  S.log = S.log.slice(0, 120);
  renderLog();
}

function gainCoins(n) { S.coins += n; S.earned = (S.earned || 0) + n; }

function upgradeCost(u) {
  const level = S.upgrades?.[u.id] || 0;
  return Math.round(u.baseCost * Math.pow(u.growth, level));
}

// ---------- Prestige / Level Penyelam ----------
// Syarat: koin >= PRESTIGE_REQ(level). Prestige reset koin, energi, upgrade,
// inventaris & kedalaman, tapi memberi +PERMANEN bonus temuan & kedalaman aman.
const PRESTIGE_BASE_REQ = 2000;
const PRESTIGE_REQ_MULT = 2.5;

function prestigeReq() {
  return Math.round(PRESTIGE_BASE_REQ * Math.pow(PRESTIGE_REQ_MULT, S.prestige));
}

function prestigeBonus() {
  return S.prestige * 0.10; // +10% nilai jual per level
}

function canPrestige() {
  return S.coins >= prestigeReq();
}

function doPrestige() {
  if (!canPrestige()) { alert(`Butuh ${fmt(prestigeReq())} koin untuk naik level penyelam.`); return; }
  const keep = { name: S.name, day: S.day, prestige: S.prestige + 1, earned: S.earned || 0, deepest: S.deepest };
  const bonus = keep.prestige;
  S = defaultState(S.name);
  S.day = keep.day;
  S.prestige = keep.prestige;
  S.safeDepth += S.prestige * 20;        // bonus permanen: +20 m / level
  S.findsPerDive += S.prestige;          // bonus permanen: +1 temuan / level
  S.earned = keep.earned;                // lifetime: tidak direset prestige
  S.deepest = Math.max(S.deepest, keep.deepest);
  addLog(`🌊 <b>NAIK LEVEL PENYELAM ${bonus}!</b> Kamu kembali ke Pelabuhan Gelap lebih perkasa: +${bonus * 10}% nilai jual, +${bonus * 20} m zona aman, +${bonus} temuan per selam.`);
  save();
  lbAdd(S.name, S.prestige, keep.earned || 0, keep.deepest || 0); // catat skor prestasi
  renderAll();
}

// ---------- Leaderboard lokal (localStorage) ----------
// Skor = koin total sepanjang karier + 500×level + kedalaman maks.
// Entri dicatat otomatis saat naik level & saat "Catat Skor" (juga otomatis tiap hari saat tidur).
function lbScore(e) { return (e.earned || 0) + 500 * (e.prestige || 0) + (e.deepest || 0); }

function lbAdd(name, prestige, earned, deepest) {
  const entry = { name, prestige, earned, deepest, day: S.day, score: lbScore({ prestige, earned, deepest }), ts: Date.now() };
  const lb = lbGet();
  lb.push(entry);
  lb.sort((a, b) => b.score - a.score);
  localStorage.setItem(LB_KEY, JSON.stringify(lb.slice(0, 20)));
  cloudLb(entry);
  renderLeaderboard();
}

function lbGet() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; } catch { return []; }
}

function lbRecord() {
  lbAdd(S.name, S.prestige, S.earned || 0, S.deepest);
  addLog('Skor kamu dicatat ke papan peringkat.');
  save();
}

function lbClear() {
  if (!confirm('Hapus semua riwayat papan peringkat?')) return;
  localStorage.removeItem(LB_KEY);
  renderLeaderboard();
}

function renderLeaderboard() {
  const el = $('leaderboard-list'); if (!el) return;
  const lb = lbGet();
  el.innerHTML = lb.length ? lb.map((e, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    return `<div class="item-row">
      <div><b>${medal} ${e.name}</b> <span class="muted">Lv.${e.prestige} — hari ${e.day}</span><br>
        <span class="muted">Koin total: ${fmt(e.earned)} · Kedalaman maks: ${fmt(e.deepest)} m</span></div>
      <div><b>${fmt(e.score)}</b> <span class="muted">poin</span></div>
    </div>`;
  }).join('') : '<p class="muted">Belum ada skor. Naik level atau catat skormu!</p>';
}

// ---------- Dive ----------
const EVENTS_GOOD = [
  'Arus tenang membawamu ke kantong udara tersembunyi — oksigen terisi kembali.',
  'Kamu menemukan gua kecil yang menampung tiram. Mutiara terpikul.',
  'Sinar samar menembus air; temuanmu malam ini berkilau.',
  'Ikan xeraja biru memandumu, lalu menunjukkan arah harta.',
];
const EVENTS_BAD = [
  'Arus hitam menyergap! Sebagian energi terkuras melawan tarikannya.',
  'Talon abisal menggedor setelanmu. Tekanan meresap.',
  'Kawat kapal karam melukai tanganmu — kamu kehilangan satu temuan.',
  'Bayangan besar lewat. Kamu membeku dan menguras napas lebih lama.',
];

function startDive(targetDepth) {
  if (S.energy < 10) { alert('Energi kurang! Tidur untuk mengisi ulang (lihat bawah).'); return; }
  const risky = targetDepth > S.safeDepth;
  const risk = Math.min(0.7, Math.max(0.02, (targetDepth - S.safeDepth) / targetDepth) * (1 - S.safety));
  S._dive = { targetDepth, risk, progress: 0, finds: [], energyStart: S.energy };
  $('dive-info').classList.add('hidden');
  $('depth-options').classList.add('hidden');
  $('dive-progress').classList.remove('hidden');
  renderDiveFrame();
}

function zoneOf(depth) {
  return ZONES.find(z => z.depth === depth);
}

function diveTick() {
  const d = S._dive; if (!d) return;
  const zone = zoneOf(d.targetDepth);
  d.progress += Math.min(d.targetDepth, 10 + Math.floor(Math.random() * 15));
  S.deepest = Math.max(S.deepest, d.progress);

  // Boss encounter: saat mencapai dasar zona yang punya boss, sekali per selam
  if (zone?.boss && !d.bossDone && d.progress >= d.targetDepth) {
    d.bossDone = true;
    return bossEncounter(zone.boss);
  }

  // chance of event each tick
  if (Math.random() < 0.35) {
    // 30% event spesial zona (jika ada), sisanya event umum
    if (zone && zone.specialGood && Math.random() < 0.3) {
      const good = Math.random() < (0.55 + S.luck);
      showEvent(rnd(good ? zone.specialGood : zone.specialBad), good ? 'good' : 'bad');
      if (!good) {
        S.energy = Math.max(0, S.energy - 10);
        if (S.energy <= 0) return finishDive(true);
      }
    } else if (Math.random() < (0.45 + S.luck)) {
      showEvent(rnd(EVENTS_GOOD), 'good');
    } else {
      showEvent(rnd(EVENTS_BAD), 'bad');
      S.energy = Math.max(0, S.energy - 15);
      if (S.energy <= 0) return finishDive(true);
    }
  }
  renderDiveFrame();
}

// ---------- Boss makhluk laut ----------
function bossEncounter(boss) {
  const power = S.maxEnergy / 100 + S.prestige; // kekuatan penyelam
  const winChance = Math.min(0.9, 0.25 + power * 0.15);
  if (Math.random() < winChance) {
    S.inventory[boss.reward] = (S.inventory[boss.reward] || 0) + 1;
    gainCoins(boss.coin);
    showEvent(`⚔️ <b>${boss.name}</b> bangkit dari gelap... dan KALAH! Kamu mengangkat <b>${boss.name}'s relic</b> + ${fmt(boss.coin)} koin.`, 'good');
    addLog(`⚔️ Mengalahkan boss <b>${boss.name}</b>! Hadiah: artefak spesial + ${fmt(boss.coin)} koin.`, 'good');
    missionStats().boss++;
  } else {
    const lost = Math.round(boss.coin * 0.4);
    S.energy = Math.max(0, S.energy - 30);
    showEvent(`🩸 <b>${boss.name}</b> terlalu kuat! Kamu terpental, kehilangan ${lost} koin dan banyak oksigen.`, 'bad');
    S.coins = Math.max(0, S.coins - lost);
    addLog(`Kalah dari boss <b>${boss.name}</b> di dasar zona. (-${fmt(lost)} koin, -30 energi)`, 'bad');
    if (S.energy <= 0) return finishDive(true);
  }
  renderDiveFrame();
}

function collectFind() {
  const d = S._dive; if (!d) return;
  const pool = ALL_ARTIFACTS.filter(a => a.minDepth && a.minDepth <= d.progress);
  if (!pool.length) return;
  const pick = pool[pool.length - 1 - (Math.random() < S.luck / 2 ? 1 : 0)] || pool[pool.length - 1];
  const art = rnd(pool.filter(a => a.minDepth >= d.progress * 0.5)) || pick;
  d.finds.push(art.id);
  missionStats().finds++;
  S.inventory[art.id] = (S.inventory[art.id] || 0) + 1;
  showEvent(`Kamu mengangkat: <b>${art.name}</b>`, 'good');
  renderDiveFrame();
}

function finishDive(forced = false) {
  const d = S._dive; if (!d) return;
  let msg;
  if (forced) {
    msg = 'Oksigen habis! Kamu terpaksa darurat naik. Beberapa temuan terlepas.';
    const lost = Math.ceil(d.finds.length / 2);
    for (let i = 0; i < lost; i++) {
      const id = d.finds.pop();
      S.inventory[id]--;
    }
  } else {
    msg = `Selam selesai di ${fmt(d.progress)} m — ${d.finds.length} temuan di tas.`;
  }
  delete S._dive;
  if (!forced) missionStats().dives++;
  addLog(msg);
  $('dive-progress').classList.add('hidden');
  $('dive-info').classList.remove('hidden');
  $('depth-options').classList.remove('hidden');
  $('dive-events').innerHTML = '';
  save(); renderAll();
}

function renderDiveFrame() {
  const d = S._dive;
  $('depth-fill').style.width = Math.min(100, (d.progress / d.targetDepth) * 100) + '%';
  $('depth-text').textContent = `${fmt(d.progress)} / ${fmt(d.targetDepth)} m — risiko: ${Math.round(d.risk * 100)}% — tas: ${d.finds.length} barang`;
  $('dive-actions').innerHTML = `
    <button class="btn" onclick="diveTick()">Turun Lagi</button>
    <button class="btn secondary" onclick="collectFind()">Periksa Sekitar</button>
    <button class="btn danger" onclick="finishDive()">Naik ke Permukaan</button>`;
}

function showEvent(text, cls) {
  const div = document.createElement('div');
  div.className = 'event-card ' + cls;
  div.innerHTML = text;
  $('dive-events').prepend(div);
}

// ---------- Misi harian ----------
const MISSION_POOL = [
  { id: 'm_dive',   text: n => `Selesaikan ${n} selam`,            target: 3, reward: 60 },
  { id: 'm_find',   text: n => `Angkat ${n} artefak`,              target: 5, reward: 80 },
  { id: 'm_sell',   text: n => `Jual ${n} artefak di Pasar`,       target: 5, reward: 80 },
  { id: 'm_earn',   text: n => `Kumpulkan ${n} koin dari penjualan`, target: 300, reward: 100 },
  { id: 'm_boss',   text: () => 'Kalahkan 1 boss makhluk laut',    target: 1, reward: 250 },
];

function missionStats() { return S.mstats = S.mstats || { dives: 0, finds: 0, sold: 0, earned: 0, boss: 0 }; }

function missionDay() { // daftar misi 3 acak (seeded per hari agar stabil)
  const seed = S.day * 7919;
  const pool = [...MISSION_POOL];
  const out = [];
  for (let i = 0; i < 3; i++) out.push(pool.splice((seed + i * 13) % pool.length, 1)[0]);
  return out;
}

function mProg(m) { return missionStats()[m.id.slice(2)] || 0; }

function claimMission(id) {
  const ms = S.missions = S.missions || {};
  if (ms[id]) return;
  const m = S._todayMissions.find(x => x.id === id);
  if (m && mProg(m) >= m.target) {
    ms[id] = true;
    gainCoins(m.reward);
    addLog(`✅ Misi harian selesai: ${m.text(m.target)} (+${fmt(m.reward)} koin).`, 'ok');
    save(); renderAll();
  }
}

function renderMissions() {
  const el = $('missions-list'); if (!el) return;
  S.missions = S.missions || {};
  S._todayMissions = missionDay();
  el.innerHTML = S._todayMissions.map(m => {
    const prog = Math.min(mProg(m), m.target);
    const done = prog >= m.target;
    const claimed = S.missions[m.id];
    return `<div class="item-row">
      <div><b>${m.text(m.target)}</b> ${claimed ? '<span class="muted" style="color:var(--ok)"> ✔ diklaim</span>' : ''}<br>
        <span class="muted">${fmt(prog)} / ${fmt(m.target)} — hadiah ${fmt(m.reward)} 🪙</span></div>
      ${done && !claimed ? `<button class="btn" onclick="claimMission('${m.id}')">Klaim</button>`
        : `<span class="muted">${claimed ? '🎉' : '⏳'}</span>`}
    </div>`;
  }).join('');
}

// ---------- Sleep / new day ----------
function sleep() {
  S.day++;
  S.energy = S.maxEnergy;
  S.missions = {}; S.mstats = undefined; // misi harian baru
  addLog('Kamu tidur di kabin. Energi penuh kembali — misi harian baru tersedia!');
  lbAdd(S.name, S.prestige, S.earned || 0, S.deepest); // snapshot harian ke leaderboard
  save(); renderAll();
}

// ---------- Market ----------
function sellPrice(art) {
  return Math.round(art.value * (1 + prestigeBonus()));
}
function sellItem(id, qty) {
  const art = ALL_ARTIFACTS.find(a => a.id === id);
  const have = S.inventory[id] || 0;
  const sell = Math.min(qty || have, have);
  if (!sell) return;
  S.inventory[id] -= sell;
  const gained = sellPrice(art) * sell;
  gainCoins(gained);
  missionStats().sold += sell; missionStats().earned += gained;
  addLog(`Menjual ${sell}× ${art.name} (+${fmt(gained)} koin).`);
  save(); renderAll();
}
function sellAll() {
  let total = 0, count = 0;
  for (const id in S.inventory) {
    const art = ALL_ARTIFACTS.find(a => a.id === id);
    total += sellPrice(art) * S.inventory[id];
    count += S.inventory[id];
    delete S.inventory[id];
  }
  if (total > 0) { gainCoins(total); missionStats().sold += count; missionStats().earned += total; addLog(`Menjual semua barang (+${fmt(total)} koin).`); }
  save(); renderAll();
}

// ---------- Upgrades ----------
function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  const cost = upgradeCost(u);
  if (S.coins < cost) { alert('Koin kurang.'); return; }
  S.coins -= cost;
  S.upgrades = S.upgrades || {};
  S.upgrades[id] = (S.upgrades[id] || 0) + 1;
  u.effect(S);
  addLog(`Upgrade: <b>${u.name}</b> — ${u.desc}.`);
  save(); renderAll();
}

// ---------- Rendering ----------
function renderAll() { renderStatus(); renderDive(); renderMarket(); renderUpgrades(); renderLog(); renderPrestige(); renderLeaderboard(); renderMissions(); }

function renderStatus() {
  $('st-name').textContent = S.name;
  $('st-coins').textContent = fmt(S.coins);
  $('st-energy').textContent = `${S.energy}/${S.maxEnergy}`;
  $('st-depth').textContent = fmt(S.deepest);
  $('st-day').textContent = S.day;
  $('st-prestige').textContent = `Lv.${S.prestige}`;
}

function renderPrestige() {
  const req = prestigeReq();
  const ok = canPrestige();
  $('prestige-box').innerHTML = `
    <div class="item-row">
      <div>Level sekarang: <b>Lv.${S.prestige}</b> — syarat berikutnya: <b>${fmt(req)} koin</b> (kamu punya ${fmt(S.coins)})</div>
      <button class="btn ${ok ? '' : 'secondary'}" onclick="doPrestige()" ${ok ? '' : 'disabled'}>Naik Level</button>
    </div>`;
}

function renderDive() {
  if (S._dive) return;
  const el = $('depth-options');
  el.innerHTML = ZONES.map(z => {
    const risk = z.depth > S.safeDepth;
    return `<div class="item-row">
      <div><b>${z.name}</b> <span class="muted">— ${z.depth} m</span>
        ${risk ? '<span class="muted" style="color:var(--danger)"> ⚠ di luar zona aman</span>' : ''}
        ${z.boss ? `<br><span class="muted" style="color:var(--danger)">☠ Boss: ${z.boss.name}</span>` : ''}</div>
      <button class="btn" onclick="startDive(${z.depth})">Selam</button>
    </div>`;
  }).join('') + `
  <div class="item-row"><div><b>💤 Tidur</b> <span class="muted">— hari baru, energi penuh</span></div>
    <button class="btn secondary" onclick="sleep()">Tidur</button></div>`;
}

function renderMarket() {
  const el = $('inventory');
  const rows = ALL_ARTIFACTS.filter(a => (S.inventory[a.id] || 0) > 0)
    .map(a => `<div class="item-row">
      <div><b>${a.name}</b> ×${S.inventory[a.id]} <span class="muted">(${fmt(a.value)} 🪙/pc)</span></div>
      <button class="btn secondary" onclick="sellItem('${a.id}')">Jual</button>
    </div>`);
  el.innerHTML = rows.length ? rows.join('') : '<p class="muted">Tas kosong. Turunlah dan bawa sesuatu naik.</p>';
}

function renderUpgrades() {
  $('upgrades-list').innerHTML = UPGRADES.map(u => {
    const lvl = S.upgrades?.[u.id] || 0;
    const cost = upgradeCost(u);
    return `<div class="item-row">
      <div><b>${u.name}</b> <span class="muted">Lv.${lvl}</span><br><span class="muted">${u.desc}</span></div>
      <button class="btn" onclick="buyUpgrade('${u.id}')" ${S.coins < cost ? 'disabled' : ''}>${fmt(cost)} 🪙</button>
    </div>`;
  }).join('');
}

function renderLog() {
  $('log-list').innerHTML = S.log.map(l =>
    `<div class="log-entry"><b>Hari ${l.day}</b> — ${l.text}</div>`).join('');
}

// ---------- Ekspor / Impor save (JSON) ----------
function exportSave() {
  const data = { abisal: 1, exported: new Date().toISOString(), save: S, leaderboard: lbGet() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `abisal_save_${(S.name || 'penyelam').replace(/[^a-z0-9_-]+/gi, '_')}_${S.day}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  addLog('Data selam diekspor ke file JSON.', 'ok');
  renderAll();
}

function importSave(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const ns = data.save || data; // terima file ekspor ABISAL atau state mentah
      if (!ns || typeof ns !== 'object' || typeof ns.coins !== 'number' || !Array.isArray(ns.log)) {
        throw new Error('struktur tidak dikenal');
      }
      S = ns;
      if (Array.isArray(data.leaderboard)) {
        localStorage.setItem(LB_KEY, JSON.stringify(data.leaderboard.slice(0, 20)));
      }
      addLog(`Data selam diimpor${data.exported ? ` (ekspor ${data.exported.slice(0, 10)})` : ''}. Selamat kembali, ${S.name}.`);
      save(); renderAll();
    } catch (e) {
      alert('File tidak valid: ' + e.message);
    }
  };
  reader.readAsText(file);
}

// ---------- Boot ----------
function newGame() {
  if (S && !confirm('Mulai ulang? Progress lama akan hilang.')) return;
  const name = prompt('Nama penyelammu:', S?.name || 'Penyelam');
  if (!name) return;
  S = defaultState(name);
  addLog('Kamu tiba di Pelabuhan Gelap dengan setelan tua dan 50 koin.');
  save(); renderAll();
}

$('btn-newgame').onclick = newGame;
$('sell-all').onclick = sellAll;
$('btn-export').onclick = exportSave;
$('btn-import').onclick = () => $('import-file').click();
$('import-file').onchange = e => { if (e.target.files[0]) { importSave(e.target.files[0]); e.target.value = ''; } };
document.querySelectorAll('#tabs button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('#tabs button').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $('tab-' + b.dataset.tab).classList.add('active');
  };
});

load();
if (!S) {
  S = defaultState('Penyelam');
  addLog('Kamu tiba di Pelabuhan Gelap dengan setelan tua dan 50 koin.');
  save();
}
renderAll();
cloudCheck();
