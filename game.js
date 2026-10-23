// ============================================================
// ABISAL — game penyelam laut dalam (text-based)
// Save: localStorage | DB-ready: lihat schema.sql (Postgres)
// ============================================================

const SAVE_KEY = 'abisal_save_v1';

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

const ZONES = [
  { name: 'Dangkalan Matahari', depth: 30 },
  { name: 'Reruntuhan Amfora', depth: 80 },
  { name: 'Lorong Kapal Karam', depth: 160 },
  { name: 'Palung Sisa', depth: 300 },
  { name: 'Zona Abisal', depth: 500 },
];

const UPGRADES = [
  { id: 'tank',   name: 'Tangki Oksigen',  desc: '+25 energi maks',           baseCost: 100, growth: 1.8, effect: s => s.maxEnergy += 25 },
  { id: 'suit',   name: 'Setelan Tekanan', desc: '+40 m kedalaman aman',      baseCost: 150, growth: 1.9, effect: s => s.safeDepth += 40 },
  { id: 'lamp',   name: 'Lampu Abisal',    desc: '+10% peluang temuan bagus', baseCost: 200, growth: 2.0, effect: s => s.luck += 0.10 },
  { id: 'tool',   name: 'Alat Angkat',     desc: '+1 temuan per selam',       baseCost: 400, growth: 2.2, effect: s => s.findsPerDive += 1 },
  { id: 'reel',   name: 'Neraca Naik',     desc: 'Naik lebih aman (-15% risiko)', baseCost: 350, growth: 2.1, effect: s => s.safety += 0.15 },
];

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
    log: [],
    prestige: 0,
  };
}

function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }
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

function upgradeCost(u) {
  const level = S.upgrades?.[u.id] || 0;
  return Math.round(u.baseCost * Math.pow(u.growth, level));
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

function diveTick() {
  const d = S._dive; if (!d) return;
  d.progress += Math.min(d.targetDepth, 10 + Math.floor(Math.random() * 15));
  S.deepest = Math.max(S.deepest, d.progress);

  // chance of event each tick
  if (Math.random() < 0.35) {
    if (Math.random() < (0.45 + S.luck)) {
      showEvent(rnd(EVENTS_GOOD), 'good');
    } else {
      showEvent(rnd(EVENTS_BAD), 'bad');
      S.energy = Math.max(0, S.energy - 15);
      if (S.energy <= 0) return finishDive(true);
    }
  }
  renderDiveFrame();
}

function collectFind() {
  const d = S._dive; if (!d) return;
  const pool = ARTIFACTS.filter(a => a.minDepth <= d.progress);
  if (!pool.length) return;
  const pick = pool[pool.length - 1 - (Math.random() < S.luck / 2 ? 1 : 0)] || pool[pool.length - 1];
  const art = rnd(pool.filter(a => a.minDepth >= d.progress * 0.5)) || pick;
  d.finds.push(art.id);
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

// ---------- Sleep / new day ----------
function sleep() {
  S.day++;
  S.energy = S.maxEnergy;
  addLog('Kamu tidur di kabin. Energi penuh kembali.');
  save(); renderAll();
}

// ---------- Market ----------
function sellItem(id, qty) {
  const art = ARTIFACTS.find(a => a.id === id);
  const have = S.inventory[id] || 0;
  const sell = Math.min(qty || have, have);
  if (!sell) return;
  S.inventory[id] -= sell;
  S.coins += art.value * sell;
  addLog(`Menjual ${sell}× ${art.name} (+${fmt(art.value * sell)} koin).`);
  save(); renderAll();
}
function sellAll() {
  let total = 0;
  for (const id in S.inventory) {
    const art = ARTIFACTS.find(a => a.id === id);
    total += art.value * S.inventory[id];
    delete S.inventory[id];
  }
  if (total > 0) { S.coins += total; addLog(`Menjual semua barang (+${fmt(total)} koin).`); }
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
function renderAll() { renderStatus(); renderDive(); renderMarket(); renderUpgrades(); renderLog(); }

function renderStatus() {
  $('st-name').textContent = S.name;
  $('st-coins').textContent = fmt(S.coins);
  $('st-energy').textContent = `${S.energy}/${S.maxEnergy}`;
  $('st-depth').textContent = fmt(S.deepest);
  $('st-day').textContent = S.day;
}

function renderDive() {
  if (S._dive) return;
  const el = $('depth-options');
  el.innerHTML = ZONES.map(z => {
    const risk = z.depth > S.safeDepth;
    return `<div class="item-row">
      <div><b>${z.name}</b> <span class="muted">— ${z.depth} m</span>
        ${risk ? '<span class="muted" style="color:var(--danger)"> ⚠ di luar zona aman</span>' : ''}</div>
      <button class="btn" onclick="startDive(${z.depth})">Selam</button>
    </div>`;
  }).join('') + `
  <div class="item-row"><div><b>💤 Tidur</b> <span class="muted">— hari baru, energi penuh</span></div>
    <button class="btn secondary" onclick="sleep()">Tidur</button></div>`;
}

function renderMarket() {
  const el = $('inventory');
  const rows = ARTIFACTS.filter(a => (S.inventory[a.id] || 0) > 0)
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
