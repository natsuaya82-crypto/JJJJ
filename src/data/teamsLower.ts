import type { Team } from '../types'

// JPEL 2部・3部のチーム（各16）。1部の20チームは data/teams.ts。
//
// 名前の付け方は1部（全部が「地名＋カタカナ」）に寄せず、6つの型を混ぜてある。
//   実業団の企業名 / カタカナ＋地名 / 地名＋和語 / 英字略号 / クラブ形式 / 地名＋カタカナ
// 日本の駅伝の主役は実業団なので、企業名が入るとリーグ全体の顔ぶれが締まる。
// ※ 企業名はすべて架空。実在の社名は使わないこと（商標）。
// ★ GM名はまだ仮です。
//   ロゴだけは実物（assets/logos-pending から public/logos/<id>.png へ移したもの）。
//
// finance.budget は 0 のまま。国内チームの予算は gameStore が
// tierBudget(team)（utils/clubTier.ts）で上書きするので、ここの値は使われない。
// 格は initialRank の帯から引くので、ここに格を書き足す必要はない。

export const DIVISION2_TEAMS: Team[] = [
  {
    id: 'hakodate', name: '函館ドック陸上部', shortName: '函館', city: '函館', region: '北海道',
    founded: 1998, colors: { primary: '#1B3A6B', secondary: '#FFFFFF' },
    finance: { budget: 0 },
    initialRank: 21, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '細川 直人'
  },
  {
    id: 'kitakyushu', name: '九炎製鉄', shortName: '九炎', city: '北九州', region: '九州',
    founded: 1972, colors: { primary: '#E8620C', secondary: '#3A3A42' },
    finance: { budget: 0 },
    initialRank: 22, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '大西 剛'
  },
  {
    id: 'akita', name: '秋田こまち走友会', shortName: '秋田', city: '秋田', region: '東北',
    founded: 2004, colors: { primary: '#D4A017', secondary: '#1E5631' },
    finance: { budget: 0 },
    initialRank: 23, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '菅原 康平'
  },
  {
    id: 'hitachi', name: '日立精機ランナーズ', shortName: '日精', city: '日立', region: '関東',
    founded: 1965, colors: { primary: '#A8AEB8', secondary: '#22252B' },
    finance: { budget: 0 },
    initialRank: 24, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '関 洋一'
  },
  {
    id: 'choshi', name: 'ライトハウス銚子', shortName: '銚子', city: '銚子', region: '関東',
    founded: 2009, colors: { primary: '#F5F5F0', secondary: '#C41E3A' },
    finance: { budget: 0 },
    initialRank: 25, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '浜田 修'
  },
  {
    id: 'kushiro', name: '釧路丹頂', shortName: '釧路', city: '釧路', region: '北海道',
    founded: 2013, colors: { primary: '#FFFFFF', secondary: '#2A4B8D' },
    finance: { budget: 0 },
    initialRank: 26, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '工藤 大地'
  },
  {
    id: 'kakegawa', name: '掛川製茶グリーンズ', shortName: '掛川', city: '掛川', region: '中部',
    founded: 2001, colors: { primary: '#7BA05B', secondary: '#EFE7D2' },
    finance: { budget: 0 },
    initialRank: 27, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '杉山 隆'
  },
  {
    id: 'utsunomiya', name: 'サンダーボルト宇都宮', shortName: '宇都', city: '宇都宮', region: '関東',
    founded: 1994, colors: { primary: '#F2C230', secondary: '#3B2E63' },
    finance: { budget: 0 },
    initialRank: 28, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '荒木 亮'
  },
  {
    id: 'onomichi', name: '尾道渡辺重工', shortName: '尾道', city: '尾道', region: '中国',
    founded: 2016, colors: { primary: '#C0392B', secondary: '#4A4A52' },
    finance: { budget: 0 },
    initialRank: 29, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '村上 慎吾'
  },
  {
    id: 'nagaoka', name: '長岡錦鯉AC', shortName: '長岡', city: '長岡', region: '中部',
    founded: 1988, colors: { primary: '#E34F2C', secondary: '#1A1A1A' },
    finance: { budget: 0 },
    initialRank: 30, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '星野 学'
  },
  {
    id: 'matsue', name: '松江松風', shortName: '松江', city: '松江', region: '中国',
    founded: 2007, colors: { primary: '#1E5631', secondary: '#D4A017' },
    finance: { budget: 0 },
    initialRank: 31, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '錦織 亨'
  },
  {
    id: 'kure', name: 'アンカーズ呉', shortName: '呉', city: '呉', region: '中国',
    founded: 1961, colors: { primary: '#1B6CA8', secondary: '#FFFFFF' },
    finance: { budget: 0 },
    initialRank: 32, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '平田 一馬'
  },
  {
    id: 'nara', name: '奈良鹿ノ角クラブ', shortName: '奈良', city: '奈良', region: '関西',
    founded: 2011, colors: { primary: '#8B5A2B', secondary: '#EFE7D2' },
    finance: { budget: 0 },
    initialRank: 33, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '橋本 悠'
  },
  {
    id: 'himeji', name: '姫路白鷺', shortName: '姫路', city: '姫路', region: '関西',
    founded: 1993, colors: { primary: '#FFFFFF', secondary: '#2A3D8F' },
    finance: { budget: 0 },
    initialRank: 34, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '西村 拓也'
  },
  {
    id: 'oita', name: '大分竹和工業', shortName: '大分', city: '大分', region: '九州',
    founded: 2003, colors: { primary: '#6FA349', secondary: '#22252B' },
    finance: { budget: 0 },
    initialRank: 35, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '工藤 誠一'
  },
  {
    id: 'naruto', name: 'AC鳴門', shortName: '鳴門', city: '鳴門', region: '四国',
    founded: 2015, colors: { primary: '#1F4E79', secondary: '#7FC4E8' },
    finance: { budget: 0 },
    initialRank: 36, division: 2,
    draftPicks: [], isPlayerControlled: false, gmName: '三好 健'
  },
]

export const DIVISION3_TEAMS: Team[] = [
  {
    id: 'otsu', name: '大津湖月', shortName: '大津', city: '大津', region: '関西',
    founded: 2018, colors: { primary: '#EFE7D2', secondary: '#26355E' },
    finance: { budget: 0 },
    initialRank: 37, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '伊吹 涼'
  },
  {
    id: 'obihiro', name: '十勝製粉', shortName: '十勝', city: '帯広', region: '北海道',
    founded: 2006, colors: { primary: '#DCB35C', secondary: '#5A3E23' },
    finance: { budget: 0 },
    initialRank: 38, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '南 良太'
  },
  {
    id: 'kusatsu', name: '草津湯けむり走友会', shortName: '草津', city: '草津', region: '関東',
    founded: 2020, colors: { primary: '#FFFFFF', secondary: '#D94A38' },
    finance: { budget: 0 },
    initialRank: 39, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '黒岩 進'
  },
  {
    id: 'hida', name: '飛騨木曽林業', shortName: '飛騨', city: '高山', region: '中部',
    founded: 1999, colors: { primary: '#8B5A2B', secondary: '#EFE7D2' },
    finance: { budget: 0 },
    initialRank: 40, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '古田 智'
  },
  {
    id: 'okazaki', name: 'ホタルバレー岡崎', shortName: '岡崎', city: '岡崎', region: '中部',
    founded: 2012, colors: { primary: '#F2E27A', secondary: '#1E5631' },
    finance: { budget: 0 },
    initialRank: 41, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '浅井 響'
  },
  {
    id: 'hagi', name: '萩石畳クラブ', shortName: '萩', city: '萩', region: '中国',
    founded: 2019, colors: { primary: '#9AA0A6', secondary: '#2B2B30' },
    finance: { budget: 0 },
    initialRank: 42, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '吉田 総一'
  },
  {
    id: 'karatsu', name: 'ウィンドミル唐津', shortName: '唐津', city: '唐津', region: '九州',
    founded: 2014, colors: { primary: '#FFFFFF', secondary: '#6FB7DE' },
    finance: { budget: 0 },
    initialRank: 43, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '副島 岳'
  },
  {
    id: 'yanagawa', name: '柳川水郷', shortName: '柳川', city: '柳川', region: '九州',
    founded: 2017, colors: { primary: '#7FC4E8', secondary: '#FFFFFF' },
    finance: { budget: 0 },
    initialRank: 44, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '立花 翔'
  },
  {
    id: 'wajima', name: '輪島千枚田', shortName: '輪島', city: '輪島', region: '中部',
    founded: 2021, colors: { primary: '#A8C256', secondary: '#8A6E4B' },
    finance: { budget: 0 },
    initialRank: 45, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '中谷 大輔'
  },
  {
    id: 'asahikawa', name: '旭川氷雪', shortName: '旭川', city: '旭川', region: '北海道',
    founded: 2002, colors: { primary: '#FFFFFF', secondary: '#A8CBE8' },
    finance: { budget: 0 },
    initialRank: 46, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '大場 涼太'
  },
  {
    id: 'ito', name: '伊東椿', shortName: '伊東', city: '伊東', region: '中部',
    founded: 2010, colors: { primary: '#C8102E', secondary: '#1E5631' },
    finance: { budget: 0 },
    initialRank: 47, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '稲垣 光'
  },
  {
    id: 'soma', name: '相馬野馬追RC', shortName: '相馬', city: '相馬', region: '東北',
    founded: 1996, colors: { primary: '#5A3E23', secondary: '#EFE7D2' },
    finance: { budget: 0 },
    initialRank: 48, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '佐久間 峻'
  },
  {
    id: 'gifu', name: '岐阜提灯電機', shortName: '岐阜', city: '岐阜', region: '中部',
    founded: 1985, colors: { primary: '#E2452F', secondary: '#22252B' },
    finance: { budget: 0 },
    initialRank: 49, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '各務 隼人'
  },
  {
    id: 'kofu', name: '甲府双嶺', shortName: '甲府', city: '甲府', region: '中部',
    founded: 2008, colors: { primary: '#26355E', secondary: '#FFFFFF' },
    finance: { budget: 0 },
    initialRank: 50, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '望月 諒'
  },
  {
    id: 'kitami', name: 'ベアパウ北見', shortName: '北見', city: '北見', region: '北海道',
    founded: 2022, colors: { primary: '#5A3E23', secondary: '#E8B33C' },
    finance: { budget: 0 },
    initialRank: 51, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '木下 恭平'
  },
  {
    id: 'yonago', name: '米子とんぼ', shortName: '米子', city: '米子', region: '中国',
    founded: 2005, colors: { primary: '#B87333', secondary: '#A8C99A' },
    finance: { budget: 0 },
    initialRank: 52, division: 3,
    draftPicks: [], isPlayerControlled: false, gmName: '田村 拓海'
  },
]

/** 2部・3部の全チーム */
export const LOWER_DIVISION_TEAMS: Team[] = [...DIVISION2_TEAMS, ...DIVISION3_TEAMS]
