/* =========================================================
 * COCONUT WARS 3.0 — 小隊指令產生器（獨立頁 team.html）
 * ---------------------------------------------------------
 * 流程：① 選小隊 → ② 打指令 → 產生純數字代碼報給主持人。
 * 與主遊戲完全分離：只依賴 config（島嶼清單）與 code（編碼）。
 * 限制：每回合最多 3 個指令（訓練已改為每回合自動、非指令）。
 * ========================================================= */
import { ISLANDS } from './config.js';
import { encodeCode } from './code.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const COCO = '<img class="coco-ic" src="assets/img/coconut.png" alt="椰子">';
const MAX_CMDS = 3;

const LABELS = (() => { const m = { B: '兵營' }; for (const i of ISLANDS) m[i.id] = i.label; return m; })();
function cmdText(c) {
  const L = k => LABELS[k] || k;
  if (c.type === 'move') return `🚶 移動 ${L(c.S)}→${L(c.E)} ${c.n}`;
  if (c.type === 'attack') return `⚔️ 攻擊 ${L(c.S)}→${L(c.E)} ${c.n}`;
  return c.type;
}
function flash(node, msg) {
  let f = node.querySelector('.flash');
  if (!f) { f = el('div', 'flash'); node.appendChild(f); }
  f.textContent = (/^[✅📋]/.test(msg) ? '' : '⚠️ ') + msg; f.classList.add('show');
  setTimeout(() => f.classList.remove('show'), 2600);
}

// ---------------------------------------------------------
// ① 選小隊
// ---------------------------------------------------------
function renderPick(root) {
  root.innerHTML = ''; root.className = '';
  const wrap = el('div', 'setup code-team');
  wrap.appendChild(el('h1', 'title', `${COCO} 小隊指令產生器`));
  wrap.appendChild(el('p', 'subtitle', '請選擇你的小隊（依主持人公布的隊號）'));
  const card = el('div', 'card');
  const grid = el('div', 'pick-grid');
  for (let i = 0; i < 10; i++) {
    const b = el('button', 'btn pick-btn', `${i} 小`);
    b.onclick = () => renderCommand(root, i);
    grid.appendChild(b);
  }
  card.appendChild(grid);
  wrap.appendChild(card);
  root.appendChild(wrap);
}

// ---------------------------------------------------------
// ② 打指令
// ---------------------------------------------------------
function renderCommand(root, teamId) {
  root.innerHTML = ''; root.className = '';
  const cmds = [];
  const islOpts = ISLANDS.map(i => `<option value="${i.id}">${i.label}</option>`).join('');
  const srcOpts = '<option value="B">兵營</option>' + islOpts;

  const wrap = el('div', 'setup code-team');
  wrap.appendChild(el('h1', 'title', `${COCO} ${teamId} 小 · 出指令`));

  const card = el('div', 'card');
  card.innerHTML = `
    <div class="ct-head">
      <span class="ct-hint">每回合最多 ${MAX_CMDS} 個指令（訓練自動）</span>
      <button class="btn ghost ct-back">↩ 換隊</button>
    </div>
    <div class="ct-tpls">
      <button class="btn tpl" data-t="move">🚶 移動</button>
      <button class="btn tpl" data-t="attack">⚔️ 攻擊</button>
      <button class="btn ghost ct-pass">🏳️ 放棄（不操作）</button>
    </div>
    <div id="ctForm" class="cmd-form"></div>
    <div id="ctList" class="cmd-list"></div>
    <div class="flash"></div>`;
  wrap.appendChild(card);

  const codeCard = el('div', 'card code-out');
  codeCard.innerHTML = `
    <div class="co-label">你的代碼</div>
    <div id="ctCode" class="co-code">—</div>
    <button id="ctCopy" class="btn primary big">📋 複製代碼</button>
    <p class="hint">把代碼報給主持人輸入即可送出。實際兵力與領地以現場為準，違規指令結算時自動作廢。</p>
    <div class="flash"></div>`;
  wrap.appendChild(codeCard);
  root.appendChild(wrap);

  $('.ct-back', card).onclick = () => renderPick(root);

  const form = $('#ctForm', card);
  const listBox = $('#ctList', card);
  const codeEl = $('#ctCode', codeCard);
  const tpls = card.querySelectorAll('.tpl');

  const updateTpls = () => {
    const full = cmds.length >= MAX_CMDS;
    tpls.forEach(b => { b.disabled = full; });
  };
  const refreshCode = () => { codeEl.textContent = encodeCode(teamId, cmds); };
  const refreshList = () => {
    listBox.innerHTML = `<div class="cl-head">已選 ${cmds.length}/${MAX_CMDS}</div>`;
    cmds.forEach((c, i) => {
      const item = el('div', 'cl-item');
      item.innerHTML = `<span>${cmdText(c)}</span><button class="del" data-i="${i}">✕</button>`;
      listBox.appendChild(item);
    });
    listBox.querySelectorAll('.del').forEach(b => b.onclick = () => { cmds.splice(+b.dataset.i, 1); refreshList(); });
    updateTpls(); refreshCode();
  };
  const addCmd = c => {
    if (cmds.length >= MAX_CMDS) { flash(card, `每回合最多 ${MAX_CMDS} 個指令`); return; }
    cmds.push(c); form.innerHTML = ''; refreshList();
  };

  tpls.forEach(btn => btn.onclick = () => {
    if (btn.disabled) return;
    const t = btn.dataset.t;
    const targetOpts = t === 'move' ? srcOpts : islOpts;
    const dv = t === 'move' ? 500 : 300;
    form.innerHTML = `
      <div class="frow">
        <label>出發 <select name="S">${srcOpts}</select></label>
        <label>${t === 'move' ? '目的' : '目標'} <select name="E">${targetOpts}</select></label>
        <label>兵力 <input name="n" type="number" step="100" min="100" max="99900" value="${dv}"></label>
      </div>
      <button class="btn primary ct-add">＋ 加入</button>`;
    $('.ct-add', form).onclick = () => {
      const g = n => form.querySelector(`[name="${n}"]`).value;
      const n = +g('n');
      if (!n || n % 100) { flash(card, '兵力須為 100 的倍數'); return; }
      if (n > 99900) { flash(card, '兵力上限 99900'); return; }
      addCmd({ type: t, S: g('S'), E: g('E'), n, team: teamId });
    };
  });

  // 放棄本回合：清空所有指令，代碼即為「不操作」代碼（可直接複製報給主持人）
  $('.ct-pass', card).onclick = () => {
    if (cmds.length && !window.confirm('放棄本回合會清除已加入的指令，確定嗎？')) return;
    cmds.length = 0; form.innerHTML = ''; refreshList();
    flash(card, '✅ 已設為放棄本回合，請直接複製下方代碼');
  };

  $('#ctCopy', codeCard).onclick = () => {
    const code = codeEl.textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => flash(codeCard, '✅ 已複製：' + code)).catch(() => {});
  };
  refreshList();
}

renderPick(document.getElementById('app'));
