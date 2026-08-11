// 保存済みのチャットログと、いま作り直した「用件の発言」を突き合わせる処理。
//
// もともとは ChatPage の中で、保存済みログに無い発言だけを文字列で見比べて足していた。
// ところが「来シーズンの契約について…残り5ヶ月が気になっています」のように文面に
// 数字が入る発言は、レースを進めるたびに文字列が変わる。その結果、同じ催促が
// 「残り5ヶ月」「残り4ヶ月」「残り3ヶ月」と1行ずつ積み上がり、チャットを開くたびに
// ログが伸び続けていた。
//
// 直し方は、発言に kind（用件の目印）を付けて、
//   ・同じ kind がもうログにある → 増やさずに文面だけ差し替える
//   ・kind が無い発言 → これまで通り文字列で見比べて、無ければ足す
// にすること。返り値は、何も変わらなければ渡された配列をそのまま返す
// （毎回新しい配列を返すと保存が走って無駄な書き込みになるため）。
import type {ChatMessage, Season } from '../types'

export function mergeChatMessages(saved: ChatMessage[], fresh: ChatMessage[]): ChatMessage[] {
  if (saved.length === 0) return fresh
  const known = new Set(saved.map(m => m.kind).filter(Boolean))

  // 同じ用件が既にあるものは、文面だけ最新に差し替える。
  //
  // ★差し替えるのは**その用件のいちばん新しい1件だけ**。
  //   同じ用件はログに2回以上出ることがある（契約交渉を2ラウンドやれば
  //   「年俸5000万で合意できます」「年俸5500万で合意できます」が並ぶ）。
  //   全部を最新の文面で上書きすると、**過去のやりとりが今の金額に書き換わって**
  //   1ラウンド目と2ラウンド目が同じ額に見える。書き換えていいのは最後の1件。
  const lastIndexOfKind = new Map<string, number>()
  saved.forEach((m, i) => { if (m.kind) lastIndexOfKind.set(m.kind, i) })
  const replaced = saved.map((m, i) => {
    if (!m.kind || lastIndexOfKind.get(m.kind) !== i) return m
    const up = fresh.find(f => f.kind === m.kind)
    return up && up.text !== m.text ? { ...m, text: up.text } : m
  })

  const added = fresh.filter(m =>
    !(m.kind && known.has(m.kind))
    && !saved.some(s => s.from === m.from && s.text === m.text))

  const changed = replaced.some((m, i) => m !== saved[i])
  if (added.length === 0) return changed ? replaced : saved
  return [...replaced, ...added]
}

/**
 * チャットの履歴に発言を足す。**store 側から会話に書き込むのはここだけ。**
 *
 * 画面（ChatPage）は自分で会話を組み立てて setChatLog で丸ごと保存するが、
 * レース進行の中で起きたこと（売却の決着など）は画面が開いていないので、
 * 進行側から会話に書いておかないと**GMには何も伝わらない**。
 * 実際、「譲ります」と返事をしてレースを進めても、成立したのか流れたのかが
 * 会話にも通知にも出ず、次の打診だけが来る状態になっていた。
 */
export function appendChatLog(season: Season, playerId: string, ...msgs: ChatMessage[]): Season {
  const logs = season.chatLogs ?? {}
  return { ...season, chatLogs: { ...logs, [playerId]: [...(logs[playerId] ?? []), ...msgs].slice(-60) } }
}
