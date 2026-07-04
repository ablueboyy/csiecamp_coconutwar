/* =========================================================
 * COCONUT WARS 2.0 — 遊戲狀態
 * ========================================================= */
import { ISLANDS, TEAM_COLORS, RULES } from './config.js';

export const GAME = {
  numTeams: 0,
  numRounds: 0,
  round: 1,
  phase: 'setup',
  teams: {},        // id -> { id, name, color, barracks, coconuts }
  locations: {},    // id -> { ...def, owner, garrison:{team:n}, cult }  (cult = 每回合椰子加成)
  pending: {},      // teamId -> [command,...]
  harvest: [],      // 本回合豐收島 id
  log: [],
};

export function initGame({ numTeams, numRounds, ownership, totals }) {
  GAME.numTeams = numTeams;
  GAME.numRounds = numRounds;
  GAME.round = 1;
  GAME.phase = 'command';
  GAME.teams = {};
  GAME.locations = {};
  GAME.pending = {};
  GAME.log = [];

  for (let i = 0; i < numTeams; i++) {
    const c = TEAM_COLORS[i % TEAM_COLORS.length];
    GAME.teams[i] = { id: i, name: `${i} 隊`, color: c.hex, colorName: c.name, barracks: 0, coconuts: 0 };
    GAME.pending[i] = [];
  }

  for (const def of ISLANDS) {
    const owner = (def.id in ownership) ? ownership[def.id] : null;
    const garrison = {};
    if (owner != null) {
      const n = def.type === 'big' ? RULES.BIG_ISLAND_TROOPS : RULES.SMALL_ISLAND_TROOPS;
      garrison[owner] = n;
    }
    GAME.locations[def.id] = { ...def, owner, garrison, cult: 0 };
  }

  for (let i = 0; i < numTeams; i++) {
    const total = totals[i] || 0;
    let onIsland = 0;
    for (const loc of Object.values(GAME.locations)) onIsland += loc.garrison[i] || 0;
    GAME.teams[i].barracks = Math.max(0, total - onIsland);
  }

  rollHarvest();
}

// 決定本回合豐收島（最後一回合 → 全島）
export function rollHarvest() {
  const ids = ISLANDS.map(i => i.id);
  if (GAME.round >= GAME.numRounds) {
    GAME.harvest = ids.slice();
    return;
  }
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

// --- 查詢輔助 ------------------------------------------------
export function garrisonTotal(loc) {
  return Object.values(loc.garrison).reduce((a, b) => a + b, 0);
}
export function teamTotalTroops(teamId) {
  let t = GAME.teams[teamId].barracks;
  for (const loc of Object.values(GAME.locations)) t += loc.garrison[teamId] || 0;
  return t;
}
// 開墾加成（椰子/回合）
export function cultBonus(loc) { return loc.cult || 0; }

// 出發地：兵營 + 己方島嶼
export function sourcesForTeam(teamId) {
  const out = [{ key: 'B', label: `${teamId}隊 專屬兵營`, troops: GAME.teams[teamId].barracks }];
  for (const loc of Object.values(GAME.locations)) {
    if (loc.owner === teamId && (loc.garrison[teamId] || 0) > 0) {
      out.push({ key: loc.id, label: loc.label, troops: loc.garrison[teamId] });
    }
  }
  return out;
}
export function ownIslands(teamId) {
  return ISLANDS.filter(i => GAME.locations[i.id].owner === teamId);
}
export function sourceTroops(teamId, key) {
  if (key === 'B') return GAME.teams[teamId].barracks;
  return GAME.locations[key]?.garrison[teamId] || 0;
}
