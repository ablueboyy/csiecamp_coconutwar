/* =========================================================
 * COCONUT WARS 3.0 — 應用進入點（主控台 + 播放視窗）
 * ========================================================= */
import { GAME, initGame, rollHarvest, exportState, loadState } from './state.js';
import { settleRound } from './engine.js';
import { renderSetup, renderGame, renderFinal, renderWaiting, playSettlement } from './ui.js';

const root = document.getElementById('app');
const VIEW = new URLSearchParams(location.search).get('view') || 'control';
const bus = new BroadcastChannel('coconut-wars-3');

function enterControl() {
  renderGame(root, { view: 'control', onSettle: handleSettle, onOpenDisplay: openDisplay });
}

async function handleSettle() {
  const btn = document.getElementById('settleBtn');
  if (btn) { btn.disabled = true; btn.textContent = '結算中…'; }

  const log = settleRound();
  bus.postMessage({ type: 'settle', log, state: exportState() });
  await playSettlement(log);

  if (GAME.round >= GAME.numRounds) {
    GAME.phase = 'done';
    renderFinal(root);
    bus.postMessage({ type: 'final', state: exportState() });
  } else {
    GAME.round += 1;
    rollHarvest();
    broadcastState();
    enterControl();
  }
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
  if (m.type === 'state') { loadState(m.state); renderGame(root, { view: 'display' }); }
  else if (m.type === 'settle') { playSettlement(m.log, m.state); }
  else if (m.type === 'final') { loadState(m.state); renderFinal(root); }
};

if (VIEW === 'display') startDisplay(); else startControl();
