// 契約の残り月数の表示。ChatView（選手との会話）と ChatPage（自チーム一覧）の両方が使うので、
// コンポーネントのファイルに置くと react-refresh（Fast Refresh）が効かなくなるためここへ出す。
export function fmtDuration(months: number): string {
  if (months <= 0) return '期限切れ'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}ヶ月`
  if (m === 0) return `${y}年`
  return `${y}年${m}ヶ月`
}
