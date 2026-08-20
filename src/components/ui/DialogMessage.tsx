import { C, F } from '../../styles/tokens'

/**
 * **ダイアログの本文。「。」で改行する。**
 *
 * 1行に続けて書くと読みにくいので、文の切れ目で折る
 * （オーナー・2026-08-20「。で改行したほうが見やすいと思う」）。
 *
 * ★**確認とお知らせの2つが同じここを通ること。** 片方だけ折ると、同じ文面でも
 *   出す場所によって見え方が変わる。
 * ★`\n` で明示的に改行してもよい（そこも1行として扱う）。
 */
export default function DialogMessage({ text, style }: { text: string; style?: React.CSSProperties }) {
  // 「。」は行末に残す。改行だけの行は作らない
  const lines = text
    .split('\n')
    .flatMap(part => part.split(/(?<=。)/))
    .map(s => s.trim())
    .filter(Boolean)
  return (
    <div style={{ fontSize: F.body, color: C.textSub, lineHeight: 1.6, ...style }}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}
