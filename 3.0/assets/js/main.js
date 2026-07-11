/* =========================================================
 * COCONUT WARS 3.0 — 應用進入點（主控台 + 播放視窗）
 * 結算採「主持人步進模式」：主持人按空白鍵逐格揭曉，播放視窗同步。
 * ========================================================= */
import { GAME, initGame, rollHarvest, exportState, loadState, snapshotBeforeSettle, canRollback, rollbackHistory, prevRoundNo,
  saveGame, loadSavedGame, restoreGame, clearSavedGame } from './state.js';
import { settleRound } from './engine.js';
import { renderSetup, renderGame, renderFinal, renderWaiting, renderResume, openSettlement, showSettlementBeat, closeSettlement, revealFinalBonus,
  bindTimerBroadcast, applyTimerState, getTimerState } from './ui.js';

const root = document.getElementById('app');
const VIEW = new URLSearchParams(location.search).get('view') || 'control';
const bus = new BroadcastChannel('coconut-wars-3');

// 計時器：主控台變更時廣播給投影視窗
if (VIEW === 'control') bindTimerBroadcast(t => bus.postMessage({ type: 'timer', timer: t }));

function enterControl() {
  renderGame(root, { view: 'control', onSettle: handleSettle, onOpenDisplay: openDisplay, onRollback: handleRollback });
}

// 主控端最終排名：按下「揭曉特殊獎勵」時本地揭曉並廣播給播放視窗
function showFinalControl() {
  renderFinal(root, { view: 'control', onReveal: () => bus.postMessage({ type: 'reveal' }) });
}

function handleSettle() {
  const btn = document.getElementById('settleBtn');
  if (btn) { btn.disabled = true; btn.textContent = '主持中…'; }

  snapshotBeforeSettle();   // 結算前拍快照，供緊急退回
  const log = settleRound();
  const postState = exportState();
  bus.postMessage({ type: 'settle', log, state: postState });   // 播放視窗建同一份節目單

  openSettlement(log, postState, true, {
    onAdvance: (i, back) => bus.postMessage({ type: 'beat', i, back }), // 每步同步給播放視窗（back=回上一步）
    onFinish: () => {
      if (GAME.round >= GAME.numRounds) {
        GAME.phase = 'done';
        saveGame();
        showFinalControl();
        bus.postMessage({ type: 'final', state: exportState() });
      } else {
        GAME.round += 1;
        rollHarvest();
        saveGame();           // 進入新回合 → 存檔
        broadcastState();     // 播放視窗收到 state → 關閉結算、進下一回合
        enterControl();
      }
    },
  });
}

// 緊急補救：強制退回上一回合（捨棄本次結算，回到上一回合指令畫面、指令保留可改）
function handleRollback() {
  if (!canRollback()) return;
  const target = prevRoundNo();
  const msg = `⚠️ 確定要強制退回「第 ${target} 回合」嗎？\n\n`
    + `目前第 ${GAME.round} 回合的結算結果將被捨棄，回到第 ${target} 回合的指令輸入畫面。\n`
    + `該回合先前輸入的指令會保留，可修改後重新結算。\n（可連續退回到更早的回合。）`;
  if (!window.confirm(msg)) return;
  rollbackHistory();
  saveGame();         // 退回後存檔
  closeAnySettlement();
  broadcastState();   // 同步播放視窗：關閉結算動畫、載入還原後狀態
  enterControl();
}
// 若正卡在結算動畫中途按退回，先把覆蓋層關掉
function closeAnySettlement() { try { closeSettlement(); } catch (_) {} }

function openDisplay() { window.open(location.pathname + '?view=display', 'cw3-display', 'width=1280,height=880'); }
function broadcastState() { bus.postMessage({ type: 'state', state: exportState() }); }

function startControl() {
  const saved = loadSavedGame();
  if (saved && saved.phase && saved.phase !== 'setup') {
    renderResume(root, { round: saved.round, numRounds: saved.numRounds, done: saved.phase === 'done' }, {
      onResume: () => {
        restoreGame(saved);
        broadcastState();
        if (saved.phase === 'done') showFinalControl(); else enterControl();
      },
      onNew: () => { clearSavedGame(); startSetup(); },
    });
    return;
  }
  startSetup();
}
function startSetup() {
  renderSetup(root, (cfg) => { initGame(cfg); saveGame(); broadcastState(); enterControl(); });
}
function startDisplay() { renderWaiting(root); bus.postMessage({ type: 'hello' }); }

bus.onmessage = (e) => {
  const m = e.data;
  if (VIEW === 'control') {
    // 新開的投影視窗打招呼 → 補送目前盤面與計時器狀態
    if (m.type === 'hello') { broadcastState(); bus.postMessage({ type: 'timer', timer: getTimerState() }); }
    return;
  }
  // 播放視窗
  if (m.type === 'state') { closeSettlement(); loadState(m.state); renderGame(root, { view: 'display' }); }
  else if (m.type === 'settle') { openSettlement(m.log, m.state, false, {}); }
  else if (m.type === 'beat') { showSettlementBeat(m.i, m.back); }
  else if (m.type === 'final') { closeSettlement(); loadState(m.state); renderFinal(root, { view: 'display' }); }
  else if (m.type === 'reveal') { revealFinalBonus(); }
  else if (m.type === 'timer') { applyTimerState(m.timer); }
};

if (VIEW === 'display') startDisplay(); else startControl();
