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
    const add = Math.floor(c.n / 100) * RULES.CULTIVATE_PER_100;
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
    // 參戰勢力：各攻方 + 守方（現駐軍）
    const parties = [];
    for (const [team, n] of Object.entries(atk)) parties.push({ team: Number(team), troops: n, def: false });
    const defTeam = loc.owner;
    const defTroops = defTeam != null ? (garrison[E][defTeam] || 0) : 0;
    if (defTroops > 0) parties.push({ team: defTeam, troops: defTroops, def: true });

    const { winner, retreats, steps } = resolveBattle(parties);
    // 抵銷後撤退的兵 → 回到兵營
    for (const [t, n] of Object.entries(retreats)) barracks[t] = (barracks[t] || 0) + n;

    if (!winner) { garrison[E] = {}; loc.owner = null; }
    else { garrison[E] = { [winner.team]: winner.troops }; loc.owner = winner.team; }

    for (const s of steps) log.attack.push(`【${loc.label}】${s}`);
    if (!winner) log.attack.push(`【${loc.label}】各方抵銷殆盡，成為無人空島`);
    log.events.push({ phase: 'attack', kind: 'clash', at: elIsl(E),
      result: winner ? `${winner.team}隊佔領 ${loc.label}（剩 ${winner.troops}）` : `${loc.label} 成空島` });
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
// ・找出目前最高兵力；若「同為最高」有多方 → 這些方各損一半後喪失攻擊資格
//   （存活的一半撤回兵營），再往下一層比。
// ・直到出現「唯一最高者」→ 勝出，扣掉次強者的兵力後留駐該島；其餘落敗者全滅。
// 回傳 { winner:{team,troops,def}|null, retreats:{team:n}, steps:[文字] }
// ---------------------------------------------------------
function resolveBattle(parties) {
  let ps = parties.filter(p => p.troops > 0).map(p => ({ ...p }));
  const retreats = {}, steps = [];
  const nm = p => `${p.team}隊${p.def ? '(守)' : ''}`;
  if (ps.length === 0) return { winner: null, retreats, steps };

  let guard = 0;
  while (guard++ < 200) {
    if (ps.length === 1) {
      const w = ps[0];
      steps.push(`${nm(w)} 無對手，${w.def ? '守住' : '佔領'}，留 ${w.troops} 兵`);
      return { winner: w, retreats, steps };
    }
    const max = Math.max(...ps.map(p => p.troops));
    const tied = ps.filter(p => p.troops === max);
    if (tied.length >= 2) {
      for (const p of tied) {
        const survive = p.troops - Math.floor(p.troops / 2); // 撤退存活的一半
        retreats[p.team] = (retreats[p.team] || 0) + survive;
      }
      steps.push(`${tied.map(nm).join('、')} 同為最高 ${max} → 互相抵銷，各損一半後出局（存活撤回兵營）`);
      ps = ps.filter(p => p.troops !== max);   // 同額最高全部喪失攻擊資格
      continue;
    }
    // 唯一最高者勝出
    const winner = tied[0];
    const others = ps.filter(p => p !== winner);
    const runnerUp = others.length ? Math.max(...others.map(p => p.troops)) : 0;
    const orig = winner.troops;
    winner.troops = orig - runnerUp;
    steps.push(`${nm(winner)} 以 ${orig} 勝出（扣次強 ${runnerUp}），${winner.def ? '守住' : '佔領'}，留 ${winner.troops} 兵`);
    return { winner: winner.troops > 0 ? winner : null, retreats, steps };
  }
  return { winner: null, retreats, steps };
}
