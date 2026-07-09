/* =========================================================
 * COCONUT WARS 3.0 — 指令代碼（純數字、離線交換、最短編碼）
 * ---------------------------------------------------------
 * 把「0~3 個指令的所有組合」排成一個連續編號，代碼＝該編號（十進位）。
 * 因此不需要另存「指令數」，編號本身就隱含長度，長度即資訊理論最短。
 *
 * 單一指令的可能數 C：
 *   移動/攻擊各 N×N×H 種（N=位置數、H=兵力百數1..999），訓練已改為自動、非指令。
 *   C = 2·N·N·H
 * 指令串（長度 0..3）用混合基數雙射：
 *   enc([])            = 0
 *   enc(c :: 其餘)     = 1 + c + C · enc(其餘)
 * 代碼格式：[隊號1位][編號(固定位數、前導補0)][檢查碼1位]
 *   所有代碼等長（隊號1 + 編號 WIDTH + 檢查碼1）；放棄＝編號全 0。
 * 檢查碼可擋下打錯（純數字密碼本身無容錯，故保留 1 位防呆）。
 * ========================================================= */
import { ISLANDS } from './config.js';

const LOCS = ['B', ...ISLANDS.map(i => i.id)];   // 0=兵營，其餘為島 id
const N = LOCS.length;      // 位置數（兵營 + 島嶼）
const H = 999;              // 兵力百數 1..999（100~99900，支援五位數兵力）
const MOVE = N * N * H;     // 移動（或攻擊）各自的種數
const C = 2 * MOVE;         // 單一指令總種數（移動 + 攻擊）
const MAX3 = (() => { let c = 1; for (let k = 0; k < 3; k++) c = 1 + C * c; return c; })();   // 長度≤3 的總數
const WIDTH = String(MAX3 - 1).length;   // 編號固定位數：不足補前導 0，讓所有人代碼等長

const locIdx = id => { const i = LOCS.indexOf(id); return i < 0 ? 0 : i; };
const idxLoc = i => LOCS[i] || 'B';
const checksum = str => str.split('').reduce((a, d) => a + (+d || 0), 0) % 10;

// 單一指令 ↔ [0,C) -----------------------------------------
function encCmd(c) {
  const h = Math.min(H, Math.max(1, Math.round((c.n || 0) / 100)));
  const m = (locIdx(c.S) * N + locIdx(c.E)) * H + (h - 1);
  return (c.type === 'attack' ? MOVE : 0) + m;
}
function decCmd(v, team) {
  const attack = v >= MOVE;
  const m = attack ? v - MOVE : v;
  const h = (m % H) + 1;
  const e = Math.floor(m / H) % N;
  const s = Math.floor(m / H / N);
  return { type: attack ? 'attack' : 'move', S: idxLoc(s), E: idxLoc(e), n: h * 100, team };
}

// 指令串 ↔ 編號 -------------------------------------------
function encList(cmds) {
  let x = 0;
  for (let i = cmds.length - 1; i >= 0; i--) x = 1 + encCmd(cmds[i]) + C * x;
  return x;
}
function decList(x, team) {
  const cmds = [];
  let guard = 0;
  while (x > 0 && guard++ < 3) { x -= 1; cmds.push(decCmd(x % C, team)); x = Math.floor(x / C); }
  return x > 0 ? null : cmds;   // 仍有剩 → 超過 3 指令、代碼無效
}

// 對外 ----------------------------------------------------
export function encodeCode(team, cmds) {
  const num = String(encList((cmds || []).slice(0, 3))).padStart(WIDTH, '0');   // 補前導 0 → 等長
  const body = String(team) + num;
  return body + checksum(body);
}

export function decodeCode(raw) {
  const str = String(raw).replace(/\D/g, '');
  if (str.length < 3) return { error: '代碼太短' };
  const body = str.slice(0, -1);
  if (checksum(body) !== +str.slice(-1)) return { error: '檢查碼錯誤（可能輸入有誤）' };
  const team = +body[0];
  const x = Number(body.slice(1));
  if (!Number.isSafeInteger(x) || x < 0 || x >= MAX3) return { error: '代碼超出範圍' };
  const cmds = decList(x, team);
  if (!cmds) return { error: '代碼無效（指令過多）' };
  return { team, cmds };
}
