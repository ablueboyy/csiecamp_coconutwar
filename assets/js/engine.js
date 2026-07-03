/* =========================================================
 * COCONUT WARS — 結算引擎
 * 指令合法性判定、結盟裁決、開戰結算、資源發放
 * ========================================================= */
import { RULES } from './config.js';
import { GAME, isResourceOpen, garrisonTotal, teamTotalTroops, sourceTroops } from './state.js';

// 指令格式： { type:'move'|'help'|'accept'|'attack', S, E, n, P:[teamId,...] }

// ---------------------------------------------------------
// 主結算流程
// ---------------------------------------------------------
export function settleRound() {
  const log = { round: GAME.round, defense: [], attack: [], resource: [], notes: [], events: [] };
  // 動畫事件座標鍵：兵營 = `brk-<team>`，島嶼 = `isl-<id>`
  const elBrk = t => `brk-${t}`;
  const elIsl = id => `isl-${id}`;
  const elOf = (team, key) => key === 'B' ? elBrk(team) : elIsl(key);

  // 快照回合開始狀態（先出後入 / 狀態凍結）
  const startGarrison = {};
  for (const [id, loc] of Object.entries(GAME.locations)) {
    startGarrison[id] = { ...loc.garrison };
  }

  // 收集所有指令，標記合法性
  const cmds = [];
  for (const [tid, list] of Object.entries(GAME.pending)) {
    for (const c of list) cmds.push({ ...c, team: Number(tid), valid: true, reason: '' });
  }

  // --- 判定 1：第一回合資源點封鎖 ---------------------------
  if (!isResourceOpen()) {
    for (const c of cmds) {
      const loc = GAME.locations[c.E];
      if (loc && (loc.type === 'money' || loc.type === 'arsenal')) {
        c.valid = false;
        c.reason = '第一回合資源點封鎖，兵力原地遣返';
      }
    }
  }

  // --- 判定 2：兵力超支（同隊同出發地移出總和 > 現有）--------
  const outBySource = {}; // `${team}|${S}` -> total
  for (const c of cmds) {
    if (!c.valid) continue;
    if (c.type === 'accept') continue; // accept 不移兵
    const k = `${c.team}|${c.S}`;
    outBySource[k] = (outBySource[k] || 0) + c.n;
  }
  const overdraftKeys = new Set();
  for (const [k, out] of Object.entries(outBySource)) {
    const [team, S] = k.split('|');
    if (out > sourceTroops(Number(team), S)) overdraftKeys.add(k);
  }
  for (const c of cmds) {
    if (!c.valid || c.type === 'accept') continue;
    if (overdraftKeys.has(`${c.team}|${c.S}`)) {
      c.valid = false;
      c.reason = `出發地 ${labelOf(c.S)} 兵力超支，相關指令全數原地遣返`;
    }
  }

  // 記錄被遣返的指令
  for (const c of cmds) {
    if (!c.valid) log.notes.push(`${c.team}隊 ${describe(c)} → ${c.reason}`);
  }

  // --- 扣除出發地兵力（有效指令）---------------------------
  // 以工作副本進行，最後再回寫
  const barracks = {};
  for (const [tid, t] of Object.entries(GAME.teams)) barracks[tid] = t.barracks;
  const garrison = {};
  for (const [id, loc] of Object.entries(GAME.locations)) garrison[id] = { ...loc.garrison };

  const deduct = (team, S, n) => {
    if (S === 'B') barracks[team] -= n;
    else garrison[S][team] -= n;
  };
  for (const c of cmds) {
    if (!c.valid || c.type === 'accept') continue;
    deduct(c.team, c.S, c.n);
  }

  // --- 內部運兵 move ---------------------------------------
  for (const c of cmds) {
    if (!c.valid || c.type !== 'move') continue;
    if (c.E === 'B') barracks[c.team] += c.n;
    else garrison[c.E][c.team] = (garrison[c.E][c.team] || 0) + c.n;
    log.events.push({ phase: 'move', kind: 'person', from: elOf(c.team, c.S), to: elOf(c.team, c.E), team: c.team, n: c.n });
  }

  // --- 協防 help / accept 配對 -----------------------------
  // accept(E,P)：領地主人開城門
  const accepts = new Set(); // `${ownerTeam}|${E}|${helperTeam}`
  for (const c of cmds) {
    if (!c.valid || c.type !== 'accept') continue;
    for (const p of c.P) accepts.add(`${c.team}|${c.E}|${p}`);
  }
  const acceptedHelp = {}; // E -> {helperTeam:n}
  for (const c of cmds) {
    if (!c.valid || c.type !== 'help') continue;
    const owner = c.P[0]; // 協防對象隊伍代號
    const key = `${owner}|${c.E}|${c.team}`;
    if (accepts.has(key)) {
      acceptedHelp[c.E] = acceptedHelp[c.E] || {};
      acceptedHelp[c.E][c.team] = (acceptedHelp[c.E][c.team] || 0) + c.n;
      log.defense.push(`✅ ${c.team}隊 派 ${c.n} 兵協防 ${labelOf(c.E)}（${owner}隊 已開城門）`);
      log.events.push({ phase: 'defense', kind: 'shield', from: elOf(c.team, c.S), to: elIsl(c.E), team: c.team, n: c.n });
    } else {
      barracks[c.team] += 0; // 遣返回出發地
      returnTroops(c, barracks, garrison);
      log.defense.push(`↩️ ${c.team}隊 協防 ${labelOf(c.E)} 失敗（${owner}隊 未 accept），兵力遣返`);
    }
  }

  // --- 進攻 attack：分組結盟 + 衝突裁決 ----------------------
  const attacksByTarget = {}; // E -> [cmd]
  for (const c of cmds) {
    if (!c.valid || c.type !== 'attack') continue;
    (attacksByTarget[c.E] = attacksByTarget[c.E] || []).push(c);
  }

  // 每個被攻擊的目標，先算防守聯合，再算進攻聯軍，最後開戰
  const attackedIds = new Set(Object.keys(attacksByTarget));

  // 計算每個地點的防守方（駐留 + 已接受協防）
  const defenseAt = (E) => {
    const d = {};
    for (const [team, n] of Object.entries(garrison[E])) if (n > 0) d[team] = n;
    if (acceptedHelp[E]) for (const [team, n] of Object.entries(acceptedHelp[E])) d[team] = (d[team] || 0) + n;
    return d;
  };

  // 防守聯合登記（顯示用）
  for (const loc of Object.values(GAME.locations)) {
    const d = defenseAt(loc.id);
    const total = Object.values(d).reduce((a, b) => a + b, 0);
    if (total > 0) {
      const parts = Object.entries(d).map(([t, n]) => `${t}隊:${n}`).join('、');
      log.defense.push(`🛡️ ${loc.label} 守方合計 ${total}（${parts}）`);
    }
  }

  // 對每個被攻擊目標開戰
  for (const E of attackedIds) {
    const cmdList = attacksByTarget[E];
    // 依隊伍彙整投入兵力（同隊多路進攻相加）與夥伴名單
    const invest = {};   // team -> n
    const partners = {}; // team -> Set(partner)
    for (const c of cmdList) {
      invest[c.team] = (invest[c.team] || 0) + c.n;
      partners[c.team] = partners[c.team] || new Set();
      for (const p of c.P) if (p && p !== c.team) partners[c.team].add(p);
    }
    const teams = Object.keys(invest).map(Number);

    // 合法集合：互相指名的 clique；單槍匹馬(P空)為單元集合
    const legalSets = buildLegalSets(teams, partners);

    // 衝突裁決：貪婪挑選最強集合，重疊者出局
    const winners = resolveConflicts(legalSets, invest, log);

    // 結盟失敗（未進入任何勝出集合）→ 兵力原地遣返
    const participating = new Set(winners.flat());
    for (const c of cmdList) {
      if (!participating.has(c.team)) {
        returnTroops(c, barracks, garrison);
        log.notes.push(`↩️ ${c.team}隊 進攻 ${labelOf(E)} 結盟失敗，${c.n} 兵原地遣返`);
      }
    }

    // 結盟動畫：多隊聯軍在目標島插旗
    for (const set of winners) {
      if (set.length > 1) log.events.push({ phase: 'alliance', kind: 'flag', at: elIsl(E), teams: set });
    }
    // 進攻動畫：各參戰指令的兵力衝向目標
    for (const c of cmdList) {
      if (participating.has(c.team)) {
        log.events.push({ phase: 'attack', kind: 'sword', from: elOf(c.team, c.S), to: elIsl(E), team: c.team, n: c.n });
      }
    }

    // 集結所有進攻方（各為一支獨立勢力）+ 防守方，比大小
    const parties = [];
    for (const set of winners) {
      const contrib = {};
      let total = 0;
      for (const t of set) { contrib[t] = invest[t]; total += invest[t]; }
      parties.push({ kind: 'attack', teams: contrib, total, set });
    }
    const def = defenseAt(E);
    const defTotal = Object.values(def).reduce((a, b) => a + b, 0);
    parties.push({ kind: 'defense', teams: def, total: defTotal });

    const before = log.attack.length;
    resolveBattle(E, parties, garrison, barracks, log);
    const resultText = log.attack.slice(before).join('　') || '無結果';
    log.events.push({ phase: 'attack', kind: 'clash', at: elIsl(E), result: resultText });
  }

  // 未被攻擊、但有協防移入的島：把協防兵併入駐軍（共同駐守）
  for (const [E, help] of Object.entries(acceptedHelp)) {
    if (attackedIds.has(E)) continue;
    for (const [team, n] of Object.entries(help)) {
      garrison[E][team] = (garrison[E][team] || 0) + n;
    }
  }

  // 回寫戰後狀態
  writeBack(barracks, garrison);

  // --- 資源發放 --------------------------------------------
  distributeResources(log);

  // --- 第一回合結束：兵營 ×1.5 ------------------------------
  if (GAME.round === 1) {
    for (const t of Object.values(GAME.teams)) {
      const before = t.barracks;
      t.barracks = Math.floor(t.barracks * RULES.BARRACKS_INTEREST);
      if (t.barracks !== before) log.notes.push(`💰 ${t.id}隊 兵營利息 ×1.5：${before} → ${t.barracks}`);
    }
  }

  // --- 低兵力救濟（<1000 補滿）-----------------------------
  for (const t of Object.values(GAME.teams)) {
    const total = teamTotalTroops(t.id);
    if (total < RULES.RELIEF_FLOOR) {
      const add = RULES.RELIEF_FLOOR - total;
      t.barracks += add;
      log.notes.push(`🚑 ${t.id}隊 總兵力 ${total} < 1000，兵營補滿 +${add}`);
    }
  }

  GAME.log = log;
  // 清空指令
  for (const k of Object.keys(GAME.pending)) GAME.pending[k] = [];
  return log;
}

// ---------------------------------------------------------
// 合法集合：Bron–Kerbosch 找互相指名的最大 clique
// ---------------------------------------------------------
function buildLegalSets(teams, partners) {
  // 互相指名圖
  const mutual = {};
  for (const a of teams) mutual[a] = new Set();
  for (const a of teams) {
    for (const b of teams) {
      if (a !== b && partners[a]?.has(b) && partners[b]?.has(a)) mutual[a].add(b);
    }
  }
  // 單槍匹馬（未指名任何在場夥伴）→ 單元集合
  const sets = [];
  const solo = teams.filter(t => partners[t].size === 0);
  for (const t of solo) sets.push([t]);

  // 找 clique（大小 ≥2）
  const cliques = [];
  const bk = (R, P, X) => {
    if (P.length === 0 && X.length === 0) { if (R.length >= 2) cliques.push([...R]); return; }
    const pivot = [...P, ...X][0];
    const cand = P.filter(v => !mutual[pivot].has(v));
    for (const v of cand) {
      bk([...R, v], P.filter(u => mutual[v].has(u)), X.filter(u => mutual[v].has(u)));
      P = P.filter(u => u !== v);
      X = [...X, v];
    }
  };
  const nonSolo = teams.filter(t => partners[t].size > 0);
  bk([], nonSolo, []);

  // 保留極大 clique（去掉被包含者）
  cliques.sort((a, b) => b.length - a.length);
  const maximal = [];
  for (const c of cliques) {
    if (!maximal.some(m => c.every(x => m.includes(x)))) maximal.push(c);
  }
  for (const c of maximal) sets.push(c);

  // 結盟失敗者（有指名但不在任何 clique，也非 solo）→ 不進攻
  return sets;
}

// ---------------------------------------------------------
// 四階衝突裁決：貪婪挑選最優集合，重疊者出局
// ---------------------------------------------------------
function resolveConflicts(sets, invest, log) {
  const scored = sets.map(s => ({
    set: s,
    nations: s.length,
    troops: s.reduce((a, t) => a + invest[t], 0),
    power: s.reduce((a, t) => a + teamTotalTroops(t), 0),
    rand: Math.random(),
  }));
  // 四關排序：國家數 > 出兵數 > 全國國力 > 隨機
  scored.sort((a, b) =>
    b.nations - a.nations || b.troops - a.troops || b.power - a.power || b.rand - a.rand);

  const used = new Set();
  const winners = [];
  for (const s of scored) {
    if (s.set.some(t => used.has(t))) {
      // 集合被搶走關鍵成員 → 結盟失敗，原地遣返
      const free = s.set.filter(t => !used.has(t));
      if (free.length > 0 && s.set.length > 1) {
        log.notes.push(`⚠️ ${s.set.join('、')}隊 集合因成員被搶，結盟破裂，剩餘隊伍原地遣返`);
      }
      continue;
    }
    s.set.forEach(t => used.add(t));
    winners.push(s.set);
  }
  return winners;
}

// ---------------------------------------------------------
// 開戰結算：多方比大小
// ---------------------------------------------------------
function resolveBattle(E, parties, garrison, barracks, log) {
  const loc = GAME.locations[E];
  const active = parties.filter(p => p.total > 0);
  const attackers = parties.filter(p => p.kind === 'attack' && p.total > 0);
  const defense = parties.find(p => p.kind === 'defense');
  const defTotal = defense ? defense.total : 0;

  // 空島盲打：無守軍且僅單一進攻方
  if (defTotal === 0 && attackers.length === 1) {
    const w = attackers[0];
    garrison[E] = { ...w.teams };
    loc.owner = ownerOf(w.teams);
    log.attack.push(`🏴 ${teamStr(w.teams)} 無傷佔領空島 ${loc.label}（+${w.total}）`);
    return;
  }
  if (active.length === 0) return;

  // 找最強與次強
  const sorted = [...active].sort((a, b) => b.total - a.total);
  const top = sorted[0];
  const tie = sorted[1] && sorted[1].total === top.total;

  if (tie) {
    // 同歸於盡：最強兩方全滅
    const third = sorted[2];
    if (third && third.total >= RULES.MIN_ATTACK) {
      garrison[E] = { ...third.teams };
      loc.owner = ownerOf(third.teams);
      log.attack.push(`⚔️ ${loc.label} 兩強同歸於盡，${teamStr(third.teams)} 漁翁得利佔領`);
    } else {
      garrison[E] = {};
      loc.owner = null;
      log.attack.push(`⚔️ ${loc.label} 兩強同歸於盡，成為無人空島`);
    }
    return;
  }

  const second = sorted[1];
  const survive = top.total - (second ? second.total : 0);

  if (top.kind === 'attack') {
    // 進攻方破城
    const newG = {};
    for (const [t, n] of Object.entries(top.teams)) {
      newG[t] = Math.round(survive * (n / top.total));
    }
    garrison[E] = newG;
    loc.owner = ownerOf(newG);
    log.attack.push(`💥 ${teamStr(top.teams)} 攻下 ${loc.label}！存活 ${survive} 兵留駐（敗方全滅）`);
  } else {
    // 防守成功：50% 保底 + 20% 戰俘
    const attackersDead = attackers.reduce((a, p) => a + p.total, 0);
    let survivors = survive;
    const floor = Math.round(defTotal * RULES.DEFENSE_FLOOR);
    if (survivors < floor) survivors = floor;
    const pow = Math.round(attackersDead * RULES.POW_BONUS);
    const totalKeep = survivors + pow;
    const newG = {};
    for (const [t, n] of Object.entries(top.teams)) {
      newG[t] = Math.round(totalKeep * (n / defTotal));
    }
    garrison[E] = newG;
    loc.owner = ownerOf(newG);
    log.attack.push(`🛡️ ${teamStr(top.teams)} 成功守住 ${loc.label}！保底+戰俘後留 ${totalKeep} 兵`);
  }
}

// ---------------------------------------------------------
// 資源發放
// ---------------------------------------------------------
function distributeResources(log) {
  for (const loc of Object.values(GAME.locations)) {
    const isResource = loc.type === 'money' || loc.type === 'arsenal';
    if (isResource && !isResourceOpen()) continue;
    const total = garrisonTotal(loc);
    if (total <= 0) continue;
    const y = RULES.YIELD[loc.type];
    for (const [team, n] of Object.entries(loc.garrison)) {
      const ratio = n / total;
      if (y.coconut) GAME.teams[team].coconuts += Math.round(y.coconut * ratio);
      if (y.troops) GAME.teams[team].barracks += Math.round(y.troops * ratio);
    }
    if (y.coconut || y.troops) {
      log.resource.push(`🥥 ${loc.label} 產出 ${y.coconut ? y.coconut + ' 椰子' : ''}${y.troops ? ' +' + y.troops + ' 兵力' : ''}（依駐軍比例分配）`);
      log.events.push({ phase: 'resource', kind: 'coconut', at: `isl-${loc.id}`, coconut: y.coconut, troops: y.troops });
    }
  }
}

// ---------------------------------------------------------
// 小工具
// ---------------------------------------------------------
function returnTroops(c, barracks, garrison) {
  if (c.S === 'B') barracks[c.team] += c.n;
  else garrison[c.S][c.team] = (garrison[c.S][c.team] || 0) + c.n;
}
function writeBack(barracks, garrison) {
  for (const [tid, b] of Object.entries(barracks)) GAME.teams[tid].barracks = Math.max(0, Math.round(b));
  for (const [id, g] of Object.entries(garrison)) {
    const clean = {};
    for (const [t, n] of Object.entries(g)) if (Math.round(n) > 0) clean[t] = Math.round(n);
    GAME.locations[id].garrison = clean;
    // owner 校正
    if (GAME.locations[id].type !== 'money' && GAME.locations[id].type !== 'arsenal') {
      GAME.locations[id].owner = ownerOf(clean);
    } else {
      GAME.locations[id].owner = Object.keys(clean).length ? ownerOf(clean) : null;
    }
  }
}
function ownerOf(garr) {
  let best = null, max = -1;
  for (const [t, n] of Object.entries(garr)) if (n > max) { max = n; best = Number(t); }
  return best;
}
function teamStr(garr) {
  const keys = Object.keys(garr);
  return keys.length > 1 ? `${keys.join('+')}隊聯軍` : `${keys[0]}隊`;
}
function labelOf(key) {
  if (key === 'B') return '兵營';
  return GAME.locations[key]?.label || key;
}
function describe(c) {
  const p = c.P && c.P.length ? `[${c.P.join(',')}]` : '';
  return `${c.type}(${labelOf(c.S) || ''}${c.S ? '→' : ''}${labelOf(c.E)}, ${c.n || ''}${p})`;
}
