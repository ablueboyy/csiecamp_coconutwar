/* =========================================================
 * COCONUT WARS 2.0 — 設定檔
 * 無金錢島/軍火島；指令：開墾、移動、攻擊
 * 每回合 2 島豐收 ×1.5；最後一回合全島豐收 ×1.5
 * ========================================================= */

export const RULES = {
  MIN_ATTACK: 100,          // 進攻最低（無門檻限制，只需 100 的倍數）
  STEP: 100,                // 兵力單位
  BIG_ISLAND_TROOPS: 1000,  // 大島初始駐軍
  SMALL_ISLAND_TROOPS: 500,
  // 每回合基礎椰子產出（未開墾也有的被動收入）
  YIELD: { big: 500, small: 300 },
  // 開墾：每投入 1 兵 → 該島每回合永久 +CULTIVATE_RATIO 椰子（1:1）
  CULTIVATE_RATIO: 1,
  // 豐收
  HARVEST_MULT: 1.5,
  HARVEST_COUNT: 2,         // 每回合隨機豐收島數（最後一回合為全島）
};

// --- 12 座島嶼（5 大 + 7 小），置於海域上 ----------------------
export const ISLANDS = [
  { id: 'big1',  label: '大島1', type: 'big',   img: 'IMG_5862.PNG', x: 22, y: 26 },
  { id: 'big2',  label: '大島2', type: 'big',   img: 'IMG_5863.PNG', x: 50, y: 15 },
  { id: 'big3',  label: '大島3', type: 'big',   img: 'IMG_5864.PNG', x: 78, y: 26 },
  { id: 'big4',  label: '大島4', type: 'big',   img: 'IMG_5860.PNG', x: 15, y: 58 },
  { id: 'big5',  label: '大島5', type: 'big',   img: 'IMG_5861.PNG', x: 85, y: 58 },
  { id: 'small1', label: '小島1', type: 'small', img: 'IMG_5853.PNG', x: 37, y: 38 },
  { id: 'small2', label: '小島2', type: 'small', img: 'IMG_5855.PNG', x: 63, y: 38 },
  { id: 'small3', label: '小島3', type: 'small', img: 'IMG_5856.PNG', x: 33, y: 70 },
  { id: 'small4', label: '小島4', type: 'small', img: 'IMG_5858.PNG', x: 50, y: 60 },
  { id: 'small5', label: '小島5', type: 'small', img: 'IMG_5859.PNG', x: 67, y: 70 },
  { id: 'small6', label: '小島6', type: 'small', img: 'IMG_5854.PNG', x: 8,  y: 40 },
  { id: 'small7', label: '小島7', type: 'small', img: 'IMG_5857.PNG', x: 92, y: 40 },
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
