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
 * 再把「隊號 × MAX3 + 指令編號」壓成單一整數 combined，用仿射變換
 *   y = (combined · A + B) mod SPACE   （A 與 SPACE 互質 → 雙射、可逆）
 * 打散成看起來雜亂的亂碼，最後補前導 0 到固定位數、附 1 位檢查碼。
 * 好處：隊號被藏進亂數、放棄（combined=0）不再是一串 0、相鄰指令的碼天差地遠。
 * 用 BigInt 做精確大數模運算；解碼時反算 combined 再拆回隊號與指令。
 * 檢查碼可擋下打錯（純數字密碼本身無容錯，故保留 1 位防呆）。
 * ========================================================= */
import { ISLANDS } from './config.js';

const LOCS = ['B', ...ISLANDS.map(i => i.id)];   // 0=兵營，其餘為島 id
const N = LOCS.length;      // 位置數（兵營 + 島嶼）
const H = 999;              // 兵力百數 1..999（100~99900，支援五位數兵力）
const MOVE = N * N * H;     // 移動（或攻擊）各自的種數
const C = 2 * MOVE;         // 單一指令總種數（移動 + 攻擊）
const MAX3 = (() => { let c = 1; for (let k = 0; k < 3; k++) c = 1 + C * c; return c; })();   // 長度≤3 的總數

// --- 打散（affine over Z_SPACE）：讓代碼看起來雜亂、隊號與放棄都不易辨識 ---
const TEAMS = 10;                                 // 隊號 0..9（單一位數）
const SPACE = BigInt(TEAMS) * BigInt(MAX3);       // 組合總數 = 10 × MAX3
const WIDTH = String(SPACE - 1n).length;          // 代碼編號固定位數
const LEAD = 10n ** BigInt(WIDTH - 1);            // 加此位移 → 首位必非 0（避免朗讀/輸入吃掉前導 0）
const A = 2305843009213693951n % SPACE;           // 乘數（梅森質數 2^61-1，必與 SPACE 互質）
const B = 61803398874989484n % SPACE;             // 位移（讓 combined=0 的放棄碼不落在 0）
function egcd(a, b) { let x0 = 1n, x1 = 0n; while (b) { const q = a / b; [a, b] = [b, a - q * b]; [x0, x1] = [x1, x0 - q * x1]; } return [a, x0]; }
const Ainv = (() => { const [g, x] = egcd(A, SPACE); if (g !== 1n) throw new Error('code.js: A 與 SPACE 不互質'); return ((x % SPACE) + SPACE) % SPACE; })();
const scramble = combined => (combined * A + B) % SPACE;
const unscramble = y => (((y - B) % SPACE + SPACE) % SPACE * Ainv) % SPACE;

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
  const enc = encList((cmds || []).slice(0, 3));
  const combined = BigInt(team) * BigInt(MAX3) + BigInt(enc);   // 隊號與指令壓成單一整數
  const num = (scramble(combined) + LEAD).toString();           // + LEAD → 固定 WIDTH 位、首位非 0
  return num + checksum(num);
}

export function decodeCode(raw) {
  const str = String(raw).replace(/\D/g, '');
  if (str.length < 2) return { error: '代碼太短' };
  const num = str.slice(0, -1);
  if (checksum(num) !== +str.slice(-1)) return { error: '檢查碼錯誤（可能輸入有誤）' };
  let y;
  try { y = BigInt(num) - LEAD; } catch (_) { return { error: '代碼格式錯誤' }; }
  if (y < 0n || y >= SPACE) return { error: '代碼超出範圍' };
  const combined = unscramble(y);
  const team = Number(combined / BigInt(MAX3));
  const enc = Number(combined % BigInt(MAX3));
  const cmds = decList(enc, team);
  if (!cmds) return { error: '代碼無效（指令過多）' };
  return { team, cmds };
}
