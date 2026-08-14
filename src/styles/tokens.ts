/* Design tokens — JS 側で inline style に使う定数 */

export const C = {
  bg:        '#0a1729',
  surface:   '#0f1f38',
  surface2:  '#1a2c47',
  surface3:  '#243a5a',
  border:    '#1a3252',
  border2:   '#1e3a5c',
  border3:   '#2a4a6a',
  text:      '#ffffff',
  textSub:   '#c8d4e3',
  textDim:   '#a7b6c9',
  textGhost: '#7387a3',
  gold:      '#f5c842',
  goldHi:    '#ffe082',
  goldDark:  '#b8860b',
  red:       '#ff4757',
  green:     '#2ecc71',
  blue:      '#7986CB',
  cyan:      '#5ed4ff',
  orange:    '#FF9800',
  pink:      '#EC407A',
  purple:    '#A855F7',  // 世界選手権（プレステージ枠）
  purpleDark:'#6D28D9',
} as const

// ★角の丸みを配る `R`（sm/md/lg/xl/full）は**廃止**しました。復活させないこと。
//   角丸はアプリ全体でやめています（オーナー・2026-08-13「角丸全部やめて」）。
//   丸いままにするのは「丸いことに意味がある物」だけ——顔・ロゴ・状態の点（`50%`）。
//   `npm run check` の ui-tokens ⑧ が、画面に borderRadius を書いたら落とします。

/**
 * **文字の大きさ。画面で数字を書かないこと。**
 *
 * 実測で **1368件・31種類**（7px〜96px）に割れていた。8〜24px のあいだだけで
 * 11・13・15・17・19・21・22 が混ざっていて、「小さい字を少し大きく」と決めても
 * どれを触ればいいか分からない形だった。
 *
 * ★段は**いま実際に使われている値**から作ってある（数を勝手に動かさないため）。
 *   `1px も見た目は変わらない`のが原則で、例外は 7 / 17 / 19 / 21px の34件だけ
 *   （段に無いので隣へ寄せた。すべて1px）。
 * ★**25px 以上は段にしない。** 予算の44px・タイムの96px のような
 *   「その画面の見せ場の数字」で、揃える対象ではない（角丸で複数指定を
 *   段の話にしなかったのと同じ）。
 */
export const F = {
  /** 8px 補助の注記 */      micro:   8,
  /** 9px 小さな注記 */      tiny:    9,
  /** 10px 見出しの英字・単位 */ caption: 10,
  /** 11px ラベル */          label:   11,
  /** 12px 本文 */            body:    12,
  /** 13px 本文（大） */       bodyLg:  13,
  /** 14px 小見出し */         sub:     14,
  /** 15px 小見出し（大） */    subLg:   15,
  /** 16px 見出し */           title:   16,
  /** 18px 見出し（大） */      titleLg: 18,
  /** 20px 大見出し */         head:    20,
  /** 22px 大見出し（大） */    headLg:  22,
  /** 24px 特大 */            hero:    24,
} as const

export type Competition = 'jpel' | 'reserve' | 'ecl' | 'world' | 'friend'
export const COMPETITION_BTN: Record<Competition, string> = {
  jpel:    'btn-game--gold',
  reserve: 'btn-game--blue',
  ecl:     'btn-game--red',
  world:   'btn-game--purple',
  friend:  'btn-game--gold',   // フレンド対戦。現状の既定色を維持（見た目を変えない）
}

// 順位の色の「唯一の決まり」。
//
// 金・銀・銅の色分けが画面ごとに違うルールで4通り手書きされていた
// （PlayerSheet.tsx の中だけでも2つのルールが混在）。レース結果・順位表・
// オンライン対戦の3画面で使われていた式（一番数が多い）をここに集約する。
/** 順位(1始まり) → 色。1位=金 / 2位=銀 / 3位=銅 / 4位以下=薄いグレー。 */
export function rankColor(rank: number): string {
  if (rank === 1) return C.gold
  if (rank === 2) return '#9B97A8'
  if (rank === 3) return '#CD7F32'
  return C.textGhost
}

/**
 * 色に透け具合を足す。#rgb（3桁）でも #rrggbb（6桁）でも受け取れる。
 *
 * 3桁のまま末尾をくっつけると #000 + 4d = #0004d という5桁になり、
 * 色として無効になる。無効な色を入れても画面は前の色を残すので、
 * 「一度黄色くなったボタンが、選び直しても黄色いまま」になっていた。
 * 3桁のときは先に6桁へ伸ばしてからくっつける。
 */
export const alpha = (hex: string, a: number) => {
  const h = /^#[0-9a-fA-F]{3}$/.test(hex)
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex
  const n = Math.round(a * 255).toString(16).padStart(2, '0')
  return `${h}${n}`
}

// ── フォント ────────────────────────────────────────────────
//
// 同じフォント指定を画面ごとに `const SAIRA = ...` と書いていて、実測で93ファイルにあった。
// フォントを差し替えるときに93か所を直すことになるので、ここ1本にする。
// FONT も3ファイルにあり、空白の入れ方だけが違っていた。

/** 数字・英字用。順位・タイム・金額など「数える」ものに使う */
export const SAIRA = "'Saira Condensed', system-ui, sans-serif"
/** 日本語の本文用 */
export const FONT = "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif"
/** 日本語（Noto 指定のもの。規約画面など） */
export const JP = "'Noto Sans JP', system-ui, sans-serif"

/** 絞り込みの <select> の見た目。カードの一覧と選択で同じものを使う */
export const SELECT_STYLE = {
  padding: '6px 28px 6px 10px',
  background: C.surface2, border: `1px solid ${C.border}`,
  color: C.textSub, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
  appearance: 'none' as const, WebkitAppearance: 'none' as const,
}

/**
 * **画面の左右の余白。**
 *
 * ホームだけで 12px（カード）と 18px（見出しの帯・CLUB・NEWS）が混ざっていて、
 * 縦に並べたときに左端が6pxずれて見えていた（オーナー・2026-08-14「ここがずれてる」）。
 * 同じページの中で2つ持たないこと。
 *
 * ★アプリ全体ではまだ 12 / 14 / 16 / 18 / 20 の5通りある（docs/BACKLOG.md U-13）。
 *   ここはホームを揃えるために置いた1本目で、揃える範囲を広げるのはオーナー判断。
 */
export const PAGE_X = 12

/** ヘッダーが画面の上から占める高さ（浮かせたぶん＋ヘッダーの背）。
 *  Layout のヘッダーと、その下から始める画面が同じ値を使う。
 *  ★ヘッダーは中身なりの高さで、この数はそれに**合わせる**もの（先に決める数ではない）。
 *    49 のままヘッダーだけ背が伸びていたので、**全画面の上から16pxがヘッダーの裏**に
 *    入っていた（実測 64.6px）。見出しの英字が上半分だけ欠けて見えていたのがこれ。
 *    ヘッダーの中身を変えたら、実際の高さを測ってここを直すこと。
 *  ★2026-08-14 に実際に描かせて測ったら **48px** だった（面をガラスにして下線をやめた形）。
 *    この少し前に「実測 64.6px」として 65 にしていたが、それが間違いで、
 *    **全画面の中身が16px下がって狭くなっていた**（オーナー・2026-08-14「ぜってぇ狭くなった」）。
 *    測り直したものが正。ヘッダーの中身を変えたら、また実際に測ってここを直すこと。 */
export const HEADER_H = 48

/**
 * **画面下の広告バナーの高さ。買い切り版（`adsRemoved`）なら0。**
 *
 * ★数字はここ1つ。**画面で `adsRemoved ? 0 : 50` と書かないこと**——
 *   実測で `Layout` の `AD_H`・`index.css` の `--ad-h`・`Onboarding` の直書きと
 *   3か所にあり、さらに `LoanSheet` / `BidSheet` が「広告＋下タブ」のつもりで
 *   `adH + 50` と書いていた（下タブは 58＋浮き20＝78 なので **28px 足りない**）。
 * ★出し分けは `components/layout/Layout` の `useAdHeight()` 1本を呼ぶこと。
 */
export const AD_H = 50

/** 下タブの高さ。Layout の下タブと、その上に何かを置く画面が同じ値を使う */
export const NAV_H = 58

/** 下タブを画面の下端から浮かせる量（上下に1つずつ空く） */
export const NAV_FLOAT = 10

/** main の下端に足している余白（下タブとの隙間） */
export const MAIN_GAP = 6

/**
 * 選手カード同士のあき。**11画面の一覧が3通りに割れていたのを1本に**
 * （components/player/PlayerList.tsx が使う唯一の場所。画面で gap を書かないこと）
 */
export const PLAYER_CARD_GAP = 8

/**
 * **下タブが画面の下から占める高さ。この足し算はここ1本。**
 *
 * 下タブは「浮かせたガラス」なので、高さ（NAV_H）だけでは足りず、上下の浮き
 * （NAV_FLOAT × 2）も要る。以前は `NAV_H + NAV_FLOAT * 2` が3か所に手書きされていて、
 * **浮かせる変更に2か所が追随せず20pxずれていた**（FriendClubPage / LoginBonusPage）。
 */
export const NAV_STACK = NAV_H + NAV_FLOAT * 2

/**
 * 画面の一番下に貼り付けるものの `bottom`。**この足し算はここ1本。**
 *
 * 広告バナーの高さ（adH。買い切り版は0）とセーフエリアを足す。下タブの上に置きたいときは
 * `aboveNav` を true にする。`calc(${adH + 58}px + env(safe-area-inset-bottom))` という
 * 同じ式が8ファイル13か所に手書きされていて、58（下タブの高さ）も直書きされていた。
 *
 * ★画面下から**出てくるシート**はこれを使わず BottomSheet を通すこと（実機で下タブに食われる）。
 *   ここは「その場に居座る固定バー」用。
 */
export function bottomStack(adH: number, opts?: { aboveNav?: boolean; extra?: number }): string {
  const px = adH + (opts?.aboveNav ? NAV_STACK : 0) + (opts?.extra ?? 0)
  return `calc(${px}px + env(safe-area-inset-bottom))`
}

/**
 * **`<main>` の中で下端に貼り付けるものの下余白。**
 *
 * `<main>` は `bottom: bottomStack(adH)` なので、**広告帯とセーフエリアの上まで**しか
 * ありません。ところが下タブは「浮かせたガラス」で main の上に重なるので、
 * `position: absolute; inset: 0` で main いっぱいに広げた画面は下タブの裏まで伸びます。
 * その画面の下端に置くバーは、このぶんだけ持ち上げること。
 *
 * ★**`bottomStack` を main の中で使わないこと。** あちらは「画面（viewport）の下端から」の
 *   位置なので、main の中で使うと広告とセーフエリアを**二重に数えます**（実測で128px浮いた）。
 *   カード合成と「カードを選ぶ」の決定ボタンは、逆に何も足していなくて
 *   **下タブの裏に潜っていました**（オーナー・2026-08-14「決定ボタンの位置おかしくなってる」）。
 */
export function insideMainBottom(extra = 0): number {
  return NAV_STACK + MAIN_GAP + extra
}

/**
 * ヘッダーと下タブと広告を除いた、**中身が実際に使える高さ**。
 *
 * main は `position: fixed` で上下を留めているので、ページで `100dvh` を使うと
 * その3つのぶんだけ縦に溢れて無駄なスクロールが生まれる。
 *
 * ★`HEADER_H + NAV_H + ...` を画面で手書きしないこと。下タブの見た目を変えたときに
 *   書いた場所だけ取り残される（実際に20pxずれた）。
 */
export function contentHeight(adH: number, extra = 0): string {
  const px = HEADER_H + NAV_STACK + MAIN_GAP + adH + extra
  return `calc(100dvh - ${px}px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))`
}

/** 記録会（タイムトライアル）の色 */
export const TT_COLOR = '#5EC8B8'
/** 完全休養カードの色 */
export const REST_ACCENT = '#5EC8B8'
/** マイプレイヤー・合成まわりの紫 */
export const PURPLE = '#A855F7'

/**
 * **部ごとの★の色。**1部＝金／2部＝銀／3部＝銅。
 *
 *   > 全部部ごとに決まってるやろ（オーナー・2026-08-12）
 *
 * 優勝の★を部で分けるときは必ずここから引く（画面ごとに色を決めない）。
 * キーは Division だが、tokens が types に依存しないよう数値で持つ。
 */
export const DIV_STAR: Record<number, string> = { 1: C.gold, 2: '#9FB4CC', 3: '#7A6E58' }
