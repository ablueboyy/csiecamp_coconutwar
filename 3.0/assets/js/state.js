/* =========================================================
 * COCONUT WARS 3.0 — 遊戲狀態
 * ========================================================= */
import { ISLANDS, TEAM_COLORS, RULES } from './config.js';

export const GAME = {
  numTeams: 0,
  numRounds: 0,
  round: 1,
  phase: 'setup',
  teams: {},        // id -> { id, name, color, barracks, coconuts }
  locations: {},    // id -> { ...def, owner, garrison:{team:n} }
  pending: {},      // teamId -> [command,...]
  harvest: [],      // 本回合豐收島 id
  log: [],
  history: [],      // 結算前快照堆疊（緊急退回上一回合用）
};

export function initGame({ numTeams, numRounds, ownership, totals, bonuses }) {
  GAME.numTeams = numTeams;
  GAME.numRounds = numRounds;
  GAME.round = 1;
  GAME.phase = 'command';
  GAME.teams = {};
  GAME.locations = {};
  GAME.pending = {};
  GAME.log = [];
  GAME.history = [];

  for (let i = 0; i < numTeams; i++) {
    const c = TEAM_COLORS[i % TEAM_COLORS.length];
    const bonus = Math.max(0, (bonuses && bonuses[i]) || 0);
    GAME.teams[i] = { id: i, name: `${i} 小`, color: c.hex, colorName: c.name, barracks: 0, coconuts: 0, bonus };
    GAME.pending[i] = [];
  }

  for (const def of ISLANDS) {
    const owner = (def.id in ownership) ? ownership[def.id] : null;
    const garrison = {};
    // 大小島皆 500，額外發放（不從總兵力扣）
    if (owner != null) garrison[owner] = RULES.INIT_ISLAND_TROOPS;
    GAME.locations[def.id] = { ...def, owner, garrison };
  }

  // 總兵力全數放入兵營；島上駐軍為額外贈送，不扣除
  for (let i = 0; i < numTeams; i++) {
    GAME.teams[i].barracks = Math.max(0, totals[i] || 0);
  }

  rollHarvest();
}

// 決定本回合豐收島（最後一回合 → 全島）
export function rollHarvest() {
  const ids = ISLANDS.map(i => i.id);
  if (GAME.round >= GAME.numRounds) { GAME.harvest = ids.slice(); return; }
  const pool = ids.slice();
  const pick = [];
  for (let k = 0; k < RULES.HARVEST_COUNT && pool.length; k++) {
    pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  GAME.harvest = pick;
}

export function isHarvest(id) { return GAME.harvest.includes(id); }
export function isFinalRound() { return GAME.round >= GAME.numRounds; }

// --- 跨視窗同步 ----------------------------------------------
export function exportState() {
  return JSON.parse(JSON.stringify({
    numTeams: GAME.numTeams, numRounds: GAME.numRounds, round: GAME.round,
    phase: GAME.phase, teams: GAME.teams, locations: GAME.locations,
    harvest: GAME.harvest, log: GAME.log,
  }));
}
export function loadState(s) {
  GAME.numTeams = s.numTeams; GAME.numRounds = s.numRounds; GAME.round = s.round;
  GAME.phase = s.phase; GAME.teams = s.teams; GAME.locations = s.locations;
  GAME.harvest = s.harvest || []; GAME.log = s.log || []; GAME.pending = GAME.pending || {};
}

// --- 緊急退回上一回合 --------------------------------------------
// 每次結算「前」拍一張快照（含當回合已輸入的指令）。退回時把整局狀態＋
// 指令一併還原，回到該回合的指令輸入畫面，可修改後重新結算。history 不寫進
// exportState（避免快照滾雪球），故只存在於主控端。
export function snapshotBeforeSettle() {
  GAME.history.push({
    round: GAME.round,
    state: exportState(),
    pending: JSON.parse(JSON.stringify(GAME.pending)),
  });
}
export function canRollback() { return GAME.history.length > 0; }
export function prevRoundNo() {
  const h = GAME.history;
  return h.length ? h[h.length - 1].round : null;
}
export function rollbackHistory() {
  if (!GAME.history.length) return false;
  const snap = GAME.history.pop();
  loadState(snap.state);
  GAME.pending = JSON.parse(JSON.stringify(snap.pending));
  return true;
}

// --- 自動存檔（重新整理補救）--------------------------------------
// 把整局狀態（含 pending 指令與 history 退回堆疊）寫入 localStorage，
// 讓主控端重新整理 / 當掉後可接續。僅主控端呼叫（播放端不寫，避免蓋掉）。
const SAVE_KEY = 'coconut-wars-3-save';
export function saveGame() {
  try {
    const data = { ...exportState(), pending: GAME.pending, history: GAME.history };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (_) {}
}
export function loadSavedGame() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; }
}
export function restoreGame(data) {
  loadState(data);
  GAME.pending = data.pending || {};
  GAME.history = data.history || [];
}
export function clearSavedGame() { try { localStorage.removeItem(SAVE_KEY); } catch (_) {} }

// --- 查詢輔助 ------------------------------------------------
export function garrisonTotal(loc) { return Object.values(loc.garrison).reduce((a, b) => a + b, 0); }
export function teamTotalTroops(teamId) {
  let t = GAME.teams[teamId].barracks;
  for (const loc of Object.values(GAME.locations)) t += loc.garrison[teamId] || 0;
  return t;
}
// 島嶼本回合椰子產出 = 基礎(大800/小500)，豐收島 ×1.5
export function islandYield(loc) {
  const base = RULES.YIELD[loc.type];
  return isHarvest(loc.id) ? Math.round(base * RULES.HARVEST_MULT) : base;
}

// 出發地：兵營 + 己方島嶼
export function sourcesForTeam(teamId) {
  const out = [{ key: 'B', label: '兵營', troops: GAME.teams[teamId].barracks }];
  for (const loc of Object.values(GAME.locations)) {
    if (loc.owner === teamId && (loc.garrison[teamId] || 0) > 0) {
      out.push({ key: loc.id, label: loc.label, troops: loc.garrison[teamId] });
    }
  }
  return out;
}
export function ownIslands(teamId) { return ISLANDS.filter(i => GAME.locations[i.id].owner === teamId); }
export function sourceTroops(teamId, key) {
  if (key === 'B') return GAME.teams[teamId].barracks;
  return GAME.locations[key]?.garrison[teamId] || 0;
}
