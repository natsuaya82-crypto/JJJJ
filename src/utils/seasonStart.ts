import { ROSTER_MIN } from '../data/rosterRules'

/**
 * **開幕してよいか。プレシーズンの残り仕事の唯一の決まり。**
 *
 * ■なぜ要るのか（オーナー・2026-08-14）
 *   「シーズン開始した後に予定表見て戻ったらドラフト自体がスキップされたんだけどなんで？」
 *   「スキップを可能にしたことは今までで一度もないが？」
 *
 *   **ドラフトを飛ばせる形は、オーナーが決めたものではありません。** 2つの変更が重なって
 *   できていました。
 *
 *   | いつ | 何が起きたか |
 *   |---|---|
 *   | 2026-07-15 `872ca32` | 「役割の選択・表示UIを非表示化」のコミットで**プレシーズンの塊がまるごと書き直され**、準備が残っていても押せるボタンと「スキップも可能です」の文が入った。役割UIの話とは関係がない |
 *   | 2026-08-13 `0a62e14` | ホームの見た目を寄せたとき、3つに描き分けていたボタンを1つに統合し、**分岐を `rosterShort` だけに潰した**。灰色だった「準備が残っている」状態が金のままになり、唯一の目印も消えた |
 *
 *   開幕を押すと `/schedule`（予定表）へ飛びます。**ドラフトは1年に1度きり**で、
 *   `endSeason` が `draftState` を null にしたあとなので、開幕してしまうとその年の
 *   ドラフトは二度と開けません。「予定表を見て戻ったらスキップされていた」のはこれです。
 *
 * ■**開幕を止めるのは「あとで取り返せないもの」だけ**にすること
 *   ドラフト（1年に1度・指名権が消える）と、人数（走れない）。
 *   並べ替えや作戦のような、開幕後でもできることを足さないこと。
 *
 * ★プレシーズンのカード（`campBonus`）は**止めていません**。受け取り損ねは起きますが、
 *   止めるかどうかはオーナー判断なので、こちらでは決めないでおきます。
 */
export type PreSeasonState = {
  /** その年のドラフトを終えたか（1年目は無いので true） */
  draftDone: boolean
  /** 在籍人数（1軍・2軍あわせて） */
  rosterCount: number
}

/** 人数が足りているか。線は `data/rosterRules` の `ROSTER_MIN` 1本 */
export function rosterShortFor(rosterCount: number): boolean {
  return rosterCount < ROSTER_MIN
}

/**
 * 開幕を止めている用件。**空なら開幕してよい。**
 * 画面はこの文言をそのまま出すこと（「なぜ押せないか」を必ず見せるため）。
 */
export function seasonStartBlockers(s: PreSeasonState): string[] {
  const out: string[] = []
  if (rosterShortFor(s.rosterCount)) {
    out.push(`ロスターが下限（${ROSTER_MIN}人）未満です（現在${s.rosterCount}人）。ドラフト・移籍で人数を確保してください`)
  }
  if (!s.draftDone) out.push('ドラフトがまだです。ドラフトは1年に1度きりで、開幕すると今年は開けません')
  return out
}

/** 開幕してよいか */
export function canStartSeason(s: PreSeasonState): boolean {
  return seasonStartBlockers(s).length === 0
}
