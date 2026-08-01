// 利用規約への同意を覚えておく場所。
//
// セーブデータ（zustand persist）とは別に localStorage に直接置く。
// データリセットでは消さない（resetGame は決まったキーしか消さないので、そのままでよい）。
// 規約を大きく変えたときは TERMS_VERSION を上げれば、次の起動でもう一度同意画面が出る。

const KEY = 'jpel-terms-agreed'

export const TERMS_VERSION = 1

export const TERMS_URL = 'https://tokinets.com/terms.html'
export const PRIVACY_URL = 'https://tokinets.com/privacy.html'

/** すでに今の版の規約に同意しているか。 */
export function hasAgreedTerms(): boolean {
  try {
    return Number(localStorage.getItem(KEY)) >= TERMS_VERSION
  } catch {
    // localStorage が使えない環境では止めない
    return true
  }
}

/** 同意したことを記録する。 */
export function agreeTerms(): void {
  try {
    localStorage.setItem(KEY, String(TERMS_VERSION))
  } catch {
    /* 保存できなくても先へ進める */
  }
}
