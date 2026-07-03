/* =========================================================
 * COCONUT WARS — 遊戲狀態模型
 * ========================================================= */
import { ISLANDS, TEAM_COLORS, RULES } from './config.js';

export const GAME = {
  numTeams: 0,
  numRounds: 0,
  round: 1,
  phase: 'setup',      // setup | command | done
  teams: {},           // id -> { id, name, color, barracks, coconuts, reliefTroops }
  locations: {},       // id -> { ...def, owner, garrison:{teamId:n} }
  pending: {},          // teamId -> [command,...]
  log: [],             // 上一回合結算紀錄
};

// 建立初始狀態
export function initGame({ numTeams, numRounds, ownership, totals }) {
  GAME.numTeams = numTeams;
  GAME.numRounds = numRounds;
  GAME.round = 1;
  GAME.phase = 'command';
  GAME.teams = {};
  GAME.locations = {};
  GAME.pending = {};
  GAME.log = [];

  // 建立隊伍（第 0 隊 ~ 第 numTeams-1 隊）
  for (let i = 0; i < numTeams; i++) {
    const c = TEAM_COLORS[i % TEAM_COLORS.length];
    GAME.teams[i] = {
      id: i,
      name: `${i} 隊`,
      color: c.hex,
      colorName: c.name,
      barracks: 0,
      coconuts: 0,
    };
    GAME.pending[i] = [];
  }

  // 建立島嶼（注意：隊伍 0 為 falsy，一律用 != null 判定）
  for (const def of ISLANDS) {
    const owner = (def.id in ownership) ? ownership[def.id] : null; // teamId or null
    const garrison = {};
    if (owner != null) {
      const n = def.type === 'big' ? RULES.BIG_ISLAND_TROOPS
              : def.type === 'small' ? RULES.SMALL_ISLAND_TROOPS : 0;
      if (n > 0) garrison[owner] = n;
    }
    GAME.locations[def.id] = {
      ...def,
      owner: (def.type === 'money' || def.type === 'arsenal') ? null : owner,
      garrison,
    };
  }

  // 分發兵營兵力：總兵力 - 島上初始駐軍
  for (let i = 0; i < numTeams; i++) {
    const total = totals[i] || 0;
    let onIsland = 0;
    for (const loc of Object.values(GAME.locations)) {
      onIsland += loc.garrison[i] || 0;
    }
    GAME.teams[i].barracks = Math.max(0, total - onIsland);
  }
}

// --- 跨視窗狀態同步 ------------------------------------------
export function exportState() {
  return JSON.parse(JSON.stringify({
    numTeams: GAME.numTeams, numRounds: GAME.numRounds, round: GAME.round,
    phase: GAME.phase, teams: GAME.teams, locations: GAME.locations, log: GAME.log,
  }));
}
export function loadState(s) {
  GAME.numTeams = s.numTeams; GAME.numRounds = s.numRounds; GAME.round = s.round;
  GAME.phase = s.phase; GAME.teams = s.teams; GAME.locations = s.locations;
  GAME.log = s.log || []; GAME.pending = GAME.pending || {};
}

// --- 查詢輔助 ------------------------------------------------
export function isResourceOpen() {
  return GAME.round >= RULES.RESOURCE_OPEN_ROUND;
}

export function garrisonTotal(loc) {
  return Object.values(loc.garrison).reduce((a, b) => a + b, 0);
}

// 隊伍全場總兵力（兵營 + 所有島嶼駐軍）
export function teamTotalTroops(teamId) {
  let t = GAME.teams[teamId].barracks;
  for (const loc of Object.values(GAME.locations)) {
    t += loc.garrison[teamId] || 0;
  }
  return t;
}

// 某隊可作為出發地的地點（兵營 + 己方大島）
export function sourcesForTeam(teamId) {
  const out = [{ key: 'B', label: `${teamId}隊 專屬兵營`, troops: GAME.teams[teamId].barracks }];
  for (const loc of Object.values(GAME.locations)) {
    if (loc.type === 'big' && loc.owner === teamId && (loc.garrison[teamId] || 0) > 0) {
      out.push({ key: loc.id, label: loc.label, troops: loc.garrison[teamId] });
    }
  }
  return out;
}

export function sourceTroops(teamId, key) {
  if (key === 'B') return GAME.teams[teamId].barracks;
  return GAME.locations[key]?.garrison[teamId] || 0;
}
