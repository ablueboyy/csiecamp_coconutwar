/* =========================================================
 * COCONUT WARS — 應用進入點
 * 支援雙視窗：主控台(control) 與 播放視窗(display)
 * 兩視窗以 BroadcastChannel 同步狀態
 * ========================================================= */
import { GAME, initGame, exportState, loadState } from './state.js';
import { settleRound } from './engine.js';
import { renderSetup, renderGame, renderFinal, renderWaiting, playSettlement } from './ui.js';

const root = document.getElementById('app');
const VIEW = new URLSearchParams(location.search).get('view') || 'control';
const bus = new BroadcastChannel('coconut-wars');

// ---------------------------------------------------------
// 主控台（可設定、下指令、結算）
// ---------------------------------------------------------
function startControl() {
  renderSetup(root, (cfg) => {
    initGame(cfg);
    broadcastState();
    enterControl();
  });
}

function enterControl() {
  renderGame(root, { view: 'control', onSettle: handleSettle, onOpenDisplay: openDisplay });
}

async function handleSettle() {
  const btn = document.getElementById('settleBtn');
  if (btn) { btn.disabled = true; btn.textContent = '結算中…'; }

  const log = settleRound();                     // 計算最終狀態 + 動畫事件
  bus.postMessage({ type: 'settle', log });      // 通知播放視窗播放動畫（其畫面仍為結算前）
  await playSettlement(log);                      // 主控台同步播放

  if (GAME.round >= GAME.numRounds) {
    GAME.phase = 'done';
    renderFinal(root);
    bus.postMessage({ type: 'final', state: exportState() });
  } else {
    GAME.round += 1;
    broadcastState();                            // 廣播結算後盤面
    enterControl();
  }
}

function openDisplay() {
  window.open(location.pathname + '?view=display', 'cw-display',
    'width=1280,height=880');
}

function broadcastState() {
  bus.postMessage({ type: 'state', state: exportState() });
}

// ---------------------------------------------------------
// 播放視窗（唯讀，給小隊員看戰況）
// ---------------------------------------------------------
function startDisplay() {
  renderWaiting(root);
  bus.postMessage({ type: 'hello' });   // 請求目前狀態
}

// ---------------------------------------------------------
// 訊息路由
// ---------------------------------------------------------
bus.onmessage = (e) => {
  const m = e.data;
  if (VIEW === 'control') {
    if (m.type === 'hello') broadcastState();   // 新的播放視窗上線 → 補送狀態
    return;
  }
  // display
  if (m.type === 'state') {
    loadState(m.state);
    renderGame(root, { view: 'display' });
  } else if (m.type === 'settle') {
    playSettlement(m.log);                        // 於目前(結算前)盤面播放動畫
  } else if (m.type === 'final') {
    loadState(m.state);
    renderFinal(root);
  }
};

// ---------------------------------------------------------
if (VIEW === 'display') startDisplay();
else startControl();
