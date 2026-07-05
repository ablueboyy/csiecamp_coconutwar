/* =========================================================
 * COCONUT WARS 3.0 — 應用進入點（主控台 + 播放視窗）
 * 結算採「主持人步進模式」：主持人按空白鍵逐格揭曉，播放視窗同步。
 * ========================================================= */
import { GAME, initGame, rollHarvest, exportState, loadState } from './state.js';
import { settleRound } from './engine.js';
import { renderSetup, renderGame, renderFinal, renderWaiting, openSettlement, showSettlementBeat, closeSettlement } from './ui.js';

const root = document.getElementById('app');
const VIEW = new URLSearchParams(location.search).get('view') || 'control';
const bus = new BroadcastChannel('coconut-wars-3');

function enterControl() {
  renderGame(root, { view: 'control', onSettle: handleSettle, onOpenDisplay: openDisplay });
}

function handleSettle() {
  const btn = document.getElementById('settleBtn');
  if (btn) { btn.disabled = true; btn.textContent = '主持中…'; }

  const log = settleRound();
  const postState = exportState();
  bus.postMessage({ type: 'settle', log, state: postState });   // 播放視窗建同一份節目單

  openSettlement(log, postState, true, {
    onAdvance: (i) => bus.postMessage({ type: 'beat', i }),      // 每步同步給播放視窗
    onFinish: () => {
      if (GAME.round >= GAME.numRounds) {
        GAME.phase = 'done';
        renderFinal(root);
        bus.postMessage({ type: 'final', state: exportState() });
      } else {
        GAME.round += 1;
        rollHarvest();
        broadcastState();     // 播放視窗收到 state → 關閉結算、進下一回合
        enterControl();
      }
    },
  });
}

function openDisplay() { window.open(location.pathname + '?view=display', 'cw3-display', 'width=1280,height=880'); }
function broadcastState() { bus.postMessage({ type: 'state', state: exportState() }); }

function startControl() {
  renderSetup(root, (cfg) => { initGame(cfg); broadcastState(); enterControl(); });
}
function startDisplay() { renderWaiting(root); bus.postMessage({ type: 'hello' }); }

bus.onmessage = (e) => {
  const m = e.data;
  if (VIEW === 'control') { if (m.type === 'hello') broadcastState(); return; }
  // 播放視窗
  if (m.type === 'state') { closeSettlement(); loadState(m.state); renderGame(root, { view: 'display' }); }
  else if (m.type === 'settle') { openSettlement(m.log, m.state, false, {}); }
  else if (m.type === 'beat') { showSettlementBeat(m.i); }
  else if (m.type === 'final') { closeSettlement(); loadState(m.state); renderFinal(root); }
};

if (VIEW === 'display') startDisplay(); else startControl();
