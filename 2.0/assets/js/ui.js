/* =========================================================
 * COCONUT WARS 2.0 — 介面渲染 + 結算動畫
 * ========================================================= */
import { ISLANDS, IMG_BASE, RULES, DEFAULT_TEAMS, DEFAULT_ROUNDS } from './config.js';
import { GAME, garrisonTotal, teamTotalTroops, isHarvest, isFinalRound, sourcesForTeam, ownIslands } from './state.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LOC_ALIAS = (() => {
  const m = {};
  for (const i of ISLANDS) { m[i.label] = i.id; m[i.id] = i.id; }
  for (const a of ['B', 'b', '兵營', '營', 'barracks']) m[a] = 'B';
  return m;
})();
const resolveLoc = tok => LOC_ALIAS[String(tok).trim()] ?? null;

// ---------------------------------------------------------
// 設定畫面
// ---------------------------------------------------------
export function renderSetup(root, onStart) {
  root.innerHTML = '';
  root.className = '';
  const wrap = el('div', 'setup');
  wrap.appendChild(el('h1', 'title', '🥥 COCONUT WARS 2.0'));
  wrap.appendChild(el('p', 'subtitle', '開墾版 · 工作人員後台系統'));

  const card = el('div', 'card');
  card.innerHTML = `
    <h2>① 基本設定</h2>
    <div class="row">
      <label>小隊數量 <input id="numTeams" type="number" min="2" max="10" value="${DEFAULT_TEAMS}"></label>
      <label>回合數量 <input id="numRounds" type="number" min="1" max="8" value="${DEFAULT_ROUNDS}"></label>
    </div>
    <p class="hint">小隊編號為 0 ~ 小隊數-1。指令：開墾 / 移動 / 攻擊。每回合 2 島豐收 ×1.5，最後一回合全島大豐收。</p>
    <button id="genBtn" class="btn primary">產生島嶼分配表 ▸</button>`;
  wrap.appendChild(card);

  const assignCard = el('div', 'card hidden'); assignCard.id = 'assignCard';
  wrap.appendChild(assignCard);
  root.appendChild(wrap);

  $('#genBtn', wrap).onclick = () => {
    const numTeams = clamp(+$('#numTeams').value, 2, 10);
    const numRounds = clamp(+$('#numRounds').value, 1, 8);
    renderAssign(assignCard, numTeams, numRounds, onStart);
    assignCard.classList.remove('hidden');
    assignCard.scrollIntoView({ behavior: 'smooth' });
  };
}

function renderAssign(card, numTeams, numRounds, onStart) {
  const teamOpts = ['<option value="">（中立）</option>'];
  for (let i = 0; i < numTeams; i++) teamOpts.push(`<option value="${i}">${i} 隊</option>`);

  let islandRows = '';
  for (const isl of ISLANDS) {
    islandRows += `
      <div class="assign-item ${isl.type}">
        <img src="${IMG_BASE}${isl.img}" alt="">
        <span class="ai-label">${isl.label}</span>
        <select data-island="${isl.id}">${teamOpts.join('')}</select>
      </div>`;
  }
  let totalRows = '';
  for (let i = 0; i < numTeams; i++) {
    totalRows += `<label class="total-item">${i} 隊 總兵力
      <input type="number" data-total="${i}" min="0" step="100" value="3000"></label>`;
  }

  card.innerHTML = `
    <h2>② 島嶼歸屬（大地遊戲結束時的佔領狀態）</h2>
    <div class="assign-grid">${islandRows}</div>
    <h2>③ 各隊累積總兵力</h2>
    <p class="hint">大島擁有者島上自動 +${RULES.BIG_ISLAND_TROOPS} 駐軍、小島 +${RULES.SMALL_ISLAND_TROOPS}；其餘放入專屬兵營。</p>
    <div class="total-grid">${totalRows}</div>
    <button id="startBtn" class="btn primary big">🏝️ 開始遊戲</button>`;

  $('#startBtn', card).onclick = () => {
    const ownership = {};
    card.querySelectorAll('select[data-island]').forEach(s => { if (s.value !== '') ownership[s.dataset.island] = +s.value; });
    const totals = {};
    card.querySelectorAll('input[data-total]').forEach(inp => { totals[+inp.dataset.total] = +inp.value || 0; });
    onStart({ numTeams, numRounds, ownership, totals });
  };
}

// ---------------------------------------------------------
// 遊戲主畫面
// ---------------------------------------------------------
export function renderGame(root, opts = {}) {
  const view = opts.view || 'control';
  root.innerHTML = '';
  root.className = `app-shell view-${view}`;

  const harvestTxt = isFinalRound()
    ? '<span class="tag harvest">🌾 最後一回合 · 全島大豐收 ×1.5</span>'
    : `<span class="tag harvest">🌾 本回合豐收：${GAME.harvest.map(id => GAME.locations[id].label).join('、')}（×1.5）</span>`;

  const bar = el('div', 'topbar');
  const rightBtns = view === 'control'
    ? `<button id="displayBtn" class="btn ghost">🖥️ 開啟播放視窗</button>
       <button id="settleBtn" class="btn primary">結算本回合 ▸</button>`
    : '<span class="tag open">播放視窗</span>';
  bar.innerHTML = `
    <div class="tb-left">🥥 <b>COCONUT WARS 2.0</b>${view === 'display' ? ' · 戰況直播' : ' · 主控台'}</div>
    <div class="tb-mid">第 <b>${GAME.round}</b> / ${GAME.numRounds} 回合 ${harvestTxt}</div>
    <div class="tb-right">${rightBtns}</div>`;
  root.appendChild(bar);

  const layout = el('div', 'layout');
  const board = el('div', 'board'); board.id = 'board';
  const side = el('div', 'sidebar'); side.id = 'sidebar';
  layout.appendChild(board); layout.appendChild(side);
  root.appendChild(layout);

  renderBoard(board);
  renderSidebar(side, view);
  requestAnimationFrame(fitOcean);

  if (view === 'control') {
    $('#settleBtn', bar).onclick = opts.onSettle;
    const db = $('#displayBtn', bar); if (db) db.onclick = opts.onOpenDisplay;
  }
}

export function renderWaiting(root) {
  root.innerHTML = '';
  root.className = 'app-shell';
  const w = el('div', 'waiting');
  w.innerHTML = `<div class="waiting-inner"><div class="wait-emoji">🏝️</div>
    <h1 class="title">COCONUT WARS 2.0 戰況直播</h1>
    <p class="subtitle">等待主控端開始遊戲…</p></div>`;
  root.appendChild(w);
}

// 海洋維持可用空間，左右有餘裕就拉寬
const MAX_OCEAN_ASPECT = 1.6;
const ISLAND_ZONE = 0.68;
function fitOcean() {
  const board = document.getElementById('board'); if (!board) return;
  const ocean = board.querySelector('.ocean'); if (!ocean) return;
  const bh = board.clientHeight, bw = board.clientWidth;
  let h = Math.max(240, bh);
  let w = Math.min(bw, h * MAX_OCEAN_ASPECT);
  if (w < h) h = w;
  ocean.style.width = Math.round(w) + 'px';
  ocean.style.height = Math.round(h) + 'px';
  ocean.style.setProperty('--u', Math.round(h) + 'px');
}
let _fitBound = false;
(function bindFit() { if (_fitBound) return; _fitBound = true; window.addEventListener('resize', () => requestAnimationFrame(fitOcean)); })();

function renderBoard(board) {
  board.innerHTML = '<div class="ocean"></div>';
  const ocean = $('.ocean', board);
  for (const isl of ISLANDS) {
    const loc = GAME.locations[isl.id];
    const total = garrisonTotal(loc);
    const owner = loc.owner != null ? GAME.teams[loc.owner] : null;
    const harvest = isHarvest(isl.id);

    const node = el('div', `island ${loc.type}${harvest ? ' harvest' : ''}`);
    node.id = `isl-${isl.id}`;
    node.style.left = isl.x + '%';
    node.style.top = (isl.y * ISLAND_ZONE + 2).toFixed(2) + '%';
    node.style.setProperty('--owner', owner ? owner.color : '#9fb6c2');

    const ownerTxt = owner ? `${owner.id}隊 · ⚔${total}` : '空島';
    const cultTxt = loc.cult ? `<span class="isl-cult">🌴+${loc.cult}</span>` : '';
    const garrDetail = Object.entries(loc.garrison)
      .map(([t, n]) => `<span style="color:${GAME.teams[t].color}">${t}隊 ${n}</span>`).join('　') || '—';

    node.innerHTML = `
      ${harvest ? '<div class="harvest-badge">🌾×1.5</div>' : ''}
      <img src="${IMG_BASE}${loc.img}" alt="${loc.label}" draggable="false">
      <div class="isl-tag">${loc.label}</div>
      <div class="isl-owner"><span class="dot" style="background:${owner ? owner.color : '#cfd8dc'}"></span>${ownerTxt}${cultTxt}</div>
      <div class="isl-pop"><b>${loc.label}</b> · ${loc.type === 'big' ? '大島' : '小島'}
        ${loc.cult ? `· 開墾 +${loc.cult}/回合` : ''}<br>駐軍：${garrDetail}</div>`;
    ocean.appendChild(node);
  }
  ocean.appendChild(renderBeach());
}

function renderBeach() {
  const beach = el('div', 'beach');
  beach.innerHTML = '<div class="beach-label">🏕️ 專屬兵營</div>';
  const row = el('div', 'hut-row');
  for (let i = 0; i < GAME.numTeams; i++) {
    const t = GAME.teams[i];
    const hut = el('div', 'hut'); hut.id = `brk-${i}`;
    hut.style.setProperty('--c', t.color);
    hut.innerHTML = `<div class="hut-roof"></div>
      <div class="hut-body"><span class="hut-team">${i}</span><span class="hut-troops">⚔${t.barracks}</span></div>`;
    row.appendChild(hut);
  }
  beach.appendChild(row);
  return beach;
}

function renderSidebar(side, view = 'control') {
  side.innerHTML = '';
  const rank = el('div', 'panel');
  rank.appendChild(el('h3', null, '🏆 椰子排行'));
  rank.appendChild(rankTable());
  side.appendChild(rank);

  if (view === 'control') {
    const cmd = el('div', 'panel');
    cmd.appendChild(el('h3', null, '🎮 回合指令'));
    const teamSel = el('select', 'team-select');
    for (let i = 0; i < GAME.numTeams; i++) {
      const o = el('option', null, `${i} 隊　（兵營 ${GAME.teams[i].barracks}）`); o.value = i; teamSel.appendChild(o);
    }
    cmd.appendChild(teamSel);
    const builder = el('div', 'builder'); cmd.appendChild(builder);
    const listBox = el('div', 'cmd-list'); cmd.appendChild(listBox);
    side.appendChild(cmd);
    const refresh = () => { renderBuilder(builder, +teamSel.value, refresh); renderCmdList(listBox, +teamSel.value, refresh); };
    teamSel.onchange = refresh; refresh();
  }

  if (GAME.log && GAME.log.round) {
    const logp = el('div', 'panel');
    logp.appendChild(el('h3', null, `📜 第 ${GAME.log.round} 回合結算`));
    logp.appendChild(renderLog(GAME.log));
    side.appendChild(logp);
  }
}

function rankTable() {
  const t = el('table', 'rank-table');
  const rows = Object.values(GAME.teams).map(tm => ({ tm, total: teamTotalTroops(tm.id) })).sort((a, b) => b.tm.coconuts - a.tm.coconuts);
  t.innerHTML = '<tr><th>#</th><th>隊</th><th>🥥椰子</th><th>總兵力</th></tr>';
  rows.forEach((r, i) => {
    const tr = el('tr');
    tr.innerHTML = `<td>${i + 1}</td><td><span class="dot" style="background:${r.tm.color}"></span>${r.tm.id}隊</td>
      <td><b>${r.tm.coconuts}</b></td><td>${r.total}</td>`;
    t.appendChild(tr);
  });
  return t;
}

// --- 指令建構器（選 + 打 並存）---------------------------
const CMD_META = {
  cultivate: { fmt: '出發, 己方島, 兵力', ex: '兵營, 大島1, 300' },
  move:      { fmt: '出發, 目的(己方), 兵力', ex: '兵營, 大島1, 300' },
  attack:    { fmt: '出發, 目標, 兵力', ex: '兵營, 大島2, 300' },
};

function renderBuilder(box, teamId, onAdd) {
  const srcList = sourcesForTeam(teamId).map(s => `${s.label}(${s.troops})`).join('、');
  box.innerHTML = `
    <div class="templates">
      <button data-tpl="cultivate" class="btn tpl">🌱 開墾</button>
      <button data-tpl="move" class="btn tpl">🚶 移動</button>
      <button data-tpl="attack" class="btn tpl">⚔️ 攻擊</button>
    </div>
    <div id="cmdForm" class="cmd-form hidden"></div>
    <details class="ref"><summary>📖 可用名稱參考</summary>
      <div class="ref-body">
        <b>出發地(此隊)：</b>${srcList}<br>
        <b>島嶼：</b>大島1~5、小島1~7　<b>兵營：</b>輸入「兵營」或「B」<br>
        <b>開墾：</b>每 100 兵 → 該島每回合永久 +${RULES.CULTIVATE_PER_100} 椰子（島被搶走時加成隨島留給新主人）
      </div>
    </details>`;

  box.querySelectorAll('.tpl').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.tpl, m = CMD_META[type];
      const form = $('#cmdForm', box);
      form.classList.remove('hidden');
      form.innerHTML = `
        <div class="form-title"><b>${type}</b>　格式：<code>${m.fmt}</code></div>
        <div class="mode-pick"><div class="mode-cap">🖱️ 用選的</div>${selectorForm(type, teamId)}
          <button class="btn primary add-sel">＋ 加入</button></div>
        <div class="mode-type"><div class="mode-cap">⌨️ 或用打的</div>
          <div class="type-row"><input class="cmd-typed" type="text" placeholder="例：${m.ex}">
            <button class="btn primary add-typed">＋ 加入</button></div></div>
        <div class="flash"></div>`;
      const push = res => { if (res.error) { flash(form, res.error); return; } GAME.pending[teamId].push(res.cmd); onAdd(); };
      $('.add-sel', form).onclick = () => push(collectSelector(type, form, teamId));
      const input = $('.cmd-typed', form);
      $('.add-typed', form).onclick = () => push(parseCommand(type, input.value, teamId));
      input.onkeydown = e => { if (e.key === 'Enter') push(parseCommand(type, input.value, teamId)); };
    };
  });
}

function selectorForm(type, teamId) {
  const srcOpts = sourcesForTeam(teamId).map(s => `<option value="${s.key}">${s.label}（${s.troops}）</option>`).join('');
  const own = ownIslands(teamId).map(i => `<option value="${i.id}">${i.label}</option>`).join('');
  const enemy = ISLANDS.filter(i => GAME.locations[i.id].owner !== teamId).map(i => `<option value="${i.id}">${i.label}</option>`).join('');
  const nInput = (min, val) => `<input name="n" type="number" step="100" min="${min}" value="${val}">`;

  if (type === 'cultivate') return `<div class="frow">
    <label>出發 <select name="S">${srcOpts}</select></label>
    <label>己方島 <select name="E">${own || '<option value="">（無己方島）</option>'}</select></label>
    <label>兵力 ${nInput(100, 300)}</label></div>`;
  if (type === 'move') return `<div class="frow">
    <label>出發 <select name="S">${srcOpts}</select></label>
    <label>目的 <select name="E"><option value="B">${teamId}隊 兵營</option>${own}</select></label>
    <label>兵力 ${nInput(100, 100)}</label></div>`;
  if (type === 'attack') return `<div class="frow">
    <label>出發 <select name="S">${srcOpts}</select></label>
    <label>目標 <select name="E">${enemy}</select></label>
    <label>兵力 ${nInput(300, 300)}</label></div>`;
  return '';
}

function collectSelector(type, form, teamId) {
  const scope = form.querySelector('.mode-pick');
  const g = name => { const e = scope.querySelector(`[name="${name}"]`); return e ? e.value : ''; };
  const cmd = { type, S: g('S') || null, E: g('E') || null, n: +g('n') || 0, team: teamId };
  const err = validateCmd(cmd, teamId);
  return err ? { error: err } : { cmd };
}

function parseCommand(type, text, teamId) {
  const toks = String(text).replace(/[()（）\[\]]/g, ' ').split(/[,，\s]+/).filter(Boolean);
  if (toks.length < 3) return { error: `格式：${CMD_META[type].fmt}` };
  const S = resolveLoc(toks[0]), E = resolveLoc(toks[1]), n = +toks[2];
  if (!S) return { error: `找不到出發地「${toks[0]}」` };
  if (!E) return { error: `找不到目標「${toks[1]}」` };
  const cmd = { type, S, E, n, team: teamId };
  const err = validateCmd(cmd, teamId);
  return err ? { error: err } : { cmd };
}

function validateCmd(c, teamId) {
  if (GAME.pending[teamId].length >= 3) return '每回合最多 3 個指令';
  if (!c.n || c.n % RULES.STEP) return '兵力須為 100 的倍數';
  if (c.type === 'attack') {
    if (c.n < RULES.MIN_ATTACK) return `進攻最低 ${RULES.MIN_ATTACK} 兵`;
    if (GAME.locations[c.E]?.owner === teamId) return '不能攻擊自己的島';
  }
  if (c.type === 'cultivate' && GAME.locations[c.E]?.owner !== teamId) return '只能開墾自己的島';
  if (c.type === 'move' && c.E !== 'B' && GAME.locations[c.E]?.owner !== teamId) return '只能移動到自己的島或兵營';
  return null;
}

function renderCmdList(box, teamId, onChange) {
  const list = GAME.pending[teamId];
  box.innerHTML = `<div class="cl-head">已提交 ${list.length}/3</div>`;
  list.forEach((c, i) => {
    const item = el('div', 'cl-item');
    item.innerHTML = `<span>${cmdText(c)}</span><button class="del" data-i="${i}">✕</button>`;
    box.appendChild(item);
  });
  box.querySelectorAll('.del').forEach(b => { b.onclick = () => { GAME.pending[teamId].splice(+b.dataset.i, 1); onChange(); }; });
}

function cmdText(c) {
  const L = k => k === 'B' ? '兵營' : (GAME.locations[k]?.label || k);
  if (c.type === 'cultivate') return `🌱 開墾 ${L(c.S)}→${L(c.E)} ${c.n}`;
  if (c.type === 'move') return `🚶 移動 ${L(c.S)}→${L(c.E)} ${c.n}`;
  if (c.type === 'attack') return `⚔️ 攻擊 ${L(c.S)}→${L(c.E)} ${c.n}`;
  return c.type;
}

function renderLog(log) {
  const box = el('div', 'log');
  const sec = (title, arr) => { if (!arr.length) return; box.appendChild(el('div', 'log-h', title)); arr.forEach(t => box.appendChild(el('div', 'log-line', t))); };
  sec('🌱 開墾階段', log.cultivate);
  sec('🚶 移動階段', log.move);
  sec('⚔️ 攻擊階段', log.attack);
  sec('🥥 資源發放', log.resource);
  sec('📌 其他判定', log.notes);
  if (!log.cultivate.length && !log.move.length && !log.attack.length && !log.notes.length)
    box.appendChild(el('div', 'log-line', '本回合無任何操作。'));
  return box;
}

// ---------------------------------------------------------
// 結算動畫
// ---------------------------------------------------------
export async function playSettlement(log) {
  const events = log.events || [];
  const notes = log.notes || [];
  const overlay = el('div', 'anim-overlay');
  const banner = el('div', 'phase-banner');
  const feed = el('div', 'anim-feed');
  feed.innerHTML = '<div class="feed-title">📢 結算實況</div><div class="feed-body"></div>';
  overlay.appendChild(banner); overlay.appendChild(feed);
  document.body.appendChild(overlay);
  const feedBody = feed.querySelector('.feed-body');

  const phases = [
    { key: 'cultivate', label: '🌱 開墾階段', color: '#3cb371' },
    { key: 'move', label: '🚶 移動階段', color: '#2a9df4' },
    { key: 'attack', label: '⚔️ 攻擊階段', color: '#ff6f61' },
    { key: 'resource', label: '🥥 資源結算', color: '#ffc23c' },
  ];
  const feedLines = {
    cultivate: log.cultivate || [],
    move: log.move || [],
    attack: (log.attack || []).concat(notes),
    resource: log.resource || [],
  };

  let any = false;
  for (const ph of phases) {
    const evs = events.filter(e => e.phase === ph.key);
    const lines = feedLines[ph.key] || [];
    if (!evs.length && !lines.length) continue;
    any = true;
    await showBanner(banner, ph.label, ph.color);
    appendFeed(feedBody, ph.label, lines, ph.color);
    await playPhase(overlay, ph.key, evs);
    await sleep(650);
  }
  if (!any) { appendFeed(feedBody, '本回合無任何操作', [], '#0b6e99'); await sleep(600); }

  await showBanner(banner, '✅ 結算完成', '#0b6e99');
  await sleep(1600);
  overlay.remove();
}

function appendFeed(feedBody, title, lines, color) {
  const grp = el('div', 'feed-group');
  grp.innerHTML = `<div class="feed-h" style="color:${color}">${title}</div>`;
  (lines.length ? lines : ['—']).forEach(t => grp.appendChild(el('div', 'feed-line', t)));
  feedBody.appendChild(grp);
  void grp.offsetWidth; grp.classList.add('show');
  feedBody.scrollTop = feedBody.scrollHeight;
}

async function showBanner(banner, text, color) {
  banner.textContent = text; banner.style.background = color;
  banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
  await sleep(1200);
}

async function playPhase(overlay, key, evs) {
  if (key === 'resource') {
    for (const e of evs) riseCoconut(overlay, e.at, e.coconut, e.harvest);
    await sleep(1900); return;
  }
  if (key === 'attack') {
    const swords = evs.filter(e => e.kind === 'sword');
    const clashes = evs.filter(e => e.kind === 'clash');
    await travelTokens(overlay, swords, 'sword');
    await sleep(200);
    for (const c of clashes) burst(overlay, c.at);
    await sleep(1600); return;
  }
  await travelTokens(overlay, evs, key === 'cultivate' ? 'seed' : 'person');
}

async function travelTokens(overlay, evs, kind) {
  if (!evs.length) return;
  evs.forEach((e, i) => setTimeout(() => moveToken(overlay, e, kind), i * 240));
  await sleep(evs.length * 240 + 1500);
}
function centerOf(id) { const n = document.getElementById(id); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function moveToken(overlay, e, kind) {
  const from = centerOf(e.from), to = centerOf(e.to); if (!from || !to) return;
  const color = GAME.teams[e.team]?.color || '#fff';
  const icon = kind === 'seed' ? '🌱' : kind === 'sword' ? '⚔️' : '🏃';
  const tok = el('div', 'token'); tok.style.setProperty('--c', color);
  tok.innerHTML = `<span class="tok-icon">${icon}</span><b>${e.n}</b>`;
  tok.style.left = from.x + 'px'; tok.style.top = from.y + 'px';
  overlay.appendChild(tok); void tok.offsetWidth;
  tok.style.left = to.x + 'px'; tok.style.top = to.y + 'px'; tok.style.opacity = '1';
  setTimeout(() => { tok.style.opacity = '0'; tok.style.transform = 'translate(-50%,-50%) scale(.4)'; }, 1350);
  setTimeout(() => tok.remove(), 1750);
}
function burst(overlay, at) {
  const c = centerOf(at); if (!c) return;
  const b = el('div', 'clash', '💥'); b.style.left = c.x + 'px'; b.style.top = c.y + 'px';
  overlay.appendChild(b); void b.offsetWidth; b.classList.add('show');
  setTimeout(() => b.remove(), 1000);
}
function riseCoconut(overlay, at, coconut, harvest) {
  const c = centerOf(at); if (!c) return;
  const r = el('div', 'coconut-rise' + (harvest ? ' harvest' : ''));
  r.innerHTML = `🥥+${coconut}${harvest ? ' 🌾' : ''}`;
  r.style.left = c.x + 'px'; r.style.top = c.y + 'px';
  overlay.appendChild(r); void r.offsetWidth; r.classList.add('show');
  setTimeout(() => r.remove(), 1400);
}

// ---------------------------------------------------------
export function renderFinal(root) {
  root.innerHTML = ''; root.className = '';
  const wrap = el('div', 'final');
  wrap.appendChild(el('h1', 'title', '🏁 最終排名'));
  const rows = Object.values(GAME.teams).sort((a, b) => b.coconuts - a.coconuts);
  const podium = el('div', 'podium');
  rows.forEach((tm, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    const row = el('div', 'final-row'); row.style.borderColor = tm.color;
    row.innerHTML = `<span class="fr-medal">${medal}</span><span class="dot" style="background:${tm.color}"></span>
      <span class="fr-name">${tm.id} 隊</span><span class="fr-score">🥥 ${tm.coconuts}</span>`;
    podium.appendChild(row);
  });
  wrap.appendChild(podium);
  const btn = el('button', 'btn primary big', '🔄 重新開始'); btn.onclick = () => location.reload();
  wrap.appendChild(btn); root.appendChild(wrap);
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v || a)); }
function flash(node, msg) {
  let f = node.querySelector('.flash');
  if (!f) { f = el('div', 'flash'); node.appendChild(f); }
  f.textContent = '⚠️ ' + msg; f.classList.add('show');
  setTimeout(() => f.classList.remove('show'), 2600);
}
