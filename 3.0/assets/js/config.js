/* =========================================================
 * COCONUT WARS 3.0 — 設定檔
 * 指令：移動 / 攻擊（訓練改為每回合自動：兵營每滿 1000 +200）
 * 每回合 2 島豐收 ×1.5；最後一回合全島豐收 ×1.5
 * 己方島嶼守軍不足 MIN_GARRISON（100）→ 強制中立
 * ========================================================= */

export const RULES = {
  MIN_ATTACK: 100,          // 進攻最低（無門檻，只需 100 的倍數）
  STEP: 100,                // 兵力單位
  MOVE_MAX: 1000,           // 移動：每個指令最多 1000 兵（第一回合不限）
  TIE_LOSS: 500,            // 攻擊平手時，各折損 500
  TRAIN_UNIT: 1000,         // 自動訓練：兵營每滿此數
  TRAIN_GAIN: 200,          //   → +此數（每回合自動生效，全隊皆同）
  MIN_GARRISON: 100,        // 己方島嶼守軍低於此數 → 該回合結算後強制中立
  // 初始島嶼駐軍：大小島皆 500，且為「額外發放」——不從各隊總兵力扣除
  INIT_ISLAND_TROOPS: 500,
  BIG_ISLAND_TROOPS: 500,   // （沿用鍵名，皆 500）
  SMALL_ISLAND_TROOPS: 500,
  // 每回合基礎椰子產出（大島＝中立黃金洞窟）
  YIELD: { big: 1000, small: 500 },
  // 豐收
  HARVEST_MULT: 1.5,
  HARVEST_COUNT: 2,         // 每回合隨機豐收島數（最後一回合為全島）
};

// --- 9 座島嶼（8 小島 + 1 中立大島）--------------------------------
// 中央的黃金洞窟（大島）為初始中立寶島：開局無守軍（空島），先搶先得、可被攻佔。
// 四周 8 座小島為各隊可佔領領地（含原軍火要塞，現為一般小島）。
export const ISLANDS = [
  // 第1排（y=20）— 左
  { id: 'small1', label: '巨人山丘', type: 'small', img: '巨人山丘.PNG', x: 17, y: 20 },
  { id: 'small2', label: '狐族賭館', type: 'small', img: '狐族賭館.PNG', x: 42, y: 20 },
  { id: 'small3', label: '機械王國', type: 'small', img: '機械王國.PNG', x: 67, y: 20 },
  // 第2排（y=48）— 右（黃金洞窟略偏右）
  { id: 'small4', label: '布丁狗族', type: 'small', img: '布丁狗族.PNG', x: 33, y: 48 },
  { id: 'big6',   label: '黃金洞窟', type: 'big',   img: '黃金洞窟.PNG', x: 58, y: 48 },
  { id: 'small5', label: '哥布林族', type: 'small', img: '哥布林族.PNG', x: 83, y: 48 },
  // 第3排（y=76）— 左
  { id: 'small6', label: '龍族火山', type: 'small', img: '龍族火山.PNG', x: 17, y: 76 },
  { id: 'small7', label: '精靈森域', type: 'small', img: '精靈森域.PNG', x: 42, y: 76 },
  { id: 'small8', label: '軍火要塞', type: 'small', img: '軍火要塞.PNG', x: 67, y: 76 },
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
