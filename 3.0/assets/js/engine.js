/* =========================================================
 * COCONUT WARS 3.0 — 結算引擎
 * 順序：移動 → 攻擊 → 訓練 →（資源發放）
 * 攻擊：攻方比最高；平手各折損 500 後退回原地、喪失資格；
 *       選出唯一突圍者後與守軍相減。
 * ========================================================= */
import { RULES } from './config.js';
import { GAME, garrisonTotal, isHarvest } from './state.js';

const COCO = '<img class="coco-ic" src="assets/img/coconut.png" alt="椰子">';

// 指令：{ type:'move'|'attack'|'train', S, E, n, team }

export function settleRound() {
  const log = { round: GAME.round, move: [], attack: [], train: [], resource: [], notes: [], events: [] };
  const elBrk = t => `brk-${t}`;
  const elIsl = id => `isl-${id}`;
  const elOf = (team, key) => key === 'B' ? elBrk(team) : elIsl(key);

  // 工作副本
  const barracks = {};
  for (const [tid, t] of Object.entries(GAME.teams)) barracks[tid] = t.barracks;
  const garrison = {};
  for (const [id, loc] of Object.entries(GAME.locations)) garrison[id] = { ...loc.garrison };

  const srcTroops = (team, S) => S === 'B' ? barracks[team] : (garrison[S]?.[team] || 0);
  const deduct = (team, S, n) => { if (S === 'B') barracks[team] -= n; else garrison[S][team] -= n; };
  const credit = (team, S, n) => { if (S === 'B') barracks[team] = (barracks[team] || 0) + n; else garrison[S][team] = (garrison[S][team] || 0) + n; };
  const labelOf = k => k === 'B' ? '兵營' : (GAME.locations[k]?.label || k);

  const all = [];
  for (const [tid, list] of Object.entries(GAME.pending)) for (const c of list) all.push({ ...c, team: Number(tid) });
  const byType = t => all.filter(c => c.type === t);

  // 超支防呆：同隊同出發地在該階段移出總和 > 現有 → 全數作廢
  const filterOverdraft = (cmds) => {
    const out = {};
    for (const c of cmds) { const k = `${c.team}|${c.S}`; out[k] = (out[k] || 0) + c.n; }
    const bad = new Set();
    for (const [k, v] of Object.entries(out)) { const [team, S] = k.split('|'); if (v > srcTroops(Number(team), S)) bad.add(k); }
    const valid = [];
    for (const c of cmds) { if (bad.has(`${c.team}|${c.S}`)) log.notes.push(`↩️ ${c.team}小 ${cn(c.type)} 自 ${labelOf(c.S)} 兵力超支，作廢`); else valid.push(c); }
    return valid;
  };

  // ---------- ① 移動階段（每指令上限 500）----------
  const mCmds = filterOverdraft(byType('move').filter(c => {
    const dest = c.E === 'B' ? true : (GAME.locations[c.E]?.owner === c.team);
    if (!dest) { log.notes.push(`↩️ ${c.team}小 移動至 ${labelOf(c.E)} 非己方領地，作廢`); return false; }
    if (c.n % RULES.STEP) { log.notes.push(`↩️ ${c.team}小 移動非 100 倍數，作廢`); return false; }
    // 第一回合移動不限額；之後每指令上限 MOVE_MAX
    if (GAME.round > 1 && c.n > RULES.MOVE_MAX) { log.notes.push(`↩️ ${c.team}小 移動 ${c.n} 超過單指令上限 ${RULES.MOVE_MAX}，作廢`); return false; }
    return true;
  }));
  for (const c of mCmds) {
    deduct(c.team, c.S, c.n);
    credit(c.team, c.E, c.n);
    log.move.push(`🚶 ${c.team}小 ${labelOf(c.S)} → ${labelOf(c.E)}（${c.n}）`);
    log.events.push({ phase: 'move', kind: 'person', from: elOf(c.team, c.S), to: elOf(c.team, c.E), team: c.team, n: c.n });
  }

  // ---------- ② 攻擊階段 ----------
  const aCmds = filterOverdraft(byType('attack').filter(c => {
    if (!GAME.locations[c.E]) return false;
    if (GAME.locations[c.E].owner === c.team) { log.notes.push(`↩️ ${c.team}小 不能攻擊自己的 ${labelOf(c.E)}，作廢`); return false; }
    if (c.n < RULES.MIN_ATTACK || c.n % RULES.STEP) { log.notes.push(`↩️ ${c.team}小 進攻兵力不合門檻，作廢`); return false; }
    return true;
  }));
  // 依目標彙整攻方（同隊多來源相加，並記錄各來源以便退兵）
  const attackers = {}; // E -> { team: { troops, sources:{srcKey:amt} } }
  for (const c of aCmds) {
    deduct(c.team, c.S, c.n);
    const t = (attackers[c.E] = attackers[c.E] || {});
    const rec = (t[c.team] = t[c.team] || { troops: 0, sources: {} });
    rec.troops += c.n; rec.sources[c.S] = (rec.sources[c.S] || 0) + c.n;
    log.events.push({ phase: 'attack', kind: 'sword', from: elOf(c.team, c.S), to: elIsl(c.E), team: c.team, n: c.n });
  }

  // 退兵累計（回原本的出發地）：retreatMap[team][srcKey] = 兵
  const retreatMap = {};
  const queueRetreat = (team, sources, committed, back) => {
    if (back <= 0) return;
    const entries = Object.entries(sources);
    let remaining = back;
    entries.forEach(([k, amt], i) => {
      const give = i === entries.length - 1 ? remaining : Math.min(remaining, Math.round(back * amt / committed));
      remaining -= give;
      retreatMap[team] = retreatMap[team] || {}; retreatMap[team][k] = (retreatMap[team][k] || 0) + give;
    });
  };

  for (const [E, atk] of Object.entries(attackers)) {
    const loc = GAME.locations[E];
    const attackList = Object.entries(atk).map(([team, r]) => ({ team: Number(team), troops: r.troops }));
    const defTeam = loc.owner;
    const defTroops = defTeam != null ? (garrison[E][defTeam] || 0) : 0;

    const { outcome, retreats, steps } = resolveBattle(attackList, defTeam, defTroops);
    // 各隊退兵 → 依來源比例回到原地
    for (const [team, back] of Object.entries(retreats)) {
      const rec = atk[team];
      queueRetreat(Number(team), rec.sources, rec.troops, back);
    }

    if (outcome.type === 'neutral') { garrison[E] = {}; loc.owner = null; }
    else if (outcome.type === 'hold') { garrison[E] = { [defTeam]: outcome.troops }; loc.owner = defTeam; }
    else if (outcome.type === 'capture') { garrison[E] = { [outcome.team]: outcome.troops }; loc.owner = outcome.team; }

    for (const s of steps) log.attack.push(`【${loc.label}】${s}`);
    log.events.push({ phase: 'attack', kind: 'clash', at: elIsl(E),
      result: outcome.type === 'capture' ? `${outcome.team}小佔領 ${loc.label}（剩 ${outcome.troops}）`
        : outcome.type === 'hold' ? `${defTeam}小守住 ${loc.label}` : `${loc.label} 成空島` });
  }

  // 套用退兵：兵營直接回；島嶼來源若戰後仍屬該隊則回該島，否則退回兵營
  for (const [team, srcs] of Object.entries(retreatMap)) {
    for (const [k, amt] of Object.entries(srcs)) {
      if (amt <= 0) continue;
      if (k === 'B' || GAME.locations[k]?.owner !== Number(team)) barracks[team] = (barracks[team] || 0) + amt;
      else garrison[k][team] = (garrison[k][team] || 0) + amt;
    }
  }

  // ---------- ③ 訓練階段（每隊最多一次）----------
  const trainTeams = [...new Set(byType('train').map(c => c.team))];
  for (const team of trainTeams) {
    const before = Math.max(0, Math.round(barracks[team] || 0));
    const gain = Math.floor(before / RULES.TRAIN_UNIT) * RULES.TRAIN_GAIN;
    if (gain > 0) {
      barracks[team] += gain;
      log.train.push(`🏋️ ${team}小 訓練：兵營 ${before} → +${gain}（每滿 ${RULES.TRAIN_UNIT} +${RULES.TRAIN_GAIN}）`);
      log.events.push({ phase: 'train', kind: 'train', at: elBrk(team), team, gain });
    } else {
      log.train.push(`🏋️ ${team}小 訓練：兵營 ${before} 不足 ${RULES.TRAIN_UNIT}，無增援`);
    }
  }

  // 回寫戰後狀態
  for (const [tid, b] of Object.entries(barracks)) GAME.teams[tid].barracks = Math.max(0, Math.round(b));
  for (const [id, g] of Object.entries(garrison)) {
    const clean = {};
    for (const [t, n] of Object.entries(g)) if (Math.round(n) > 0) clean[t] = Math.round(n);
    GAME.locations[id].garrison = clean;
    GAME.locations[id].owner = Object.keys(clean).length ? Number(Object.keys(clean)[0]) : null;
  }

  // ---------- 資源發放（含豐收 ×1.5）----------
  for (const loc of Object.values(GAME.locations)) {
    const owner = loc.owner;
    if (owner == null || garrisonTotal(loc) <= 0) continue;
    let yieldC = RULES.YIELD[loc.type];
    const harvest = isHarvest(loc.id);
    if (harvest) yieldC = Math.round(yieldC * RULES.HARVEST_MULT);
    GAME.teams[owner].coconuts += yieldC;
    log.resource.push(`${COCO} ${loc.label} 產出 ${yieldC} 椰子${harvest ? '（🌾豐收 ×1.5）' : ''} → ${owner}小`);
    log.events.push({ phase: 'resource', kind: 'coconut', at: `isl-${loc.id}`, coconut: yieldC, harvest });
  }

  GAME.log = log;
  for (const k of Object.keys(GAME.pending)) GAME.pending[k] = [];
  return log;
}

function cn(t) { return { move: '移動', attack: '攻擊', train: '訓練' }[t] || t; }

// ---------------------------------------------------------
// 攻擊裁決
// 第一階段：攻方比最高。唯一最高＝突圍者，其餘退回原地（保留兵力）。
//   平手最高 → 各折損 500（不足扣光），剩餘退回原地、喪失資格；較低者留場，重複。
// 第二階段：突圍者 vs 守軍相減（同 2.0）。
// 回傳 { outcome, retreats:{team:兵}, steps:[文字] }
// ---------------------------------------------------------
function resolveBattle(attackList, defTeam, defTroops) {
  let atk = attackList.filter(a => a.troops > 0).map(a => ({ ...a }));
  const retreats = {}, steps = [];
  let challenger = null, guard = 0;

  while (guard++ < 200) {
    if (atk.length === 0) break;
    if (atk.length === 1) { challenger = atk[0]; break; }
    const max = Math.max(...atk.map(a => a.troops));
    const tied = atk.filter(a => a.troops === max);
    if (tied.length === 1) {
      challenger = tied[0];
      const losers = atk.filter(a => a !== challenger);
      for (const l of losers) retreats[l.team] = (retreats[l.team] || 0) + l.troops;
      if (losers.length) steps.push(`${losers.map(l => l.team + '小').join('、')} 非最高，退回原地、喪失攻擊資格`);
      break;
    }
    // 平手：各折損 500（不足扣光），剩餘退回原地、出局
    const tiedSet = new Set(tied);
    for (const p of tied) {
      const loss = Math.min(RULES.TIE_LOSS, p.troops);
      p.troops -= loss;
      retreats[p.team] = (retreats[p.team] || 0) + p.troops;
    }
    steps.push(`${tied.map(p => p.team + '小').join('、')} 同為最高 ${max} → 各折損 ${RULES.TIE_LOSS} 後退回原地、喪失攻擊資格`);
    atk = atk.filter(a => !tiedSet.has(a));
  }

  // 第二階段：突圍者 vs 守軍
  if (!challenger) {
    if (defTroops > 0) { steps.push(`守方 ${defTeam}小 無人突圍，守住（留 ${defTroops} 兵）`); return { outcome: { type: 'hold', troops: defTroops }, retreats, steps }; }
    steps.push('攻方全數退場，維持空島');
    return { outcome: { type: 'neutral' }, retreats, steps };
  }
  if (defTroops === 0) {
    steps.push(`${challenger.team}小 以 ${challenger.troops} 兵佔領無守軍島嶼（留 ${challenger.troops}）`);
    return { outcome: { type: 'capture', team: challenger.team, troops: challenger.troops }, retreats, steps };
  }
  if (challenger.troops > defTroops) {
    const left = challenger.troops - defTroops;
    steps.push(`${challenger.team}小 ${challenger.troops} 攻破守軍 ${defTroops}，佔領（扣守軍後留 ${left} 兵）`);
    return { outcome: { type: 'capture', team: challenger.team, troops: left }, retreats, steps };
  }
  if (challenger.troops < defTroops) {
    const left = defTroops - challenger.troops;
    steps.push(`守方 ${defTeam}小 ${defTroops} 擋下 ${challenger.team}小 ${challenger.troops}，守住（留 ${left} 兵）`);
    return { outcome: { type: 'hold', troops: left }, retreats, steps };
  }
  steps.push(`${challenger.team}小 ${challenger.troops} 與守軍 ${defTroops} 同歸於盡，成無人空島`);
  return { outcome: { type: 'neutral' }, retreats, steps };
}
