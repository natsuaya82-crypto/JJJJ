import type { Team } from '../types'

// JPEL 1部の20チーム。
// 2部・3部のチームは data/teamsLower.ts に置く（このファイルは1部だけ）。
// division を書き忘れると divisionOf() が1部として扱うので、下部リーグ側では必ず書くこと。

export const INITIAL_TEAMS: Team[] = [
  // 北海道・東北
  {
    id: 'sapporo', name: '札幌アイスランナーズ', shortName: '札幌', city: '札幌', region: '北海道',
    founded: 1995, colors: { primary: '#1A6FBF', secondary: '#FFFFFF' },
    roster: { main: [] },
    finance: { budget: 570_000_000 },
    initialRank: 9, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '佐藤 健一'
  },
  {
    id: 'morioka', name: '盛岡岩手ウォリアーズ', shortName: '盛岡', city: '盛岡', region: '東北',
    founded: 2006, colors: { primary: '#2D5016', secondary: '#D4A017' },
    roster: { main: [] },
    finance: { budget: 440_000_000 },
    initialRank: 16, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '鈴木 誠'
  },
  {
    id: 'aomori', name: '青森ねぶたランナーズ', shortName: '青森', city: '青森', region: '東北',
    founded: 2017, colors: { primary: '#C41E3A', secondary: '#FFD700' },
    roster: { main: [] },
    finance: { budget: 420_000_000 },
    initialRank: 18, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '田中 博'
  },
  {
    id: 'sendai', name: '仙台ウィンドゲイルズ', shortName: '仙台', city: '仙台', region: '東北',
    founded: 2000, colors: { primary: '#4B0082', secondary: '#87CEEB' },
    roster: { main: [] },
    finance: { budget: 550_000_000 },
    initialRank: 10, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '伊藤 剛'
  },
  // 関東
  {
    id: 'tokyo', name: '東京ロードキングス', shortName: '東京', city: '東京', region: '関東',
    founded: 2011, colors: { primary: '#1A1A2E', secondary: '#E8462A' },
    roster: { main: [] },
    finance: { budget: 1_000_000_000 },
    initialRank: 1, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '山田 浩二'
  },
  {
    id: 'yokohama', name: '横浜ハーバーランナーズ', shortName: '横浜', city: '横浜', region: '関東',
    founded: 1994, colors: { primary: '#005BAC', secondary: '#C8102E' },
    roster: { main: [] },
    finance: { budget: 800_000_000 },
    initialRank: 4, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '渡辺 真'
  },
  {
    id: 'chiba', name: '千葉オーシャンビート', shortName: '千葉', city: '千葉', region: '関東',
    founded: 2005, colors: { primary: '#006B3F', secondary: '#FFD700' },
    roster: { main: [] },
    finance: { budget: 600_000_000 },
    initialRank: 8, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '中村 亮'
  },
  {
    id: 'saitama', name: '埼玉ライジングサン', shortName: '埼玉', city: 'さいたま', region: '関東',
    founded: 2016, colors: { primary: '#E8462A', secondary: '#FFFFFF' },
    roster: { main: [] },
    finance: { budget: 650_000_000 },
    initialRank: 7, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '小林 直樹'
  },
  // 中部
  {
    id: 'nagano', name: '長野アルピニスト', shortName: '長野', city: '長野', region: '中部',
    founded: 1999, colors: { primary: '#2E7D32', secondary: '#FFFFFF' },
    roster: { main: [] },
    finance: { budget: 460_000_000 },
    initialRank: 14, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '加藤 雄大'
  },
  {
    id: 'niigata', name: '新潟コシヒカリRC', shortName: '新潟', city: '新潟', region: '中部',
    founded: 2010, colors: { primary: '#FF8C00', secondary: '#008000' },
    roster: { main: [] },
    finance: { budget: 400_000_000 },
    initialRank: 20, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '吉田 太郎'
  },
  {
    id: 'shizuoka', name: '静岡ティーフィールド', shortName: '静岡', city: '静岡', region: '中部',
    founded: 1993, colors: { primary: '#228B22', secondary: '#F5DEB3' },
    roster: { main: [] },
    finance: { budget: 520_000_000 },
    initialRank: 11, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '松本 俊'
  },
  {
    id: 'nagoya', name: '名古屋メテオラ', shortName: '名古屋', city: '名古屋', region: '中部',
    founded: 2004, colors: { primary: '#9B111E', secondary: '#FFD700' },
    roster: { main: [] },
    finance: { budget: 850_000_000 },
    initialRank: 3, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '井上 勝'
  },
  // 関西
  {
    id: 'kyoto', name: '京都フウジン', shortName: '京都', city: '京都', region: '関西',
    founded: 2015, colors: { primary: '#8B1A1A', secondary: '#C0A882' },
    roster: { main: [] },
    finance: { budget: 480_000_000 },
    initialRank: 13, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '藤原 誠一'
  },
  {
    id: 'osaka', name: '大阪オーシャンタイガース', shortName: '大阪', city: '大阪', region: '関西',
    founded: 1998, colors: { primary: '#FF6600', secondary: '#003366' },
    roster: { main: [] },
    finance: { budget: 900_000_000 },
    initialRank: 2, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '西田 勇気'
  },
  {
    id: 'kobe', name: '神戸ベイランナーズ', shortName: '神戸', city: '神戸', region: '関西',
    founded: 2009, colors: { primary: '#003087', secondary: '#FFFFFF' },
    roster: { main: [] },
    finance: { budget: 700_000_000 },
    initialRank: 6, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '山口 浩'
  },
  // 中国・四国
  {
    id: 'hiroshima', name: '広島ヒロシマフレイムス', shortName: '広島', city: '広島', region: '中国',
    founded: 1992, colors: { primary: '#CC0000', secondary: '#FFFFFF' },
    roster: { main: [] },
    finance: { budget: 500_000_000 },
    initialRank: 12, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '田村 和彦'
  },
  {
    id: 'okayama', name: '岡山ピーチランナーズ', shortName: '岡山', city: '岡山', region: '中国',
    founded: 2003, colors: { primary: '#FF69B4', secondary: '#006400' },
    roster: { main: [] },
    finance: { budget: 410_000_000 },
    initialRank: 19, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '河野 一郎'
  },
  // 九州・沖縄
  {
    id: 'fukuoka', name: '福岡サザンクロス', shortName: '福岡', city: '福岡', region: '九州',
    founded: 2014, colors: { primary: '#003087', secondary: '#C9A84C' },
    roster: { main: [] },
    finance: { budget: 750_000_000 },
    initialRank: 5, division: 1,
    draftPicks: [
      { year: 2027, round: 1, pickNumber: 8, originallyOwnedBy: 'fukuoka' },
      { year: 2027, round: 2, pickNumber: 28, originallyOwnedBy: 'fukuoka' },
    ],
    isPlayerControlled: false, gmName: '西野 健太'
  },
  {
    id: 'kagoshima', name: '鹿児島カルデラ', shortName: '鹿児島', city: '鹿児島', region: '九州',
    founded: 1997, colors: { primary: '#8B4513', secondary: '#FF4500' },
    roster: { main: [] },
    finance: { budget: 450_000_000 },
    initialRank: 15, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '黒田 猛'
  },
  {
    id: 'okinawa', name: '沖縄ティーダ', shortName: '沖縄', city: '那覇', region: '沖縄',
    founded: 2008, colors: { primary: '#00CED1', secondary: '#FF8C00' },
    roster: { main: [] },
    finance: { budget: 430_000_000 },
    initialRank: 17, division: 1,
    draftPicks: [], isPlayerControlled: false, gmName: '仲村 渉'
  },
]
