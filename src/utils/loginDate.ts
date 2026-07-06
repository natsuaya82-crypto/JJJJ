// ログインボーナスの「今日」キー。朝10時までは前日扱い。
// ローカル日付で統一する（toISOStringのUTCやtoDateStringと混ぜると受け取り判定がズレる）。
export function loginTodayKey(): string {
  const base = new Date()
  if (base.getHours() < 10) base.setDate(base.getDate() - 1)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
}
