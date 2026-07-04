/* =========================================================
 * COCONUT WARS — 設定檔
 * 島嶼定義、地圖佈局、隊伍配色、規則常數
 * ========================================================= */

// --- 規則常數 -------------------------------------------------
export const RULES = {
  MIN_ATTACK: 300,        // 進攻 / 協防最低門檻
  STEP: 100,              // 兵力單位
  MIN_DEFENSE: 300,       // 留守最低兵力
  BARRACKS_INTEREST: 1.5, // 第一回合結束兵營利息
  RELIEF_FLOOR: 1000,     // 低兵力救濟門檻 / 補滿值
  POW_BONUS: 0.20,        // 戰俘收編比例
  DEFENSE_FLOOR: 0.50,    // 防守保底比例
  BIG_ISLAND_TROOPS: 1000,// 大島初始駐軍
  SMALL_ISLAND_TROOPS: 500,
  // 每回合產出
  YIELD: {
    big:    { coconut: 500,  troops: 0 },
    small:  { coconut: 300,  troops: 0 },
    money:  { coconut: 3000, troops: 0 },
    arsenal:{ coconut: 1000, troops: 2000 },
  },
  RESOURCE_OPEN_ROUND: 2, // 資源點開放回合
};

// --- 島嶼與資源點定義 ----------------------------------------
// type: big | small | money | arsenal
// x,y 為地圖上的百分比座標（中心點）
export const ISLANDS = [
  // 五大島
  { id: 'big1',  label: '大島1', type: 'big',   img: 'IMG_5862.PNG', x: 22, y: 26 },
  { id: 'big2',  label: '大島2', type: 'big',   img: 'IMG_5863.PNG', x: 50, y: 18 },
  { id: 'big3',  label: '大島3', type: 'big',   img: 'IMG_5864.PNG', x: 78, y: 26 },
  { id: 'big4',  label: '大島4', type: 'big',   img: 'IMG_5860.PNG', x: 16, y: 62 },
  { id: 'big5',  label: '大島5', type: 'big',   img: 'IMG_5861.PNG', x: 84, y: 62 },
  // 七小島
  { id: 'small1', label: '小島1', type: 'small', img: 'IMG_5853.PNG', x: 33, y: 42 },
  { id: 'small2', label: '小島2', type: 'small', img: 'IMG_5855.PNG', x: 67, y: 42 },
  { id: 'small3', label: '小島3', type: 'small', img: 'IMG_5856.PNG', x: 30, y: 80 },
  { id: 'small4', label: '小島4', type: 'small', img: 'IMG_5858.PNG', x: 50, y: 88 },
  { id: 'small5', label: '小島5', type: 'small', img: 'IMG_5859.PNG', x: 70, y: 80 },
  { id: 'small6', label: '小島6', type: 'small', img: 'IMG_5856.PNG', x: 8,  y: 40 },
  { id: 'small7', label: '小島7', type: 'small', img: 'IMG_5853.PNG', x: 92, y: 40 },
  // 兩資源點（畫面正中央）
  { id: 'money',   label: '金錢島', type: 'money',   img: 'IMG_5854.PNG', x: 40, y: 64 },
  { id: 'arsenal', label: '軍火島', type: 'arsenal', img: 'IMG_5857.PNG', x: 60, y: 64 },
];

export const IMG_BASE = 'island/';

// --- 隊伍配色（海島色盤，最多 10 隊）-------------------------
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
