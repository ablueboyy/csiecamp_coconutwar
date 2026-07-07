/* =========================================================
 * COCONUT WARS 3.0 — 設定檔
 * 指令：移動 / 攻擊 / 訓練（移除開墾）
 * 每回合 2 島豐收 ×1.5；最後一回合全島豐收 ×1.5
 * ========================================================= */

export const RULES = {
  MIN_ATTACK: 100,          // 進攻最低（無門檻，只需 100 的倍數）
  STEP: 100,                // 兵力單位
  MOVE_MAX: 500,            // 移動：每個指令最多 500 兵（第一回合不限）
  TIE_LOSS: 500,            // 攻擊平手時，各折損 500
  TRAIN_UNIT: 1000,         // 訓練：兵營每滿此數
  TRAIN_GAIN: 200,          //   → +此數（每回合最多一次）
  // 初始島嶼駐軍：大小島皆 500，且為「額外發放」——不從各隊總兵力扣除
  INIT_ISLAND_TROOPS: 500,
  BIG_ISLAND_TROOPS: 500,   // （沿用鍵名，皆 500）
  SMALL_ISLAND_TROOPS: 500,
  // 每回合基礎椰子產出
  YIELD: { big: 800, small: 500 },
  // 豐收
  HARVEST_MULT: 1.5,
  HARVEST_COUNT: 2,         // 每回合隨機豐收島數（最後一回合為全島）
  // 特殊小隊獎勵：開局設定，最終排名「揭曉」時才加上（懸念）
  BONUS_AMOUNT: 200,
};

// --- 14 座島嶼（6 大 + 8 小）----------------------------------
// 黃金洞窟（大）與軍火要塞（小）為初始中立寶島：開局無守軍（空島），先搶先得。
export const ISLANDS = [
  // 第1排（y=20）
  { id: 'big1',   label: '河童國',   type: 'big',   img: '河童國.PNG',   x: 12, y: 20 },
  { id: 'small1', label: '巨人山丘', type: 'small', img: '巨人山丘.PNG', x: 38, y: 20 },
  { id: 'small2', label: '狐族賭館', type: 'small', img: '狐族賭館.PNG', x: 62, y: 20 },
  { id: 'big3',   label: '侏儒劇場', type: 'big',   img: '侏儒劇場.PNG', x: 88, y: 20 },
  // 第2排（y=43）
  { id: 'small3', label: '機械王國', type: 'small', img: '機械王國.PNG', x: 25, y: 43 },
  { id: 'big6',   label: '黃金洞窟', type: 'big',   img: '黃金洞窟.PNG', x: 50, y: 43 },
  { id: 'small4', label: '布丁狗族', type: 'small', img: '布丁狗族.PNG', x: 75, y: 43 },
  // 第3排（y=65）
  { id: 'big4',   label: '人類王國', type: 'big',   img: '人類王國.PNG', x: 12, y: 65 },
  { id: 'small5', label: '哥布林族', type: 'small', img: '哥布林族.PNG', x: 38, y: 65 },
  { id: 'small8', label: '軍火要塞', type: 'small', img: '軍火要塞.PNG', x: 62, y: 65 },
  { id: 'big5',   label: '獸人荒原', type: 'big',   img: '獸人荒原.PNG', x: 88, y: 65 },
  // 第4排（y=87）
  { id: 'small6', label: '龍族火山', type: 'small', img: '龍族火山.PNG', x: 25, y: 87 },
  { id: 'big2',   label: '傀儡族',   type: 'big',   img: '傀儡族.PNG',   x: 50, y: 87 },
  { id: 'small7', label: '精靈森域', type: 'small', img: '精靈森域.PNG', x: 75, y: 87 },
];

export const IMG_BASE = 'island/';

export const TEAM_COLORS = [
  { name: '珊瑚紅', hex: '#ff6f61' },
  { name: '海洋藍', hex: '#2a9df4' },
  { name: '棕櫚綠', hex: '#3cb371' },
  { name: '陽光黃', hex: '#ffc23c' },
  { name: '夕陽橘', hex: '#ff9f43' },
  { name: '扶桑桃', hex: '#ff5da2' },
  { name: '碧湖青', hex: '#17c3b2' },
  { name: '芒果金', hex: '#f4a259' },
  { name: '紫羅蘭', hex: '#9b6dff' },
  { name: '深海靛', hex: '#3d5a80' },
];

export const DEFAULT_TEAMS = 10;
export const DEFAULT_ROUNDS = 4;
