/* =========================================================
 * COCONUT WARS 3.0 — 介面渲染 + 結算動畫
 * ========================================================= */
import { ISLANDS, IMG_BASE, RULES, DEFAULT_TEAMS, DEFAULT_ROUNDS } from './config.js';
import { GAME, garrisonTotal, teamTotalTroops, isHarvest, isFinalRound, sourcesForTeam, ownIslands, islandYield, loadState, canRollback, saveGame, clearSavedGame } from './state.js';
import { decodeCode } from './code.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const COCO = '<img class="coco-ic" src="assets/img/coconut.png" alt="椰子">';

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
  wrap.appendChild(el('h1', 'title', `${COCO} COCONUT WARS 3.0`));
  wrap.appendChild(el('p', 'subtitle', '訓練版 · 工作人員後台系統'));
  wrap.appendChild(el('div', 'setup-hero',
    '<img class="hero-bird" src="assets/img/bird-run.png" alt=""><img class="hero-coco" src="assets/img/coconut.png" alt="">'));

  const card = el('div', 'card');
  card.innerHTML = `
    <h2>① 基本設定</h2>
    <div class="row">
      <label>小隊數量 <input id="numTeams" type="number" min="2" max="10" value="${DEFAULT_TEAMS}"></label>
      <label>回合數量 <input id="numRounds" type="number" min="1" max="8" value="${DEFAULT_ROUNDS}"></label>
    </div>
    <p class="hint">小隊編號為 0 ~ 小隊數-1。指令：移動 / 攻擊（訓練每回合自動）。每回合 2 島豐收 ×1.5，最後一回合全島大豐收。</p>
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
  for (let i = 0; i < numTeams; i++) teamOpts.push(`<option value="${i}">${i} 小</option>`);

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
    totalRows += `<label class="total-item">${i} 小 總兵力
      <input type="number" data-total="${i}" min="0" step="100" value="3000"></label>`;
  }
  let bonusRows = '';
  for (let i = 0; i < numTeams; i++) {
    bonusRows += `<label class="total-item">${i} 小 特殊獎勵
      <input type="number" data-bonus-team="${i}" min="0" step="100" value="0"></label>`;
  }

  card.innerHTML = `
    <h2>② 島嶼歸屬（大地遊戲結束時的佔領狀態）</h2>
    <div class="assign-grid">${islandRows}</div>
    <h2>③ 各隊累積總兵力</h2>
    <p class="hint">總兵力<b>全數放入兵營</b>；每座己方島嶼<b>額外 +${RULES.INIT_ISLAND_TROOPS} 駐軍</b>（大小島皆同、不從總兵力扣）。訓練每回合自動（兵營每滿 ${RULES.TRAIN_UNIT} +${RULES.TRAIN_GAIN}）；島上守軍不足 ${RULES.MIN_GARRISON} 會強制中立。</p>
    <div class="total-grid">${totalRows}</div>
    <h2>④ 特殊小隊獎勵</h2>
    <p class="hint">可自行輸入各隊<b>額外椰子數</b>（0 表示沒有）。此獎勵<b>全程隱藏</b>，直到最終排名按下「揭曉特殊獎勵」才加上。</p>
    <div class="total-grid">${bonusRows}</div>
    <button id="startBtn" class="btn primary big">🏝️ 開始遊戲</button>`;

  $('#startBtn', card).onclick = () => {
    const ownership = {};
    card.querySelectorAll('select[data-island]').forEach(s => { if (s.value !== '') ownership[s.dataset.island] = +s.value; });
    const totals = {};
    card.querySelectorAll('input[data-total]').forEach(inp => { totals[+inp.dataset.total] = +inp.value || 0; });
    const bonuses = {};
    card.querySelectorAll('input[data-bonus-team]').forEach(inp => { bonuses[+inp.dataset.bonusTeam] = +inp.value || 0; });
    onStart({ numTeams, numRounds, ownership, totals, bonuses });
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
  const rollbackBtn = (view === 'control' && canRollback())
    ? '<button id="rollbackBtn" class="btn warn" title="捨棄本次結算、回到上一回合指令畫面（指令保留可改）">⏪ 退回上一回合</button>'
    : '';
  const rightBtns = view === 'control'
    ? `${rollbackBtn}<button id="displayBtn" class="btn ghost">🖥️ 開啟播放視窗</button>
       <button id="settleBtn" class="btn primary">結算本回合 ▸</button>`
    : '<span class="tag open">播放視窗</span>';
  bar.innerHTML = `
    <div class="tb-left">${COCO} <b>COCONUT WARS 3.0</b>${view === 'display' ? ' · 戰況直播' : ' · 主控台'}</div>
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
    const rb = $('#rollbackBtn', bar); if (rb) rb.onclick = opts.onRollback;
  }
}

// 重新整理補救：偵測到存檔時的接續畫面
export function renderResume(root, info, cbs) {
  root.innerHTML = ''; root.className = '';
  const wrap = el('div', 'setup');
  wrap.appendChild(el('h1', 'title', `${COCO} COCONUT WARS 3.0`));
  wrap.appendChild(el('p', 'subtitle', '訓練版 · 工作人員後台系統'));
  const card = el('div', 'card');
  card.innerHTML = `
    <h2>🔄 偵測到未完成的遊戲</h2>
    <p class="hint">進度：第 <b>${info.round}</b> / ${info.numRounds} 回合${info.done ? '（已結束）' : ''}。
      重新整理／當掉都不會遺失，已輸入的指令與「退回上一回合」紀錄都會保留，可直接接續。</p>
    <div class="resume-actions">
      <button id="resumeBtn" class="btn primary big">▶️ 繼續遊戲</button>
      <button id="newBtn" class="btn ghost">🆕 開新局（清除存檔）</button>
    </div>`;
  wrap.appendChild(card);
  root.appendChild(wrap);
  $('#resumeBtn', card).onclick = cbs.onResume;
  $('#newBtn', card).onclick = () => {
    if (window.confirm('確定要清除存檔、開新的一局嗎？此動作無法復原。')) cbs.onNew();
  };
}

export function renderWaiting(root) {
  root.innerHTML = '';
  root.className = 'app-shell';
  const w = el('div', 'waiting');
  w.innerHTML = `<div class="waiting-inner"><img class="wait-img" src="assets/img/bird-run.png" alt="">
    <h1 class="title">COCONUT WARS 3.0 戰況直播</h1>
    <p class="subtitle">等待主控端開始遊戲…</p></div>`;
  root.appendChild(w);
}

// 海洋維持可用空間，左右有餘裕就拉寬
const MAX_OCEAN_ASPECT = 1.6;
const ISLAND_ZONE = 0.72;
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

    const ownerTxt = owner ? `${owner.id}小 · ⚔${total}` : '空島';
    const yieldC = islandYield(loc);
    const yieldTxt = `<div class="isl-yield${harvest ? ' harvest' : ''}">${COCO}${yieldC}/回合</div>`;
    const garrDetail = Object.entries(loc.garrison)
      .map(([t, n]) => `<span style="color:${GAME.teams[t].color}">${t}小 ${n}</span>`).join('　') || '—';

    node.innerHTML = `
      ${harvest ? '<div class="harvest-badge">🌾×1.5</div>' : ''}
      <img src="${IMG_BASE}${loc.img}" alt="${loc.label}" draggable="false">
      <div class="isl-tag">${loc.label}</div>
      <div class="isl-owner"><span class="dot" style="background:${owner ? owner.color : '#cfd8dc'}"></span>${ownerTxt}</div>
      ${yieldTxt}
      <div class="isl-pop"><b>${loc.label}</b> · ${loc.type === 'big' ? '大島' : '小島'}<br>駐軍：${garrDetail}</div>`;
    ocean.appendChild(node);
  }
  ocean.appendChild(renderBeach());
}

function renderBeach() {
  const beach = el('div', 'beach');
  beach.innerHTML = '<div class="beach-label">兵營</div>';
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
  rank.appendChild(el('h3', null, '<img class="h3-ic" src="assets/img/coconut.png" alt="">椰子排行'));
  rank.appendChild(rankTable());
  side.appendChild(rank);

  if (view === 'control') {
    // 代碼收集：小隊在 ?view=team 產生代碼 → 主持人貼上
    const col = el('div', 'panel');
    col.appendChild(el('h3', null, '📥 代碼收集'));
    const row = el('div', 'code-in-row');
    const input = el('input', 'code-in'); input.type = 'text'; input.inputMode = 'numeric'; input.placeholder = '貼上小隊代碼';
    const addBtn = el('button', 'btn primary', '加入');
    row.appendChild(input); row.appendChild(addBtn);
    col.appendChild(row);
    col.appendChild(el('div', 'flash'));
    const errBox = el('div', 'code-errors'); col.appendChild(errBox);
    const grid = el('div', 'collect-grid'); col.appendChild(grid);
    side.appendChild(col);

    const submitCode = () => {
      errBox.innerHTML = '';
      const res = decodeCode(input.value);
      if (res.error) { flash(col, res.error); return; }
      if (res.team < 0 || res.team >= GAME.numTeams) { flash(col, `隊號 ${res.team} 超出範圍`); return; }
      const chk = validateSubmission(res.team, res.cmds);
      if (!chk.valid) { renderCodeErrors(errBox, res.team, chk.rows); return; }   // 不合法 → 不收，請小隊修正重報
      GAME.pending[res.team] = res.cmds.map(c => ({ ...c, team: res.team }));
      _collected.add(res.team); saveGame(); input.value = '';
      flash(col, `✅ 已收 ${res.team}小（${res.cmds.length} 指令）`);
      renderCollectGrid(grid);
    };
    addBtn.onclick = submitCode;
    input.onkeydown = e => { if (e.key === 'Enter') submitCode(); };
    renderCollectGrid(grid);

    // 手動輸入（無裝置的小隊備用）
    const cmd = el('div', 'panel');
    cmd.appendChild(el('h3', null, '🎮 手動輸入（備用）'));
    const teamSel = el('select', 'team-select');
    for (let i = 0; i < GAME.numTeams; i++) {
      const o = el('option', null, `${i} 小　（兵營 ${GAME.teams[i].barracks}）`); o.value = i; teamSel.appendChild(o);
    }
    cmd.appendChild(teamSel);
    const builder = el('div', 'builder'); cmd.appendChild(builder);
    const listBox = el('div', 'cmd-list'); cmd.appendChild(listBox);
    side.appendChild(cmd);
    const refresh = () => {
      renderBuilder(builder, +teamSel.value, refresh);
      renderCmdList(listBox, +teamSel.value, refresh);
      renderCollectGrid(grid);   // 手動加/刪指令後同步更新收集狀態
    };
    teamSel.onchange = refresh; refresh();
  }

  renderTimerPanel(side, view);
}

// =========================================================
// ⏱️ 計時器（主控台控制、投影同步）
// =========================================================
// TIMER 為模組層狀態，跨畫面重繪也會延續。running 時以 endTime 推算剩餘，
// 暫停時保存 remainingMs。主控台變更後透過 _timerBroadcast 廣播給投影視窗。
let TIMER = { running: false, endTime: 0, remainingMs: 5 * 60 * 1000 };
let _timerBroadcast = null;   // 僅主控台綁定；投影端為 null（不廣播）
let _timerLoop = null;

export function bindTimerBroadcast(fn) { _timerBroadcast = fn; }
export function getTimerState() { return { ...TIMER }; }
// 投影端收到主控台廣播時套用
export function applyTimerState(t) {
  if (!t) return;
  TIMER = { running: !!t.running, endTime: t.endTime || 0, remainingMs: Math.max(0, t.remainingMs || 0) };
  ensureTimerLoop();
  paintTimer();
}

function timerRemainingMs() {
  return TIMER.running ? Math.max(0, TIMER.endTime - Date.now()) : Math.max(0, TIMER.remainingMs);
}
function fmtClock(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function broadcastTimer() { if (_timerBroadcast) _timerBroadcast({ ...TIMER }); }

function ensureTimerLoop() {
  if (_timerLoop) return;
  _timerLoop = setInterval(() => {
    if (TIMER.running && timerRemainingMs() <= 0) {   // 倒數結束
      TIMER.running = false; TIMER.remainingMs = 0;
      if (_timerBroadcast) broadcastTimer();          // 主控台把「停在 0」同步出去
    }
    paintTimer();
  }, 200);
}

// 更新畫面上所有計時器數字（若當前 DOM 有的話）
function paintTimer() {
  const ms = timerRemainingMs();
  document.querySelectorAll('.timer-clock').forEach(c => {
    c.textContent = fmtClock(ms);
    c.classList.toggle('ending', ms > 0 && ms <= 10000);
    c.classList.toggle('zero', ms <= 0);
  });
}

function renderTimerPanel(side, view) {
  const p = el('div', 'panel timer-panel');
  p.appendChild(el('h3', null, '⏱️ 計時器'));
  const clock = el('div', 'timer-clock'); clock.textContent = fmtClock(timerRemainingMs());
  p.appendChild(clock);

  if (view === 'control') {
    const ctrls = el('div', 'timer-ctrls');
    ctrls.innerHTML = `
      <div class="timer-set">
        <label>分 <input class="tm-min" type="number" min="0" max="99" value="5"></label>
        <label>秒 <input class="tm-sec" type="number" min="0" max="59" step="5" value="0"></label>
        <button class="btn ghost tm-set">設定</button>
      </div>
      <div class="timer-presets">
        <button class="btn tpl tm-preset" data-sec="60">1 分</button>
        <button class="btn tpl tm-preset" data-sec="180">3 分</button>
        <button class="btn tpl tm-preset" data-sec="300">5 分</button>
        <button class="btn tpl tm-preset" data-sec="600">10 分</button>
      </div>
      <div class="timer-btns">
        <button class="btn primary tm-toggle">▶ 開始</button>
        <button class="btn ghost tm-reset">⟲ 重設</button>
      </div>`;
    p.appendChild(ctrls);

    const minEl = ctrls.querySelector('.tm-min');
    const secEl = ctrls.querySelector('.tm-sec');
    const toggleBtn = ctrls.querySelector('.tm-toggle');
    const readInputs = () => (clamp(+minEl.value, 0, 99) * 60 + clamp(+secEl.value, 0, 59)) * 1000;
    const syncToggleLabel = () => { toggleBtn.textContent = TIMER.running ? '⏸ 暫停' : '▶ 開始'; };
    const load = (ms) => { TIMER.running = false; TIMER.remainingMs = Math.max(0, ms); broadcastTimer(); paintTimer(); syncToggleLabel(); };

    ctrls.querySelector('.tm-set').onclick = () => load(readInputs());
    ctrls.querySelectorAll('.tm-preset').forEach(b => b.onclick = () => {
      const sec = +b.dataset.sec; minEl.value = Math.floor(sec / 60); secEl.value = sec % 60; load(sec * 1000);
    });
    toggleBtn.onclick = () => {
      if (TIMER.running) {                              // 暫停：凍結剩餘
        TIMER.remainingMs = timerRemainingMs(); TIMER.running = false;
      } else {                                          // 開始／繼續
        let ms = timerRemainingMs(); if (ms <= 0) ms = readInputs();
        if (ms <= 0) { flash(p, '請先設定時間'); return; }
        TIMER.endTime = Date.now() + ms; TIMER.remainingMs = ms; TIMER.running = true;
      }
      broadcastTimer(); paintTimer(); syncToggleLabel();
    };
    ctrls.querySelector('.tm-reset').onclick = () => load(readInputs());
    syncToggleLabel();
  }

  side.appendChild(p);
  ensureTimerLoop();
  paintTimer();
}

function rankTable() {
  const t = el('table', 'rank-table');
  const rows = Object.values(GAME.teams).map(tm => ({ tm, total: teamTotalTroops(tm.id) })).sort((a, b) => b.tm.coconuts - a.tm.coconuts);
  t.innerHTML = `<tr><th>#</th><th>小隊</th><th>${COCO}椰子</th><th>總兵力</th></tr>`;
  rows.forEach((r, i) => {
    const tr = el('tr');
    tr.innerHTML = `<td>${i + 1}</td><td><span class="dot" style="background:${r.tm.color}"></span>${r.tm.id}小</td>
      <td><b>${r.tm.coconuts}</b></td><td>${r.total}</td>`;
    t.appendChild(tr);
  });
  return t;
}

// --- 指令建構器 -----------------------------------------
const CMD_META = {
  move:   { fmt: `出發, 目的(己方), 兵力（首回合不限，之後≤${RULES.MOVE_MAX}）`, ex: `兵營, 巨人山丘, ${RULES.MOVE_MAX}` },
  attack: { fmt: '出發, 目標, 兵力', ex: '兵營, 黃金洞窟, 300' },
};

function renderBuilder(box, teamId, onAdd) {
  const srcList = sourcesForTeam(teamId).map(s => `${s.label}(${s.troops})`).join('、');
  box.innerHTML = `
    <div class="templates">
      <button data-tpl="move" class="btn tpl"><img class="tpl-ic" src="assets/img/move.png" alt="">移動</button>
      <button data-tpl="attack" class="btn tpl"><img class="tpl-ic" src="assets/img/attack.png" alt="">攻擊</button>
    </div>
    <div id="cmdForm" class="cmd-form hidden"></div>
    <details class="ref"><summary>📖 可用名稱參考</summary>
      <div class="ref-body">
        <b>出發地(此隊)：</b>${srcList}<br>
        <b>島嶼：</b>見地圖島名（8 小島 ＋ 中立黃金洞窟）　<b>兵營：</b>輸入「兵營」或「B」<br>
        <b>移動：</b>第一回合不限；之後每指令最多 ${RULES.MOVE_MAX} 兵　<b>攻擊：</b>無門檻、100 倍數<br>
        <b>訓練：</b>每回合自動（兵營每滿 ${RULES.TRAIN_UNIT} 兵 +${RULES.TRAIN_GAIN}）　<b>守軍：</b>己島不足 ${RULES.MIN_GARRISON} 會強制中立
      </div>
    </details>`;

  box.querySelectorAll('.tpl').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.tpl, m = CMD_META[type];
      const form = $('#cmdForm', box);
      form.classList.remove('hidden');
      const push = res => { if (res.error) { flash(form, res.error); return; } GAME.pending[teamId].push(res.cmd); saveGame(); onAdd(); };

      form.innerHTML = `
        <div class="form-title"><b>${type === 'move' ? '移動' : '攻擊'}</b>　格式：<code>${m.fmt}</code></div>
        <div class="mode-pick"><div class="mode-cap">🖱️ 用選的</div>${selectorForm(type, teamId)}
          <button class="btn primary add-sel">＋ 加入</button></div>
        <div class="mode-type"><div class="mode-cap">⌨️ 或用打的</div>
          <div class="type-row"><input class="cmd-typed" type="text" placeholder="例：${m.ex}">
            <button class="btn primary add-typed">＋ 加入</button></div></div>
        <div class="flash"></div>`;
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

  if (type === 'move') {
    const maxAttr = GAME.round > 1 ? `max="${RULES.MOVE_MAX}"` : '';
    return `<div class="frow">
    <label>出發 <select name="S">${srcOpts}</select></label>
    <label>目的 <select name="E"><option value="B">兵營</option>${own}</select></label>
    <label>兵力 <input name="n" type="number" step="100" min="100" ${maxAttr} value="${RULES.MOVE_MAX}"></label></div>`;
  }
  if (type === 'attack') return `<div class="frow">
    <label>出發 <select name="S">${srcOpts}</select></label>
    <label>目標 <select name="E">${enemy}</select></label>
    <label>兵力 <input name="n" type="number" step="100" min="100" value="300"></label></div>`;
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
  if (c.type === 'move') {
    if (GAME.round > 1 && c.n > RULES.MOVE_MAX) return `移動每指令最多 ${RULES.MOVE_MAX} 兵（第一回合不限）`;
    if (c.E !== 'B' && GAME.locations[c.E]?.owner !== teamId) return '只能移動到自己的島或兵營';
  }
  if (c.type === 'attack') {
    if (c.n < RULES.MIN_ATTACK) return `進攻最低 ${RULES.MIN_ATTACK} 兵`;
    if (GAME.locations[c.E]?.owner === teamId) return '不能攻擊自己的島';
  }
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
  box.querySelectorAll('.del').forEach(b => { b.onclick = () => { GAME.pending[teamId].splice(+b.dataset.i, 1); saveGame(); onChange(); }; });
}

function cmdText(c) {
  const L = k => k === 'B' ? '兵營' : (GAME.locations[k]?.label || k);
  if (c.type === 'move') return `🚶 移動 ${L(c.S)}→${L(c.E)} ${c.n}`;
  if (c.type === 'attack') return `⚔️ 攻擊 ${L(c.S)}→${L(c.E)} ${c.n}`;
  return c.type;
}

// ---------------------------------------------------------
// 結算：主持人步進模式（手動一步步揭曉；播放視窗同步）
// ---------------------------------------------------------
let SETTLE = null;

// 由 log 建出「一格一格」的節目單（控端與播放端建出的完全相同）
function buildBeats(log) {
  const beats = [];
  const harvestLine = isFinalRound()
    ? '🌾 最後一回合 · 全島大豐收 ×1.5'
    : `🌾 本回合豐收：${GAME.harvest.map(id => GAME.locations[id].label).join('、')}（×1.5）`;
  beats.push({ type: 'intro', title: `第 ${log.round} 回合`, big: '開戰！', lines: [harvestLine], color: '#0b6e99' });

  const moveEvents = (log.events || []).filter(e => e.phase === 'move');
  if (moveEvents.length) beats.push({ type: 'move', title: '🚶 移動階段', lines: log.move, moveEvents, color: '#2a9df4' });

  for (const b of (log.battles || [])) {
    const swordEvents = (log.events || []).filter(e => e.phase === 'attack' && e.kind === 'sword' && e.to === `isl-${b.island}`);
    const atkLine = b.attackers.map(a => `${a.team}小 ${a.troops}`).join('　') || '（無）';
    const defLine = b.defTroops > 0 ? `🛡️ 守軍 ${b.defTeam}小 ${b.defTroops}` : '🛡️（此島無守軍）';
    beats.push({ type: 'battle-intro', island: b.island, title: `⚔️ ${b.label} 爭奪戰`,
      lines: [`參戰：${atkLine}`, defLine], swordEvents, color: '#ff6f61' });
    b.steps.forEach((s, i) => {
      const last = i === b.steps.length - 1;
      beats.push({ type: 'battle-step', island: b.island, title: `⚔️ ${b.label}`, lines: [s], color: '#ff6f61', capture: last ? b.outcome : null });
    });
  }

  if ((log.train || []).length) beats.push({ type: 'train', title: '🏋️ 自動訓練', lines: log.train, trainEvents: (log.events || []).filter(e => e.phase === 'train'), color: '#3cb371' });
  if ((log.resource || []).length) beats.push({ type: 'resource', title: `${COCO} 資源結算`, lines: log.resource, coconutEvents: (log.events || []).filter(e => e.phase === 'resource'), color: '#ffc23c' });
  beats.push({ type: 'recap', title: '📊 本回合回顧', recap: log.recap || [], color: '#0b6e99' });

  const upd = beats.find(bt => bt.type === 'train' || bt.type === 'resource' || bt.type === 'recap');
  if (upd) upd.updateBoard = true;

  // 進入攻擊階段就把地圖切到中繼盤面（出兵已扣、戰役未判），
  // 讓防守島不再顯示已派出去攻擊/移動的兵。優先掛在第一場戰役，其次移動階段。
  if (log.midState) {
    const midAnchor = beats.find(bt => bt.type === 'battle-intro') || beats.find(bt => bt.type === 'move');
    if (midAnchor) { midAnchor.updateBoardMid = true; midAnchor.midState = log.midState; }
  }
  return beats;
}

// control = 主持人可步進；display = 只顯示、被 beat 訊息驅動
export function openSettlement(log, postState, control, cbs) {
  closeSettlement();
  const beats = buildBeats(log);
  const overlay = el('div', 'settle-overlay');
  const card = el('div', 'settle-card');
  overlay.appendChild(card);
  let nav = null;
  if (control) {
    nav = el('div', 'settle-nav');
    nav.innerHTML = `<span class="settle-hint">按 <b>空白鍵</b> 或點「下一步」揭曉</span>
      <span class="settle-prog"></span><button class="btn primary settle-next">下一步 ▸</button>`;
    overlay.appendChild(nav);
  }
  document.body.appendChild(overlay);
  SETTLE = { beats, overlay, card, nav, i: -1, postState, control, cbs, boardDone: false, midDone: false };

  if (control) {
    const next = () => advanceSettlement();
    nav.querySelector('.settle-next').onclick = next;
    SETTLE.key = e => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); } };
    window.addEventListener('keydown', SETTLE.key);
  }
  showBeat(0);
}

function advanceSettlement() {
  if (!SETTLE) return;
  const ni = SETTLE.i + 1;
  if (ni >= SETTLE.beats.length) { const cbs = SETTLE.cbs; closeSettlement(); if (cbs && cbs.onFinish) cbs.onFinish(); return; }
  showBeat(ni);
  if (SETTLE.cbs && SETTLE.cbs.onAdvance) SETTLE.cbs.onAdvance(ni);
}

// 播放端：收到 beat 索引 → 顯示同一格
export function showSettlementBeat(i) { if (SETTLE) showBeat(i); }
export function closeSettlement() {
  if (!SETTLE) return;
  if (SETTLE.key) window.removeEventListener('keydown', SETTLE.key);
  SETTLE.overlay.remove();
  SETTLE = null;
}

function showBeat(i) {
  if (!SETTLE) return;
  SETTLE.i = i;
  const b = SETTLE.beats[i];
  renderCard(SETTLE.card, b);
  if (SETTLE.nav) {
    SETTLE.nav.querySelector('.settle-prog').textContent = `${i + 1} / ${SETTLE.beats.length}`;
    SETTLE.nav.querySelector('.settle-next').textContent = i === SETTLE.beats.length - 1 ? '完成 ✓' : '下一步 ▸';
  }
  applyBeatEffects(b);
}

function applyBeatEffects(b) {
  if (b.updateBoard && !SETTLE.boardDone) {
    SETTLE.boardDone = true;
    if (SETTLE.postState) loadState(SETTLE.postState);
    const board = document.getElementById('board');
    if (board) { renderBoard(board); requestAnimationFrame(fitOcean); }
  }
  // 攻擊階段起始：切到中繼盤面（出兵已扣、戰役未判）。boardDone 後不再覆蓋。
  if (b.updateBoardMid && !SETTLE.midDone && !SETTLE.boardDone) {
    SETTLE.midDone = true;
    if (b.midState) {
      loadState(b.midState);
      const board = document.getElementById('board');
      if (board) { renderBoard(board); requestAnimationFrame(fitOcean); }
    }
  }
  const ov = SETTLE.overlay;
  if (b.type === 'move' && b.moveEvents) b.moveEvents.forEach((e, i) => setTimeout(() => moveToken(ov, e, 'person'), i * 200));
  if (b.type === 'battle-intro' && b.swordEvents) b.swordEvents.forEach((e, i) => setTimeout(() => moveToken(ov, e, 'sword'), i * 200));
  if (b.type === 'battle-step' && b.capture) { burst(ov, `isl-${b.island}`); flashIsland(b.island); }
  if (b.type === 'train' && b.trainEvents) b.trainEvents.forEach(e => riseTrain(ov, e.at, e.gain));
  if (b.type === 'resource' && b.coconutEvents) b.coconutEvents.forEach((e, i) => setTimeout(() => riseCoconut(ov, e.at, e.coconut, e.harvest), i * 80));
}

function flashIsland(id) {
  const n = document.getElementById(`isl-${id}`); if (!n) return;
  n.classList.remove('flash-cap'); void n.offsetWidth; n.classList.add('flash-cap');
  setTimeout(() => n.classList.remove('flash-cap'), 1400);
}

function renderCard(card, b) {
  card.style.setProperty('--accent', b.color || '#0b6e99');
  if (b.type === 'recap') { card.innerHTML = renderRecapCard(b.recap); return; }
  const linesHtml = (b.lines || []).map(l => `<div class="sc-line">${l}</div>`).join('');
  const bigHtml = b.big ? `<div class="sc-big">${b.big}</div>` : '';
  card.innerHTML = `<div class="sc-title">${b.title}</div>${bigHtml}<div class="sc-lines">${linesHtml}</div>`;
}

function renderRecapCard(recap) {
  const rows = [...recap].sort((a, b) => b.coconutTotal - a.coconutTotal).map(r => {
    const c = GAME.teams[r.team]?.color || '#888';
    const gain = r.gained.length ? `<span class="rc-gain">＋${r.gained.join('、')}</span>` : '';
    const lost = r.lost.length ? `<span class="rc-lost">－${r.lost.join('、')}</span>` : '';
    const chg = (!gain && !lost) ? '<span class="rc-none">—</span>' : `${gain} ${lost}`;
    return `<tr>
      <td><span class="dot" style="background:${c}"></span>${r.team}小</td>
      <td class="rc-isl">${chg}</td>
      <td class="rc-coco">${COCO}${r.coconutTotal} <span class="rc-delta">+${r.coconutGained}</span></td>
      <td class="rc-troop">⚔${r.troopAfter}</td></tr>`;
  }).join('');
  return `<div class="sc-title">📊 本回合回顧</div>
    <table class="recap-table"><tr><th>隊</th><th>島嶼變化</th><th>椰子（+本回合）</th><th>總兵力</th></tr>${rows}</table>`;
}

function centerOf(id) { const n = document.getElementById(id); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function moveToken(overlay, e, kind) {
  const from = centerOf(e.from), to = centerOf(e.to); if (!from || !to) return;
  const color = GAME.teams[e.team]?.color || '#fff';
  const src = kind === 'sword' ? 'attack.png' : 'move.png';
  const tok = el('div', 'token'); tok.style.setProperty('--c', color);
  tok.innerHTML = `<img class="tok-icon" src="assets/img/${src}" alt=""><b>${e.n}</b>`;
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
  r.innerHTML = `${COCO}+${coconut}${harvest ? ' 🌾' : ''}`;
  r.style.left = c.x + 'px'; r.style.top = c.y + 'px';
  overlay.appendChild(r); void r.offsetWidth; r.classList.add('show');
  setTimeout(() => r.remove(), 1400);
}
function riseTrain(overlay, at, gain) {
  const c = centerOf(at); if (!c) return;
  const r = el('div', 'train-rise');
  r.innerHTML = `🏋️ +${gain} 兵`;
  r.style.left = c.x + 'px'; r.style.top = c.y + 'px';
  overlay.appendChild(r); void r.offsetWidth; r.classList.add('show');
  setTimeout(() => r.remove(), 1500);
}

// ---------------------------------------------------------
// 最終排名。特殊獎勵一開始隱藏（懸念），主持人按「揭曉」才加上並重新排序。
// 揭曉動作由 revealFinalBonus() 執行，主控端按鈕與播放視窗同步都走這裡。
let _revealFinal = null;

function buildPodium(withBonus, animate) {
  const score = tm => tm.coconuts + (withBonus ? (tm.bonus || 0) : 0);
  const rows = Object.values(GAME.teams).slice().sort((a, b) => score(b) - score(a));
  const podium = el('div', 'podium');
  rows.forEach((tm, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    const boosted = withBonus && (tm.bonus || 0) > 0;
    const row = el('div', 'final-row' + (boosted ? ' boosted' : '') + (boosted && animate ? ' reveal-pulse' : ''));
    row.style.borderColor = tm.color;
    const bonusTag = boosted ? `<span class="fr-bonus">🎁 +${tm.bonus} 特殊獎勵</span>` : '';
    row.innerHTML = `<span class="fr-medal">${medal}</span><span class="dot" style="background:${tm.color}"></span>
      <span class="fr-name">${tm.id} 小</span>${bonusTag}<span class="fr-score">${COCO} ${score(tm)}</span>`;
    podium.appendChild(row);
  });
  return podium;
}

export function renderFinal(root, opts = {}) {
  root.innerHTML = ''; root.className = '';
  const wrap = el('div', 'final');
  wrap.appendChild(el('h1', 'title', '🏁 最終排名'));
  wrap.appendChild(el('div', 'final-hero', '<img src="assets/img/bird-drink.png" alt="">'));

  const podium = buildPodium(false, false);
  wrap.appendChild(podium);

  const hasBonus = Object.values(GAME.teams).some(t => (t.bonus || 0) > 0);
  let revealBtn = null;
  _revealFinal = () => {
    _revealFinal = null;                       // 只揭曉一次
    if (revealBtn) revealBtn.remove();
    podium.replaceWith(buildPodium(true, true));
  };

  // 揭曉按鈕：只在主控端出現；按下後本地揭曉並廣播給播放視窗
  if (hasBonus && opts.view !== 'display') {
    revealBtn = el('button', 'btn reveal big', '🎁 揭曉特殊獎勵');
    revealBtn.onclick = () => { const fn = _revealFinal; if (fn) fn(); if (opts.onReveal) opts.onReveal(); };
    wrap.appendChild(revealBtn);
  }

  const btn = el('button', 'btn primary big', '🔄 重新開始'); btn.onclick = () => { clearSavedGame(); location.reload(); };
  wrap.appendChild(btn); root.appendChild(wrap);
}

// 播放視窗收到主控端「揭曉」訊息時呼叫（主控端亦透過此函式本地揭曉）
export function revealFinalBonus() { if (_revealFinal) _revealFinal(); }

function clamp(v, a, b) { return Math.max(a, Math.min(b, v || a)); }
function flash(node, msg) {
  let f = node.querySelector('.flash');
  if (!f) { f = el('div', 'flash'); node.appendChild(f); }
  f.textContent = (/^[✅📋🎁]/.test(msg) ? '' : '⚠️ ') + msg; f.classList.add('show');
  setTimeout(() => f.classList.remove('show'), 2600);
}

// =========================================================
// 代碼收集（主控台）
// =========================================================
// 本回合已收到代碼的隊伍（放棄＝0 指令也算已收）；換回合自動清空
let _collectRound = null;
const _collected = new Set();
function ensureCollectRound() { if (_collectRound !== GAME.round) { _collectRound = GAME.round; _collected.clear(); } }

// 依目前盤面檢查一份提交是否合法；回傳每條指令的結果 + 整體 valid
function availTroops(teamId, key) {
  if (key === 'B') return GAME.teams[teamId].barracks;
  return (GAME.locations[key] && GAME.locations[key].garrison[teamId]) || 0;
}
function locLabel(k) { return k === 'B' ? '兵營' : (GAME.locations[k] ? GAME.locations[k].label : k); }

function validateSubmission(teamId, cmds) {
  const rows = cmds.map(c => ({ c, ok: true, reason: '' }));
  const fail = (r, reason) => { if (r.ok) { r.ok = false; r.reason = reason; } };

  for (const r of rows) {
    const c = r.c;
    if (!c.n || c.n % RULES.STEP) fail(r, '兵力須為 100 的倍數');
    if (c.S !== 'B' && GAME.locations[c.S] && GAME.locations[c.S].owner !== teamId) fail(r, `出發「${locLabel(c.S)}」非我方領地`);
    if (c.type === 'move') {
      if (GAME.round > 1 && c.n > RULES.MOVE_MAX) fail(r, `移動每指令最多 ${RULES.MOVE_MAX} 兵`);
      if (c.E !== 'B' && GAME.locations[c.E] && GAME.locations[c.E].owner !== teamId) fail(r, `目的「${locLabel(c.E)}」非我方領地`);
    }
    if (c.type === 'attack') {
      if (c.n < RULES.MIN_ATTACK) fail(r, `進攻最低 ${RULES.MIN_ATTACK} 兵`);
      if (GAME.locations[c.E] && GAME.locations[c.E].owner === teamId) fail(r, `不能攻擊自己的「${locLabel(c.E)}」`);
    }
  }
  // 兵力超支：模擬引擎「移動階段 → 攻擊階段」順序
  // （移動可把兵先送進某地，之後該地才用來攻擊，不算超支）
  const avail = {};
  const availOf = k => (k in avail) ? avail[k] : (avail[k] = availTroops(teamId, k));
  const overdraftCheck = (rs, phase) => {
    const bySrc = {};
    for (const r of rs) (bySrc[r.c.S] = bySrc[r.c.S] || []).push(r);
    for (const [src, list] of Object.entries(bySrc)) {
      const sum = list.reduce((a, r) => a + r.c.n, 0);
      const have = availOf(src);
      if (sum > have) list.forEach(r => fail(r, `${phase}出發「${locLabel(src)}」兵力不足（需 ${sum}、現有 ${have}）`));
    }
  };
  // ① 移動：對照初始兵力
  const moveRows = rows.filter(r => r.ok && r.c.type === 'move');
  overdraftCheck(moveRows, '移動');
  // 套用通過的移動：扣出發地、加到目的地（供攻擊階段計算）
  for (const r of moveRows) if (r.ok) { avail[r.c.S] = availOf(r.c.S) - r.c.n; avail[r.c.E] = availOf(r.c.E) + r.c.n; }
  // ② 攻擊：對照移動後兵力
  overdraftCheck(rows.filter(r => r.ok && r.c.type === 'attack'), '攻擊');

  return { valid: rows.every(r => r.ok), rows };
}

function renderCodeErrors(box, team, rows) {
  box.innerHTML = `<div class="ce-title">⚠️ ${team}小 代碼含不合法指令，未收下（請小隊修正後重報）：</div>`;
  rows.forEach((r, i) => {
    const line = el('div', 'ce-row ' + (r.ok ? 'ok' : 'bad'));
    line.innerHTML = `<span class="ce-i">指令${i + 1}</span><span class="ce-txt">${cmdText(r.c)}</span>`
      + (r.ok ? '<span class="ce-ok">✓</span>' : `<span class="ce-why">✗ ${r.reason}</span>`);
    box.appendChild(line);
  });
}

function renderCollectGrid(grid) {
  ensureCollectRound();
  grid.innerHTML = '';
  let done = 0;
  for (let i = 0; i < GAME.numTeams; i++) {
    const list = GAME.pending[i] || [];
    const has = _collected.has(i) || list.length > 0;
    if (has) done++;
    const item = el('div', 'collect-item' + (has ? ' done' : ''));
    const rw = el('div', 'collect-row');
    rw.innerHTML = `<span class="cr-team"><span class="dot" style="background:${GAME.teams[i].color}"></span>${i}小</span>
      <span class="cr-status">${has ? `✅ ${list.length} 指令` : '⏳ 未收'}</span>`;
    if (has) {
      const clr = el('button', 'cr-clear', '✕'); clr.title = '清除此隊';
      clr.onclick = () => { GAME.pending[i] = []; _collected.delete(i); saveGame(); renderCollectGrid(grid); };
      rw.appendChild(clr);
    }
    item.appendChild(rw);
    if (has) {
      const det = el('div', 'cr-cmds');
      det.innerHTML = list.length
        ? list.map(c => `<div class="cr-cmd">${cmdText(c)}</div>`).join('')
        : '<div class="cr-cmd pass">（放棄，無指令）</div>';
      item.appendChild(det);
    }
    grid.appendChild(item);
  }
  grid.appendChild(el('div', 'collect-sum', `已收 ${done} / ${GAME.numTeams} 隊`));
}

