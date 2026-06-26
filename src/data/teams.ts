import type { Team } from '../types'

export const INITIAL_TEAMS: Team[] = [
  // 北海道・東北
  {
    id: 'sapporo', name: '札幌アイスランナーズ', shortName: '札幌', city: '札幌', region: '北海道',
    founded: 2008, colors: { primary: '#1A6FBF', secondary: '#FFFFFF' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 230000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '佐藤 健一',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'morioka', name: '盛岡岩手ウォリアーズ', shortName: '盛岡', city: '盛岡', region: '東北',
    founded: 2008, colors: { primary: '#2D5016', secondary: '#D4A017' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 210000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '鈴木 誠',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'aomori', name: '青森ねぶたランナーズ', shortName: '青森', city: '青森', region: '東北',
    founded: 2008, colors: { primary: '#C41E3A', secondary: '#FFD700' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 210000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '田中 博',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'sendai', name: '仙台ウィンドゲイルズ', shortName: '仙台', city: '仙台', region: '東北',
    founded: 2008, colors: { primary: '#4B0082', secondary: '#87CEEB' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 220000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '伊藤 剛',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  // 関東
  {
    id: 'tokyo', name: '東京ロードキングス', shortName: '東京', city: '東京', region: '関東',
    founded: 2008, colors: { primary: '#1A1A2E', secondary: '#E8462A' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 310000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '山田 浩二',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'yokohama', name: '横浜ハーバーランナーズ', shortName: '横浜', city: '横浜', region: '関東',
    founded: 2008, colors: { primary: '#005BAC', secondary: '#C8102E' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 260000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '渡辺 真',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'chiba', name: '千葉オーシャンビート', shortName: '千葉', city: '千葉', region: '関東',
    founded: 2008, colors: { primary: '#006B3F', secondary: '#FFD700' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 230000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '中村 亮',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'saitama', name: '埼玉ライジングサン', shortName: '埼玉', city: 'さいたま', region: '関東',
    founded: 2008, colors: { primary: '#E8462A', secondary: '#FFFFFF' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 240000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '小林 直樹',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  // 中部
  {
    id: 'nagano', name: '長野アルピニスト', shortName: '長野', city: '長野', region: '中部',
    founded: 2008, colors: { primary: '#2E7D32', secondary: '#FFFFFF' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 220000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '加藤 雄大',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'niigata', name: '新潟コシヒカリRC', shortName: '新潟', city: '新潟', region: '中部',
    founded: 2008, colors: { primary: '#FF8C00', secondary: '#008000' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 200000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '吉田 太郎',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'shizuoka', name: '静岡ティーフィールド', shortName: '静岡', city: '静岡', region: '中部',
    founded: 2008, colors: { primary: '#228B22', secondary: '#F5DEB3' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 220000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '松本 俊',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'nagoya', name: '名古屋メテオラ', shortName: '名古屋', city: '名古屋', region: '中部',
    founded: 2008, colors: { primary: '#9B111E', secondary: '#FFD700' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 270000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '井上 勝',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  // 関西
  {
    id: 'kyoto', name: '京都フウジン', shortName: '京都', city: '京都', region: '関西',
    founded: 2008, colors: { primary: '#8B1A1A', secondary: '#C0A882' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 230000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '藤原 誠一',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'osaka', name: '大阪オーシャンタイガース', shortName: '大阪', city: '大阪', region: '関西',
    founded: 2008, colors: { primary: '#FF6600', secondary: '#003366' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 280000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '西田 勇気',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'kobe', name: '神戸ベイランナーズ', shortName: '神戸', city: '神戸', region: '関西',
    founded: 2008, colors: { primary: '#003087', secondary: '#FFFFFF' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 240000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '山口 浩',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  // 中国・四国
  {
    id: 'hiroshima', name: '広島ヒロシマフレイムス', shortName: '広島', city: '広島', region: '中国',
    founded: 2008, colors: { primary: '#CC0000', secondary: '#FFFFFF' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 220000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '田村 和彦',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'okayama', name: '岡山ピーチランナーズ', shortName: '岡山', city: '岡山', region: '中国',
    founded: 2008, colors: { primary: '#FF69B4', secondary: '#006400' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 200000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '河野 一郎',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  // 九州・沖縄
  {
    id: 'fukuoka', name: '福岡サザンクロス', shortName: '福岡', city: '福岡', region: '九州',
    founded: 2008, colors: { primary: '#003087', secondary: '#C9A84C' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 250000000 },
    draftPicks: [
      { year: 2027, round: 1, pickNumber: 8, originallyOwnedBy: 'fukuoka' },
      { year: 2027, round: 2, pickNumber: 28, originallyOwnedBy: 'fukuoka' },
    ],
    isPlayerControlled: true, gmName: 'つば',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'kagoshima', name: '鹿児島カルデラ', shortName: '鹿児島', city: '鹿児島', region: '九州',
    founded: 2008, colors: { primary: '#8B4513', secondary: '#FF4500' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 210000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '黒田 猛',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
  {
    id: 'okinawa', name: '沖縄ティーダ', shortName: '沖縄', city: '那覇', region: '沖縄',
    founded: 2008, colors: { primary: '#00CED1', secondary: '#FF8C00' }, logoUrl: '',
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 210000000 },
    draftPicks: [], isPlayerControlled: false, gmName: '仲村 渉',
    history: { seasonResults: [], championships: 0, cupWins: 0 }
  },
]
