/* =========================================================
 * COCONUT WARS 2.0 — 結算引擎
 * 順序：開墾 → 移動 → 攻擊 →（資源發放）
 * 攻擊：同額最高者互相抵銷（各損一半）直到唯一最高者勝出
 *       防守方落敗 → 全部消失
 * ========================================================= */
import { RULES } from './config.js';
import { GAME, garrisonTotal, isHarvest } from './state.js';

// 指令：{ type:'cultivate'|'move'|'attack', S, E, n, team }

export function settleRound() {
  const log = { round: GAME.round, cultivate: [], move: [], attack: [], resource: [], notes: [], events: [] };
  const elBrk = t => `brk-${t}`;
  const elIsl = id => `isl-${id}`;
  const elOf = (team, key) => key === 'B' ? elBrk(team) : elIsl(key);

  // 工作副本
  const barracks = {};
  for (const [tid, t] of Object.entries(GAME.teams)) barracks[tid] = t.barracks;
  const garrison = {};
  for (const [id, loc] of Object.entries(GAME.locations)) garrison[id] = { ...loc.garrison };
  const cult = {};
  for (const [id, loc] of Object.entries(GAME.locations)) cult[id] = loc.cult || 0;

  const srcTroops = (team, S) => S === 'B' ? barracks[team] : (garrison[S]?.[team] || 0);
  const deduct = (team, S, n) => { if (S === 'B') barracks[team] -= n; else garrison[S][team] -= n; };
  const labelOf = k => k === 'B' ? '兵營' : (GAME.locations[k]?.label || k);

  // 收集指令
  const all = [];
  for (const [tid, list] of Object.entries(GAME.pending)) {
    for (const c of list) all.push({ ...c, team: Number(tid) });
  }
  const byType = t => all.filter(c => c.type === t);

  // 超支防呆：同隊同出發地在該階段移出總和 > 現有 → 全數作廢
  const filterOverdraft = (cmds) => {
    const out = {};
    for (const c of cmds) { const k = `${c.team}|${c.S}`; out[k] = (out[k] || 0) + c.n; }
    const bad = new Set();
    for (const [k, v] of Object.entries(out)) {
      const [team, S] = k.split('|');
      if (v > srcTroops(Number(team), S)) bad.add(k);
    }
    const valid = [], invalid = [];
    for (const c of cmds) (bad.has(`${c.team}|${c.S}`) ? invalid : valid).push(c);
    for (const c of invalid) log.notes.push(`↩️ ${c.team}隊 ${c.type} 自 ${labelOf(c.S)} 兵力超支，作廢`);
    return valid;
  };

  // ---------- ① 開墾階段 ----------
  const cCmds = filterOverdraft(byType('cultivate').filter(c => {
    const loc = GAME.locations[c.E];
    if (!loc || loc.owner !== c.team) { log.notes.push(`↩️ ${c.team}隊 開墾 ${labelOf(c.E)} 非己方領地，作廢`); return false; }
    return true;
  }));
  for (const c of cCmds) {
    deduct(c.team, c.S, c.n);
    const add = Math.round(c.n * RULES.CULTIVATE_RATIO);
    cult[c.E] += add;
    log.cultivate.push(`🌱 ${c.team}隊 開墾 ${labelOf(c.E)} 投入 ${c.n} 兵 → 每回合 +${add} 椰子`);
    log.events.push({ phase: 'cultivate', kind: 'seed', from: elOf(c.team, c.S), to: elIsl(c.E), team: c.team, n: c.n });
  }

  // ---------- ② 移動階段 ----------
  const mCmds = filterOverdraft(byType('move').filter(c => {
    const dest = c.E === 'B' ? true : (GAME.locations[c.E]?.owner === c.team);
    if (!dest) { log.notes.push(`↩️ ${c.team}隊 移動至 ${labelOf(c.E)} 非己方領地，作廢`); return false; }
    if (c.n % RULES.STEP) { log.notes.push(`↩️ ${c.team}隊 移動非 100 倍數，作廢`); return false; }
    return true;
  }));
  for (const c of mCmds) {
    deduct(c.team, c.S, c.n);
    if (c.E === 'B') barracks[c.team] += c.n;
    else garrison[c.E][c.team] = (garrison[c.E][c.team] || 0) + c.n;
    log.move.push(`🚶 ${c.team}隊 ${labelOf(c.S)} → ${labelOf(c.E)}（${c.n}）`);
    log.events.push({ phase: 'move', kind: 'person', from: elOf(c.team, c.S), to: elOf(c.team, c.E), team: c.team, n: c.n });
  }

  // ---------- ③ 攻擊階段 ----------
  const aCmds = filterOverdraft(byType('attack').filter(c => {
    if (!GAME.locations[c.E]) return false;
    if (GAME.locations[c.E].owner === c.team) { log.notes.push(`↩️ ${c.team}隊 不能攻擊自己的 ${labelOf(c.E)}，作廢`); return false; }
    if (c.n < RULES.MIN_ATTACK || c.n % RULES.STEP) { log.notes.push(`↩️ ${c.team}隊 進攻兵力不合門檻，作廢`); return false; }
    return true;
  }));
  // 依目標彙整攻方（同隊多路相加），並扣除來源
  const attackers = {}; // E -> {team:n}
  for (const c of aCmds) {
    deduct(c.team, c.S, c.n);
    attackers[c.E] = attackers[c.E] || {};
    attackers[c.E][c.team] = (attackers[c.E][c.team] || 0) + c.n;
    log.events.push({ phase: 'attack', kind: 'sword', from: elOf(c.team, c.S), to: elIsl(c.E), team: c.team, n: c.n });
  }

  for (const [E, atk] of Object.entries(attackers)) {
    const loc = GAME.locations[E];
    const attackList = Object.entries(atk).map(([team, n]) => ({ team: Number(team), troops: n }));
    const defTeam = loc.owner;
    const defTroops = defTeam != null ? (garrison[E][defTeam] || 0) : 0;

    const { outcome, retreats, steps } = resolveBattle(attackList, defTeam, defTroops);
    // 抵銷後撤退的兵 → 回到兵營
    for (const [t, n] of Object.entries(retreats)) barracks[t] = (barracks[t] || 0) + n;

    if (outcome.type === 'neutral') { garrison[E] = {}; loc.owner = null; }
    else if (outcome.type === 'hold') { garrison[E] = { [defTeam]: outcome.troops }; loc.owner = defTeam; }
    else if (outcome.type === 'capture') { garrison[E] = { [outcome.team]: outcome.troops }; loc.owner = outcome.team; }

    for (const s of steps) log.attack.push(`【${loc.label}】${s}`);
    log.events.push({ phase: 'attack', kind: 'clash', at: elIsl(E),
      result: outcome.type === 'capture' ? `${outcome.team}隊佔領 ${loc.label}（剩 ${outcome.troops}）`
        : outcome.type === 'hold' ? `${defTeam}隊守住 ${loc.label}` : `${loc.label} 成空島` });
  }

  // 回寫戰後狀態
  for (const [tid, b] of Object.entries(barracks)) GAME.teams[tid].barracks = Math.max(0, Math.round(b));
  for (const [id, g] of Object.entries(garrison)) {
    const clean = {};
    for (const [t, n] of Object.entries(g)) if (Math.round(n) > 0) clean[t] = Math.round(n);
    GAME.locations[id].garrison = clean;
    GAME.locations[id].cult = cult[id];
    GAME.locations[id].owner = Object.keys(clean).length ? Number(Object.keys(clean)[0]) : null;
  }

  // ---------- 資源發放（含豐收 ×1.5）----------
  for (const loc of Object.values(GAME.locations)) {
    const owner = loc.owner;
    if (owner == null || garrisonTotal(loc) <= 0) continue;
    let yieldC = RULES.YIELD[loc.type] + (loc.cult || 0);
    const harvest = isHarvest(loc.id);
    if (harvest) yieldC = Math.round(yieldC * RULES.HARVEST_MULT);
    GAME.teams[owner].coconuts += yieldC;
    log.resource.push(`🥥 ${loc.label} 產出 ${yieldC} 椰子${harvest ? '（🌾豐收 ×1.5）' : ''} → ${owner}隊`);
    log.events.push({ phase: 'resource', kind: 'coconut', at: `isl-${loc.id}`, coconut: yieldC, harvest });
  }

  GAME.log = log;
  for (const k of Object.keys(GAME.pending)) GAME.pending[k] = [];
  return log;
}

// ---------------------------------------------------------
// 攻擊裁決
// 第一階段（攻方內鬥）：多支進攻同一島的部隊，找出目前最高兵力；
//   若「同為最高」有多方 → 這些方各損一半、另一半撤回兵營，並喪失攻擊資格；
//   往下一層比，直到出現「唯一最高的攻方」＝突圍者（challenger）。
//   其餘未突圍的較弱攻方 → 進攻失敗、全滅。
// 第二階段（突圍者 vs 守軍）：
//   突圍者 > 守軍 → 佔領，扣掉守軍兵力後留駐；守軍全滅。
//   突圍者 < 守軍 → 守方守住，扣掉突圍者兵力後留駐；突圍者全滅。
//   相等 → 同歸於盡，成空島。
//   無守軍 → 突圍者直接佔領（不扣兵）。
//   攻方全數抵銷 → 守方原封守住 / 無守軍則成空島。
// 回傳 { outcome, retreats:{team:n}, steps:[文字] }
//   outcome: {type:'capture',team,troops} | {type:'hold',troops} | {type:'neutral'}
// ---------------------------------------------------------
function resolveBattle(attackList, defTeam, defTroops) {
  let atk = attackList.filter(a => a.troops > 0).map(a => ({ ...a }));
  const retreats = {}, steps = [];

  // 第一階段：攻方同額抵銷，選出突圍者
  let guard = 0;
  while (atk.length > 1 && guard++ < 200) {
    const max = Math.max(...atk.map(a => a.troops));
    const tied = atk.filter(a => a.troops === max);
    if (tied.length >= 2) {
      for (const p of tied) {
        const back = p.troops - Math.floor(p.troops / 2); // 一半消失、一半撤回
        retreats[p.team] = (retreats[p.team] || 0) + back;
      }
      steps.push(`${tied.map(p => p.team + '隊').join('、')} 同為最高 ${max} → 互相抵銷（一半消失、一半撤回兵營），喪失攻擊資格`);
      atk = atk.filter(a => a.troops !== max);
    } else break; // 出現唯一最高攻方
  }

  let challenger = null;
  if (atk.length >= 1) {
    atk.sort((a, b) => b.troops - a.troops);
    challenger = atk[0];
    const losers = atk.slice(1);
    if (losers.length) steps.push(`${losers.map(p => p.team + '隊').join('、')} 未突圍，進攻失敗（全滅）`);
  }

  // 第二階段：突圍者 vs 守軍
  if (!challenger) {
    if (defTroops > 0) { steps.push(`守方 ${defTeam}隊 無人突圍，守住（留 ${defTroops} 兵）`); return { outcome: { type: 'hold', troops: defTroops }, retreats, steps }; }
    steps.push('攻方全數抵銷，成無人空島');
    return { outcome: { type: 'neutral' }, retreats, steps };
  }
  if (defTroops === 0) {
    steps.push(`${challenger.team}隊 以 ${challenger.troops} 兵佔領無守軍島嶼（留 ${challenger.troops}）`);
    return { outcome: { type: 'capture', team: challenger.team, troops: challenger.troops }, retreats, steps };
  }
  if (challenger.troops > defTroops) {
    const left = challenger.troops - defTroops;
    steps.push(`${challenger.team}隊 ${challenger.troops} 攻破守軍 ${defTroops}，佔領（扣守軍後留 ${left} 兵）`);
    return { outcome: { type: 'capture', team: challenger.team, troops: left }, retreats, steps };
  }
  if (challenger.troops < defTroops) {
    const left = defTroops - challenger.troops;
    steps.push(`守方 ${defTeam}隊 ${defTroops} 擋下 ${challenger.team}隊 ${challenger.troops}，守住（留 ${left} 兵）`);
    return { outcome: { type: 'hold', troops: left }, retreats, steps };
  }
  steps.push(`${challenger.team}隊 ${challenger.troops} 與守軍 ${defTroops} 同歸於盡，成無人空島`);
  return { outcome: { type: 'neutral' }, retreats, steps };
}
